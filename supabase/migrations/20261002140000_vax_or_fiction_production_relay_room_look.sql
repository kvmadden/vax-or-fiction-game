-- Room phones follow the host's show look and its topic pattern switch (VOF-93 and VOF-94). The host picks one of the
-- four looks in setup and can turn topic patterns off. Phones could not follow either, because
-- vof_relay.valid_room_state refuses any key it does not list, so a room state carrying one would be refused whole and
-- the room would stall. A host whose relay refuses its first state with the keys takes them off and publishes plain
-- states (src/network/host-live-link.ts), and every phone then shows Today with patterns on.
--
-- This migration replaces only vof_relay.valid_room_state (create or replace, same signature). It does not touch
-- valid_public_question, valid_reveal, valid_showdown, valid_attendee_state, valid_client_message,
-- public.vof_relay_exchange or anything else in vof_relay. The function body is the one 20260915005736 defined, which
-- no later migration changed, with two optional keys added.
--
-- Both new keys are optional. Each is added to allowed only, and required stays exactly the 19 keys it was:
--   - look: a look id, a lowercase slug of 1 to 24 characters (letters, digits and hyphens, starting with a letter).
--     The relay does not list the four looks, so a look added later needs no second migration. A phone that does not
--     know the id shows Today, which is the same as a phone that never got the key.
--   - patterns: true or false, whether topic patterns draw behind the questions.
-- src/network/guards.ts (the phone's own check) and server/room-relay.mjs (the dev relay) hold the same two rules, and
-- tests/integration/production-relay-db.test.mjs runs every case through all three to prove they agree.
--
-- Order, the same as VOF-84. Old hosts never send these keys, and every state already stored still validates, so
-- applying this migration alone is always safe. This migration goes first, and the release that sends the keys follows
-- it with no live room, because a phone tab opened on an older build refuses a state with a key it does not know. A new
-- host build that reaches the relay before this migration does not stall its room: the relay refuses the first state
-- with the keys, and the host goes on with plain states (the keys come back on its next reconnect).
--
-- Apply and verify, as the owner of the function (postgres), inside one transaction, with no live room:
--   1. Read the fingerprint before. It must read valid_room_state=e7f684a187512f57f45f66440e29cf65:3289, the body
--      20260915005736 defined. If it does not, stop: this migration replaces a body it has not seen.
--        select p.proname || '=' || md5(p.prosrc) || ':' || length(p.prosrc) from pg_proc p
--          where p.oid = 'vof_relay.valid_room_state(jsonb, text, bigint)'::regprocedure;
--   2. Apply this file (Supabase apply_migration, or psql -1 -v ON_ERROR_STOP=1 -f).
--   3. Read the fingerprint again. It must read valid_room_state=1616a6bd93d0143349cfa1938789a219:3629. The owner and the
--      acl (postgres only, no anon or authenticated execute) must read as they did before.
--   4. Run the probe in supabase/migrations-rollback/20261002140000_vax_or_fiction_production_relay_room_look_rollback.sql:
--      a plain state and a state with the keys must both read true, a look that is not a slug and a key the relay does
--      not know must both read false.
--
-- Safety carried forward from 20260929140000: the ownership guard below aborts the whole apply, with nothing changed,
-- unless current_user owns vof_relay.valid_room_state, and set local lock_timeout = '3s' bounds how long the replace can
-- queue behind live traffic. Apply it inside one transaction (psql -1, or Supabase's apply_migration), because SET
-- LOCAL has no effect outside a transaction block. The rollback is
-- supabase/migrations-rollback/20261002140000_vax_or_fiction_production_relay_room_look_rollback.sql.

set local lock_timeout = '3s';

do $ownership_guard$
declare
  v_function regprocedure := 'vof_relay.valid_room_state(jsonb, text, bigint)'::regprocedure;
  v_owner text;
begin
  select pg_catalog.pg_get_userbyid(p.proowner) into v_owner
    from pg_catalog.pg_proc p where p.oid = v_function;
  if current_user is distinct from v_owner then
    raise exception 'This migration must be applied as the owner of % (owner %). Currently connected as %.',
      v_function, coalesce(v_owner, 'unknown'), current_user;
  end if;
end
$ownership_guard$;

create or replace function vof_relay.valid_room_state(value jsonb, expected_room_id text, previous_revision bigint)
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
  if coalesce((vof_relay.json_is_safe(value) is not true
    or vof_relay.has_only_keys(
      value,
      array['version','roomId','sessionId','revision','phase','slideIndex','slideCount','question','questionData','reveal','votesLocked','timerSeconds','timerDurationSeconds','timerRunning','participants','teamScores','leaderboard','showdown','hostConnected','look','patterns'],
      array['version','roomId','sessionId','revision','phase','slideIndex','slideCount','question','questionData','reveal','votesLocked','timerSeconds','timerDurationSeconds','timerRunning','participants','teamScores','leaderboard','showdown','hostConnected']
    ) is not true
    or value->'version' is distinct from '1'::jsonb
    or value->>'roomId' is distinct from expected_room_id
    or vof_relay.is_session_id(value->>'sessionId') is not true
    or vof_relay.is_nonnegative_integer(value->'revision') is not true
    or (value->>'revision')::bigint <= previous_revision
    or jsonb_typeof(value->'phase') <> 'string' or char_length(value->>'phase') > 32
    or vof_relay.is_slide_index(value->'slideIndex') is not true
    or vof_relay.is_nonnegative_integer(value->'slideCount') is not true
    or (jsonb_typeof(value->'question') <> 'null' and (jsonb_typeof(value->'question') <> 'string' or char_length(value->>'question') > 64))
    or (jsonb_typeof(value->'questionData') <> 'null' and vof_relay.valid_public_question(value->'questionData') is not true)
    or jsonb_typeof(value->'votesLocked') <> 'boolean'
    or vof_relay.is_nonnegative_integer(value->'timerSeconds') is not true
    or vof_relay.is_nonnegative_integer(value->'timerDurationSeconds') is not true
    or jsonb_typeof(value->'timerRunning') <> 'boolean'
    or vof_relay.is_nonnegative_integer(value->'participants') is not true
    or jsonb_typeof(value->'leaderboard') <> 'array' or jsonb_array_length(value->'leaderboard') > 250
    or jsonb_typeof(value->'hostConnected') <> 'boolean'), true) then return false; end if;
  -- The two optional keys this migration adds. Each is checked only when present.
  if value ? 'look' and (jsonb_typeof(value->'look') <> 'string' or value->>'look' !~ '^[a-z][a-z0-9-]{0,23}$') then return false; end if;
  if value ? 'patterns' and jsonb_typeof(value->'patterns') <> 'boolean' then return false; end if;
  if jsonb_typeof(value->'reveal') <> 'null'
    and (value->>'phase' not in ('revealed','explaining','closing') or vof_relay.valid_reveal(value->'reveal') is not true) then return false; end if;
  if jsonb_typeof(value->'teamScores') <> 'null' then
    if vof_relay.has_only_keys(value->'teamScores', array['NAVY','GOLD'], array['NAVY','GOLD']) is not true
      or vof_relay.is_nonnegative_integer(value->'teamScores'->'NAVY') is not true
      or vof_relay.is_nonnegative_integer(value->'teamScores'->'GOLD') is not true then return false; end if;
  end if;
  for item in select value from jsonb_array_elements(value->'leaderboard') loop
    if coalesce((vof_relay.has_only_keys(item, array['name','score','rank','team'], array['name','score','rank','team']) is not true
      or jsonb_typeof(item->'name') <> 'string' or char_length(item->>'name') > 40
      or vof_relay.is_nonnegative_integer(item->'score') is not true
      or vof_relay.is_nonnegative_integer(item->'rank') is not true
      or (jsonb_typeof(item->'team') <> 'null' and item->>'team' not in ('NAVY','GOLD'))), true) then return false; end if;
  end loop;
  return coalesce(jsonb_typeof(value->'showdown') = 'null' or vof_relay.valid_showdown(value->'showdown') is true, false);
end;
$$;

revoke all on function vof_relay.valid_room_state(jsonb, text, bigint) from public, anon, authenticated;
