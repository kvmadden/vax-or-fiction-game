-- Rollback for 20260926150000_vax_or_fiction_production_relay_streak_bonus.sql
--
-- Manual-apply only. Do NOT copy this file into supabase/migrations/: every .sql file in that
-- directory is applied forward in filename order, so placing an undo script there would
-- auto-apply it on the very next `supabase db push` and immediately revert the fix.
--
-- Apply by hand, against the real project, only if the streakBonus widening itself needs to come
-- out (for example: it is rejecting attendee state it should accept, or the bound needs
-- retuning and there is no time to fix it forward first):
--   psql "$DATABASE_URL" -1 -v ON_ERROR_STOP=1 -f supabase/migrations-rollback/20260926150000_vax_or_fiction_production_relay_streak_bonus_rollback.sql
--
-- This restores vof_relay.valid_attendee_state(jsonb) to the exact body it had immediately
-- before 20260926150000 (the same body 20260913170036 first defined, since no migration in
-- between touched this function). It does not touch vof_relay.valid_room_state, valid_public_question,
-- valid_reveal, valid_showdown, valid_client_message, caller_key, public.vof_relay_exchange, or
-- anything else in vof_relay.
--
-- The live function's md5(prosrc) before that apply was a20bf58dda0112a3b02a4e95292c6bb7, length
-- 2833. After the apply it was 56ef15e153697b301678b5d9d819f100, length 3220, the same "after"
-- value this rollback restores away from. Owner, grants ({postgres=X/postgres}), volatility and
-- search_path were unchanged by the apply.
--
-- Before applying this rollback, record the LIVE function's md5(prosrc) and length(prosrc):
--   select md5(prosrc), length(prosrc) from pg_proc where oid = 'vof_relay.valid_attendee_state(jsonb)'::regprocedure;
-- and compare against 56ef15e153697b301678b5d9d819f100, length 3220 above. After applying this
-- rollback, the same query must once again return a20bf58dda0112a3b02a4e95292c6bb7, length 2833
-- (the pre-apply snapshot of the original function), confirming an exact revert and not merely a
-- plausible-looking one.
--
-- After a manual rollback, also delete the version 20260926210914 row from
-- supabase_migrations.schema_migrations by hand, so the recorded migration history matches the
-- actual schema. Read that table's live row before assuming its exact version number, and never
-- guess it.
--
-- This file must be applied with `psql -1` (or an explicit transaction wrapper): the
-- set local lock_timeout below has no effect outside a transaction block, and a plain
-- `psql -f` runs each statement as its own autocommitted transaction.

set local lock_timeout = '3s';

do $ownership_guard$
declare
  v_owner text;
begin
  select pg_catalog.pg_get_userbyid(p.proowner) into v_owner
    from pg_catalog.pg_proc p where p.oid = 'vof_relay.valid_attendee_state(jsonb)'::regprocedure;
  if current_user is distinct from v_owner then
    raise exception 'This rollback must be applied as the owner of vof_relay.valid_attendee_state(jsonb) (owner %). Currently connected as %.',
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
    vof_relay.has_only_keys(value->'result', array['questionInstanceId','choice','isCorrect','points'], array['questionInstanceId','choice','isCorrect','points']) is not true
    or vof_relay.is_session_id(value->'result'->>'questionInstanceId') is not true
    or jsonb_typeof(value->'result'->'choice') <> 'string' or char_length(value->'result'->>'choice') > 128
    or jsonb_typeof(value->'result'->'isCorrect') <> 'boolean'
    or jsonb_typeof(value->'result'->'points') <> 'number'
  ) then return false; end if;
  if exists (
    select 1 from jsonb_array_elements(value->'commitments') item
    where jsonb_typeof(item) <> 'string' or char_length(item #>> '{}') > 4096
  ) then return false; end if;
  return true;
end;
$$;
