-- Wire the room-mode "Streak Bonus!" pill (STREAK-PILL). 6826f19 fixed this for solo, which
-- never crosses the relay: SettledVote already carries streakBonus and solo-game.ts attaches it
-- to the local attendee projection. Room mode's copy of the same field crosses this relay's
-- vof_relay.valid_attendee_state, which rejects any key it does not list, so the pill has been
-- dead in every room since AttendeeState.result gained the field.
--
-- This migration replaces only vof_relay.valid_attendee_state (create or replace, same
-- signature). It does not touch vof_relay.valid_room_state, valid_public_question,
-- valid_reveal, valid_showdown, valid_client_message, public.vof_relay_exchange, or anything
-- else in vof_relay. Nothing else in vof_relay changes.
--
-- The one change: value->'result' now accepts an OPTIONAL streakBonus key. Before this
-- migration, has_only_keys(value->'result', allowed, required) was called with allowed ==
-- required (both exactly ['questionInstanceId','choice','isCorrect','points']), so the four keys
-- were the only shape ever accepted. This migration adds 'streakBonus' to allowed only, leaving
-- required unchanged at the original four, so:
--   - An old result with exactly the original four keys still validates (required is unchanged,
--     and having no extra key trivially satisfies "no key outside allowed").
--   - A new result that adds streakBonus also validates, since streakBonus is now in allowed.
--   - A result missing any of the original four keys still fails, since required is unchanged.
-- Old clients that never send streakBonus, and any state already stored with the old four-key
-- shape, stay valid without any change on their part.
--
-- The value itself is bounded: when present, streakBonus must be a non-negative integer no
-- greater than 100. That ceiling is not arbitrary: src/engine/scoring.ts's score() computes
-- streakBonus from two fixed milestones only (a 3-streak pays a flat 50, and every 5-streak
-- after that, no matter how long the streak runs, pays a flat 100), so 100 is score()'s real,
-- permanent maximum for this field, not an estimate that could grow later without a matching
-- code change. vof_relay.is_nonnegative_integer already enforces "non-negative integer". This
-- migration adds only the <= 100 upper bound on top of it for this one field.
--
-- Safety carried forward from the last migration: an ownership guard immediately below aborts
-- the whole apply with nothing changed unless current_user already owns
-- vof_relay.valid_attendee_state(jsonb). CREATE OR REPLACE keeps the existing owner and grants,
-- so this is not guarding against an ownership change. It is a consistency check that the file
-- is applied the same way the relay's other migrations were, as the owner, and it fails fast and
-- cleanly otherwise. set local lock_timeout = '3s' bounds how long the create-or-replace below
-- can queue behind live traffic. The same is added to the rollback for its own
-- create-or-replace, which takes the same kind of lock. This file must be applied with `psql -1` (or an explicit transaction
-- wrapper), because SET LOCAL has no effect outside a transaction block and a plain `psql -f`
-- runs each statement as its own autocommitted transaction.
--
-- Ordering risk (read before applying or releasing): the client and this migration must not be
-- released out of order. Before this migration exists in production, the room-mode projection
-- must NOT send a streakBonus key, because the live vof_relay.valid_attendee_state still runs
-- allowed == required on value->'result' and rejects any key outside that exact four, which
-- would reject that attendee's ENTIRE personal state (score, rank, accuracy, everything), not
-- just the streak field. A host batch carrying one such state is refused whole, other attendees'
-- valid states included, until the host client splits the batch and drops the bonused message. This migration must be applied to production BEFORE the client that
-- populates streakBonus ships. Applying this migration alone, with the old client still live, is
-- always safe: it is purely additive (an old four-key result still validates, per the has_only_keys
-- reasoning above), so migration-first is the one safe order and there is no safe way to reverse it.

set local lock_timeout = '3s';

do $ownership_guard$
declare
  v_owner text;
begin
  select pg_catalog.pg_get_userbyid(p.proowner) into v_owner
    from pg_catalog.pg_proc p where p.oid = 'vof_relay.valid_attendee_state(jsonb)'::regprocedure;
  if current_user is distinct from v_owner then
    raise exception 'This migration must be applied as the owner of vof_relay.valid_attendee_state(jsonb) (owner %). Currently connected as %.',
      coalesce(v_owner, 'unknown'), current_user;
  end if;
end
$ownership_guard$;

create or replace function vof_relay.valid_attendee_state(value jsonb)
returns boolean
language plpgsql
immutable
security invoker
set search_path = pg_catalog
as $$
begin
  if coalesce((vof_relay.json_is_safe(value) is not true
    or vof_relay.has_only_keys(value, array['sessionId','registered','nickname','team','vote','result','score','correct','answered','accuracy','bestStreak','rank','totalParticipants','commitments'], array['sessionId','registered','nickname','team','vote','result','score','correct','answered','accuracy','bestStreak','rank','totalParticipants','commitments']) is not true
    or vof_relay.is_session_id(value->>'sessionId') is not true
    or jsonb_typeof(value->'registered') <> 'boolean'
    or jsonb_typeof(value->'nickname') <> 'string' or char_length(value->>'nickname') > 40
    or (jsonb_typeof(value->'team') <> 'null' and value->>'team' not in ('NAVY','GOLD'))
    or vof_relay.is_nonnegative_integer(value->'score') is not true
    or vof_relay.is_nonnegative_integer(value->'correct') is not true
    or vof_relay.is_nonnegative_integer(value->'answered') is not true
    or (jsonb_typeof(value->'accuracy') <> 'null' and (jsonb_typeof(value->'accuracy') <> 'number' or (value->>'accuracy')::numeric < 0 or (value->>'accuracy')::numeric > 100))
    or vof_relay.is_nonnegative_integer(value->'bestStreak') is not true
    or (jsonb_typeof(value->'rank') <> 'null' and vof_relay.is_nonnegative_integer(value->'rank') is not true)
    or vof_relay.is_nonnegative_integer(value->'totalParticipants') is not true
    or jsonb_typeof(value->'commitments') <> 'array' or jsonb_array_length(value->'commitments') > 64), true) then return false; end if;
  if jsonb_typeof(value->'vote') <> 'null' and (
    vof_relay.has_only_keys(value->'vote', array['questionInstanceId','choice','conviction'], array['questionInstanceId','choice','conviction']) is not true
    or vof_relay.is_session_id(value->'vote'->>'questionInstanceId') is not true
    or jsonb_typeof(value->'vote'->'choice') <> 'string' or char_length(value->'vote'->>'choice') > 128
    or jsonb_typeof(value->'vote'->'conviction') <> 'string' or char_length(value->'vote'->>'conviction') > 64
  ) then return false; end if;
  if jsonb_typeof(value->'result') <> 'null' and (
    -- STREAK-PILL: streakBonus added to allowed only, required stays the original four keys, so
    -- this key is optional (see the migration header's has_only_keys reasoning).
    vof_relay.has_only_keys(value->'result', array['questionInstanceId','choice','isCorrect','points','streakBonus'], array['questionInstanceId','choice','isCorrect','points']) is not true
    or vof_relay.is_session_id(value->'result'->>'questionInstanceId') is not true
    or jsonb_typeof(value->'result'->'choice') <> 'string' or char_length(value->'result'->>'choice') > 128
    or jsonb_typeof(value->'result'->'isCorrect') <> 'boolean'
    or jsonb_typeof(value->'result'->'points') <> 'number'
    or (value->'result' ? 'streakBonus' and (
      vof_relay.is_nonnegative_integer(value->'result'->'streakBonus') is not true
      or (value->'result'->>'streakBonus')::numeric > 100
    ))
  ) then return false; end if;
  if exists (
    select 1 from jsonb_array_elements(value->'commitments') item
    where jsonb_typeof(item) <> 'string' or char_length(item #>> '{}') > 4096
  ) then return false; end if;
  return true;
end;
$$;
