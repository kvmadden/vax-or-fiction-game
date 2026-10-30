-- Rollback for 20260929140000_vax_or_fiction_production_relay_emphasis_reply.sql
--
-- Manual-apply only. Do NOT copy this file into supabase/migrations/: every .sql file in that directory is applied
-- forward in filename order, so an undo script placed there would auto-apply on the next `supabase db push` and
-- revert the change at once.
--
-- Apply by hand, against the real project, only if the widening itself has to come out (for example it accepts or
-- refuses a room state it should not, and there is no time to fix it forward first):
--   psql "$DATABASE_URL" -1 -v ON_ERROR_STOP=1 -f supabase/migrations-rollback/20260929140000_vax_or_fiction_production_relay_emphasis_reply_rollback.sql
--
-- Before applying it, pull every client that sends the new keys (emphasis, reply, explanationEmphasis,
-- takeawayEmphasis, takeawayLineEmphasis) back to a release that does not, or live rooms stall the moment this lands.
--
-- It restores vof_relay.valid_public_question(jsonb) and vof_relay.valid_reveal(jsonb) to the exact bodies they had
-- immediately before 20260929140000 (the bodies 20260913170036 first defined, since no migration in between touched
-- either function), then drops vof_relay.valid_phrase_list(jsonb), which only those two new bodies call. It touches
-- nothing else in vof_relay.
--
-- Live fingerprints, md5(prosrc):length(prosrc). Before the apply (read at 13:09:50 UTC), equal to 20260913170036:
--   valid_public_question  1ea8980f0a4bfb6d9d6874a1d4e77b9b:2225
--   valid_reveal           d9dc144978edb75b929cc28040abbaf6:1251
-- After the apply, equal to the bodies in 20260929140000:
--   valid_public_question  cd3b0ec11677a7972906c89a5bd4e244:2536
--   valid_reveal           49900a212d3fa6d75f2be344b4af3b4a:2051
--   valid_phrase_list      cb58706e1a7a2dd17cfae42d83dc95f5:415 (new)
-- All three read back owned by postgres with acl {postgres=X/postgres} (no anon or authenticated execute), immutable,
-- security invoker, search_path=pg_catalog. valid_room_state judged seven states on live after the apply exactly as
-- tests/integration/production-relay-db.test.mjs does (new keys accepted, the old shape accepted, bad shapes refused).
--
-- The record above holds the live fingerprints taken twice: before the forward apply (the bodies this file restores,
-- checked against 20260913170036 before anything changed) and after it. Before applying this rollback, read the live
-- fingerprints again and compare them with the record's after values:
--   select p.oid::regprocedure, md5(prosrc), length(prosrc) from pg_proc p
--     where p.oid in ('vof_relay.valid_public_question(jsonb)'::regprocedure, 'vof_relay.valid_reveal(jsonb)'::regprocedure);
-- After it, the same query must return the record's before values, which proves an exact revert and not merely a
-- plausible one, and to_regprocedure('vof_relay.valid_phrase_list(jsonb)') must be null.
--
-- After a manual rollback, also delete this migration's row from supabase_migrations.schema_migrations by hand, so the
-- recorded history matches the schema. Read that table's live row before assuming its version, and never guess it.
--
-- Apply with `psql -1` (or inside a transaction wrapper): the set local lock_timeout below has no effect outside a
-- transaction block, and a plain `psql -f` runs each statement as its own autocommitted transaction.

set local lock_timeout = '3s';

do $ownership_guard$
declare
  v_function regprocedure;
  v_owner text;
begin
  foreach v_function in array array['vof_relay.valid_public_question(jsonb)'::regprocedure, 'vof_relay.valid_reveal(jsonb)'::regprocedure, 'vof_relay.valid_phrase_list(jsonb)'::regprocedure] loop
    select pg_catalog.pg_get_userbyid(p.proowner) into v_owner
      from pg_catalog.pg_proc p where p.oid = v_function;
    if current_user is distinct from v_owner then
      raise exception 'This rollback must be applied as the owner of % (owner %). Currently connected as %.',
        v_function, coalesce(v_owner, 'unknown'), current_user;
    end if;
  end loop;
end
$ownership_guard$;

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
    array['id','questionInstanceId','kind','statement','number','total','options','steps','unit'],
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
  if coalesce((vof_relay.has_only_keys(value, array['answerLabel','answerToken','explanation','takeaway','citations'], array['answerLabel','answerToken','explanation','takeaway','citations']) is not true
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
  return true;
end;
$$;

drop function vof_relay.valid_phrase_list(jsonb);
