-- Room phones mark the deciding words of a stem, a reveal and a takeaway, and ask which reply is better on a
-- spoken-reply question. Solo phones have done both in-page since c35a931 and 466fd6c. Room phones could not,
-- because vof_relay.valid_public_question and vof_relay.valid_reveal refuse any key they do not list, so a room
-- state carrying one would be refused whole and the room would stall.
--
-- This migration replaces only those two functions (create or replace, same signatures) and adds one helper,
-- vof_relay.valid_phrase_list(jsonb). It does not touch valid_room_state, valid_showdown, valid_attendee_state,
-- valid_client_message, public.vof_relay_exchange or anything else in vof_relay. A Showdown question is covered
-- without a change of its own, because valid_showdown already checks its question with valid_public_question.
--
-- Every new key is optional. Each one is added to allowed only, and required stays exactly as it was:
--   - questionData.emphasis: the stem's authored phrases (Question.emphasis).
--   - questionData.reply: true when the choices are spoken replies.
--   - reveal.explanationEmphasis and reveal.takeawayEmphasis: the reveal's and the takeaway's phrases.
--   - reveal.takeawayLineEmphasis: the closing recap's phrases, one list per newline-separated takeaway line.
-- A phrase list is an array of at most 8 strings of 1 to 128 characters. The shipped bank peaks at 2 phrases of 32
-- characters. The closing's list of lists holds at most 16 lines, and the recap sends 3. src/network/emphasis-bound.ts
-- (read by src/network/guards.ts) and server/room-relay.mjs hold the same numbers, and
-- tests/integration/production-relay-db.test.mjs proves all three surfaces agree at every edge.
--
-- Order: old hosts never send these keys, and every state already stored still validates, so applying this migration
-- alone is always safe. The reverse is not. A host that sends the keys before this migration is live has every such
-- room state refused. This migration goes first, and the release that sends the keys follows it.
--
-- Safety carried forward from 20260926150000: the ownership guard below aborts the whole apply, with nothing changed,
-- unless current_user owns both replaced functions, and set local lock_timeout = '3s' bounds how long each replace
-- can queue behind live traffic. Apply it inside one transaction (psql -1, or Supabase's apply_migration), because
-- SET LOCAL has no effect outside a transaction block. The rollback is
-- supabase/migrations-rollback/20260929140000_vax_or_fiction_production_relay_emphasis_reply_rollback.sql.

set local lock_timeout = '3s';

do $ownership_guard$
declare
  v_function regprocedure;
  v_owner text;
begin
  foreach v_function in array array['vof_relay.valid_public_question(jsonb)'::regprocedure, 'vof_relay.valid_reveal(jsonb)'::regprocedure] loop
    select pg_catalog.pg_get_userbyid(p.proowner) into v_owner
      from pg_catalog.pg_proc p where p.oid = v_function;
    if current_user is distinct from v_owner then
      raise exception 'This migration must be applied as the owner of % (owner %). Currently connected as %.',
        v_function, coalesce(v_owner, 'unknown'), current_user;
    end if;
  end loop;
end
$ownership_guard$;

create function vof_relay.valid_phrase_list(value jsonb)
returns boolean
language plpgsql
immutable
security invoker
set search_path = pg_catalog
as $$
#variable_conflict use_column
declare
  item jsonb;
begin
  if value is null or jsonb_typeof(value) <> 'array' then return false; end if;
  if jsonb_array_length(value) > 8 then return false; end if;
  for item in select value from jsonb_array_elements(value) loop
    if jsonb_typeof(item) <> 'string' or char_length(item #>> '{}') not between 1 and 128 then return false; end if;
  end loop;
  return true;
end;
$$;

create or replace function vof_relay.valid_public_question(value jsonb)
returns boolean
language plpgsql
immutable
security invoker
set search_path = pg_catalog
as $$
#variable_conflict use_column
declare
  item jsonb;
begin
  if vof_relay.has_only_keys(
    value,
    array['id','questionInstanceId','kind','statement','number','total','options','steps','unit','reply','emphasis'],
    array['id','questionInstanceId','kind','statement','number','total','options']
  ) is not true then return false; end if;
  if coalesce((vof_relay.is_wire_id(value->>'id') is not true
    or vof_relay.is_session_id(value->>'questionInstanceId') is not true
    or value->>'kind' not in ('binary','myth-among-three','estimate','order','which-patient')
    or jsonb_typeof(value->'statement') <> 'string'
    or char_length(value->>'statement') > 4096
    or vof_relay.is_nonnegative_integer(value->'number') is not true
    or vof_relay.is_nonnegative_integer(value->'total') is not true
    or jsonb_typeof(value->'options') <> 'array'
    or jsonb_array_length(value->'options') > 6), true) then return false; end if;
  for item in select value from jsonb_array_elements(value->'options') loop
    if coalesce((vof_relay.has_only_keys(item, array['token','label','text','min','max'], array['token','label','text']) is not true
      or vof_relay.is_wire_id(item->>'token') is not true
      or jsonb_typeof(item->'label') <> 'string'
      or char_length(item->>'label') > 256
      or jsonb_typeof(item->'text') <> 'string'
      or char_length(item->>'text') > 4096
      or (item ? 'min' and jsonb_typeof(item->'min') <> 'number')
      or (item ? 'max' and jsonb_typeof(item->'max') <> 'number')), true) then return false; end if;
  end loop;
  if value ? 'steps' then
    if jsonb_typeof(value->'steps') <> 'array' or jsonb_array_length(value->'steps') > 6 then return false; end if;
    for item in select value from jsonb_array_elements(value->'steps') loop
      if coalesce((vof_relay.has_only_keys(item, array['token','text'], array['token','text']) is not true
        or vof_relay.is_wire_id(item->>'token') is not true
        or jsonb_typeof(item->'text') <> 'string'
        or char_length(item->>'text') > 4096), true) then return false; end if;
    end loop;
  end if;
  -- The two optional keys this migration adds. Both are checked only when present.
  if value ? 'reply' and jsonb_typeof(value->'reply') <> 'boolean' then return false; end if;
  if value ? 'emphasis' and vof_relay.valid_phrase_list(value->'emphasis') is not true then return false; end if;
  return coalesce(not (value ? 'unit') or (jsonb_typeof(value->'unit') = 'string' and char_length(value->>'unit') <= 64), false);
end;
$$;

create or replace function vof_relay.valid_reveal(value jsonb)
returns boolean
language plpgsql
immutable
security invoker
set search_path = pg_catalog
as $$
#variable_conflict use_column
declare
  item jsonb;
begin
  if coalesce((vof_relay.has_only_keys(value, array['answerLabel','answerToken','explanation','takeaway','citations','explanationEmphasis','takeawayEmphasis','takeawayLineEmphasis'], array['answerLabel','answerToken','explanation','takeaway','citations']) is not true
    or jsonb_typeof(value->'answerLabel') <> 'string' or char_length(value->>'answerLabel') > 4096
    or jsonb_typeof(value->'answerToken') <> 'string' or char_length(value->>'answerToken') > 256
    or jsonb_typeof(value->'explanation') <> 'string' or char_length(value->>'explanation') > 16384
    or jsonb_typeof(value->'takeaway') <> 'string' or char_length(value->>'takeaway') > 8192
    or jsonb_typeof(value->'citations') <> 'array' or jsonb_array_length(value->'citations') > 24), true) then return false; end if;
  for item in select value from jsonb_array_elements(value->'citations') loop
    if coalesce((vof_relay.has_only_keys(item, array['label','url'], array['label']) is not true
      or jsonb_typeof(item->'label') <> 'string' or char_length(item->>'label') > 1024
      or (item ? 'url' and (jsonb_typeof(item->'url') <> 'string' or char_length(item->>'url') > 4096 or item->>'url' !~ '^https?://'))), true) then return false; end if;
  end loop;
  -- The three optional keys this migration adds. Each is checked only when present.
  if value ? 'explanationEmphasis' and vof_relay.valid_phrase_list(value->'explanationEmphasis') is not true then return false; end if;
  if value ? 'takeawayEmphasis' and vof_relay.valid_phrase_list(value->'takeawayEmphasis') is not true then return false; end if;
  if value ? 'takeawayLineEmphasis' then
    if jsonb_typeof(value->'takeawayLineEmphasis') <> 'array' or jsonb_array_length(value->'takeawayLineEmphasis') > 16 then return false; end if;
    for item in select value from jsonb_array_elements(value->'takeawayLineEmphasis') loop
      if vof_relay.valid_phrase_list(item) is not true then return false; end if;
    end loop;
  end if;
  return true;
end;
$$;

revoke all on function vof_relay.valid_phrase_list(jsonb) from public, anon, authenticated;
