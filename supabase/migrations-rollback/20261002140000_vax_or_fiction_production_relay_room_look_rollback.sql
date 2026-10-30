-- Rollback for 20261002140000_vax_or_fiction_production_relay_room_look.sql
--
-- Manual-apply only. Do NOT copy this file into supabase/migrations/: every .sql file in that directory is applied
-- forward in filename order, so an undo script placed there would auto-apply on the next `supabase db push` and
-- revert the change at once.
--
-- Apply by hand, against the real project, only if the widening itself has to come out (for example it accepts or
-- refuses a room state it should not, and there is no time to fix it forward first):
--   psql "$DATABASE_URL" -1 -v ON_ERROR_STOP=1 -f supabase/migrations-rollback/20261002140000_vax_or_fiction_production_relay_room_look_rollback.sql
--
-- Apply it with no live room. A host on the new build copes with the relay that refuses the keys again: its first state
-- with them is refused and it goes on with plain states, so a room does not stall. A phone then shows Today with
-- patterns on.
--
-- It restores vof_relay.valid_room_state(jsonb, text, bigint) to the exact body it had immediately before
-- 20261002140000, which is the body 20260915005736 defined, since no migration in between touched it. It touches nothing
-- else in vof_relay and drops nothing, because the forward migration added no helper.
--
-- Fingerprints, md5(prosrc):length(prosrc): before the forward migration
-- valid_room_state=e7f684a187512f57f45f66440e29cf65:3289, after it valid_room_state=1616a6bd93d0143349cfa1938789a219:3629.
-- Read them with:
--   select p.oid::regprocedure, md5(prosrc), length(prosrc) from pg_proc p
--     where p.oid = 'vof_relay.valid_room_state(jsonb, text, bigint)'::regprocedure;
-- The before value is the body in 20260915005736 and the after value the body in 20261002140000. Before applying
-- this rollback, read the fingerprint and compare it with the after value. After it, the same query must return the
-- before value, which proves an exact revert and not merely a plausible one.
--
-- The probe for the forward apply, read-only (a function call and nothing stored). Run as postgres, since anon and
-- authenticated cannot execute the function. A plain state, a state with the two keys, a look that is not a slug and a key
-- the relay does not know read as t f f f before the apply and as t t f f after it, and again as t f f f after this rollback.
--   with s(plain) as (select '{"version":1,"roomId":"ROOMA","sessionId":"verify-room-look","revision":1,"phase":"modePicker","slideIndex":-1,"slideCount":10,"question":null,"questionData":null,"reveal":null,"votesLocked":true,"timerSeconds":20,"timerDurationSeconds":20,"timerRunning":false,"participants":0,"teamScores":null,"leaderboard":[],"showdown":null,"hostConnected":true}'::jsonb)
--   select vof_relay.valid_room_state(plain, 'ROOMA', 0) as plain,
--          vof_relay.valid_room_state(plain || '{"look":"casefile","patterns":false}', 'ROOMA', 0) as with_keys,
--          vof_relay.valid_room_state(plain || '{"look":"Not A Look"}', 'ROOMA', 0) as bad_look,
--          vof_relay.valid_room_state(plain || '{"theme":"dark"}', 'ROOMA', 0) as unknown_key
--   from s;
--
-- After a manual rollback, also delete the forward migration's row from supabase_migrations.schema_migrations by hand, so
-- the recorded history matches the schema. Read that table's live row before assuming its version, and never guess it.
--
-- Apply with `psql -1` (or inside a transaction wrapper): the set local lock_timeout below has no effect outside a
-- transaction block, and a plain `psql -f` runs each statement as its own autocommitted transaction.

set local lock_timeout = '3s';

do $ownership_guard$
declare
  v_function regprocedure := 'vof_relay.valid_room_state(jsonb, text, bigint)'::regprocedure;
  v_owner text;
begin
  select pg_catalog.pg_get_userbyid(p.proowner) into v_owner
    from pg_catalog.pg_proc p where p.oid = v_function;
  if current_user is distinct from v_owner then
    raise exception 'This rollback must be applied as the owner of % (owner %). Currently connected as %.',
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
      array['version','roomId','sessionId','revision','phase','slideIndex','slideCount','question','questionData','reveal','votesLocked','timerSeconds','timerDurationSeconds','timerRunning','participants','teamScores','leaderboard','showdown','hostConnected'],
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
