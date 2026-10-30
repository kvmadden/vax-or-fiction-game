-- Rollback for 20260927160000_vof_recap_privacy_lockdown.sql
--
-- Manual-apply only. Do NOT copy this file into supabase/migrations/: every .sql file in that
-- directory is applied forward in filename order, so placing an undo script there would
-- auto-apply it on the very next `supabase db push` and immediately reopen the recap list-all
-- read the forward migration exists to close.
--
-- Apply by hand, against the real project, only if the lockdown itself needs to come out (for
-- example: the RPC path is broken in a way that blocks a real show and there is no time to fix
-- it forward first):
--   psql "$DATABASE_URL" -1 -v ON_ERROR_STOP=1 -f supabase/migrations-rollback/20260927160000_vof_recap_privacy_lockdown_rollback.sql
--
-- This restores the state before the forward migration: policy vrc_recaps_anon_insert (INSERT to anon, check
-- true) and vrc_recaps_anon_select_unexpired (SELECT to anon, using expires_at > now()) on
-- vrc_recaps, table-level (not column-level) anon INSERT on both tables, and policy
-- vrc_sessions_anon_insert on vrc_sessions. The authenticated role held no grant and no policy on
-- either table before the forward migration and gets none back here, since it never had any.
--
-- Drops public.vrc_list_recaps(text, integer), the sweep trigger on both tables, and
-- public.vrc_sweep_expired(). There is no public.vrc_get_recap to drop: the forward migration
-- never creates one (an earlier draft did and was removed in review before ever reaching this
-- file, see the forward migration's own header). Restores grant select on public.vrc_recaps to
-- anon, the vrc_recaps_anon_select_unexpired policy, and table-level (unrestricted) anon INSERT on
-- both tables in place of the forward migration's column-level grants. Nothing else on either
-- table, and nothing in vof_relay, is touched.
--
-- This file must be applied with `psql -1` (or an explicit transaction wrapper): the
-- set local lock_timeout below has no effect outside a transaction block, and a plain
-- `psql -f` runs each statement as its own autocommitted transaction.

set local lock_timeout = '3s';

do $ownership_guard$
declare
  v_recaps_owner text;
  v_sessions_owner text;
begin
  select pg_catalog.pg_get_userbyid(c.relowner) into v_recaps_owner
    from pg_catalog.pg_class c where c.oid = 'public.vrc_recaps'::regclass;
  select pg_catalog.pg_get_userbyid(c.relowner) into v_sessions_owner
    from pg_catalog.pg_class c where c.oid = 'public.vrc_sessions'::regclass;
  if current_user is distinct from v_recaps_owner or current_user is distinct from v_sessions_owner then
    raise exception 'This rollback must be applied as the owner of both public.vrc_recaps (owner %) and public.vrc_sessions (owner %). Currently connected as %.',
      coalesce(v_recaps_owner, 'unknown'), coalesce(v_sessions_owner, 'unknown'), current_user;
  end if;
end
$ownership_guard$;

drop trigger if exists vrc_recaps_sweep_expired on public.vrc_recaps;
drop trigger if exists vrc_sessions_sweep_expired on public.vrc_sessions;
drop function if exists public.vrc_sweep_expired();
drop function if exists public.vrc_list_recaps(text, integer);

-- Table-level anon INSERT, restored in place of the forward migration's column-level grants.
revoke insert on table public.vrc_recaps from anon;
grant insert on table public.vrc_recaps to anon;

revoke insert on table public.vrc_sessions from anon;
grant insert on table public.vrc_sessions to anon;

grant select on table public.vrc_recaps to anon;

drop policy if exists vrc_recaps_anon_select_unexpired on public.vrc_recaps;
create policy vrc_recaps_anon_select_unexpired on public.vrc_recaps
  for select
  to anon
  using (expires_at > now());
