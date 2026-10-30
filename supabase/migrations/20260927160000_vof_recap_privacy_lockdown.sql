-- Recap privacy lockdown for the optional Supabase-backed archive.
--
-- Before this migration, anon could list every public.vrc_recaps row (player nicknames and scores) with no room
-- filter, expired recaps were hidden but never deleted, and public.vrc_sessions summaries had no expiry.
--
-- What it does:
--  1. Drops anon's SELECT policy on vrc_recaps and revokes table-level reads, so nothing is listable over the
--     public connection. Supabase's default ACLs grant EXECUTE and table privileges to anon, authenticated and
--     service_role directly, so every object below revokes from all of them by name before granting what it needs.
--  2. Narrows anon's INSERT to the columns the client actually sends (room, deck_id, recap or summary,
--     started_at), so a raw REST call cannot set expires_at or created_at (for example to 'infinity').
--  3. Adds public.vrc_list_recaps(p_deck_id, p_limit), a security-definer function gated on auth.uid() matching
--     one configured admin auth user id and confirmed in auth.users. It checks the token subject, not an email
--     claim. Granted to authenticated only. Refusals raise 42501 so PostgREST answers 403.
--     SET THE ADMIN ID: replace the all-zero placeholder uuid in vrc_list_recaps with your own admin user's id
--     (Supabase Auth, Users) before applying. With the placeholder nobody can read the archive.
--  4. Adds a delete-on-write sweep: an AFTER INSERT STATEMENT trigger on both tables deletes expired recaps and
--     sessions older than 90 days, using `for update skip locked` so it never blocks the insert that fired it.
--     No pg_cron, so a project with no new games stops sweeping until the next insert.
--
-- Ownership guard: abort before any DDL unless current_user owns both tables, so ownership and grants line up.
--
-- Tested against a local Postgres 17 fixture with Supabase-like default ACLs and an auth.users/auth.uid()
-- stand-in (tests/integration/recap-privacy-migration.test.mjs, needs POSTGRES_BIN).
--
-- Apply with `psql -1` (or an explicit transaction): `set local lock_timeout` has no effect outside one.

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
    raise exception 'This migration must be applied as the owner of both public.vrc_recaps (owner %) and public.vrc_sessions (owner %). Currently connected as %.',
      coalesce(v_recaps_owner, 'unknown'), coalesce(v_sessions_owner, 'unknown'), current_user;
  end if;
end
$ownership_guard$;

-- Step 1: close the direct table read. See the file header for why this loop is dynamic rather
-- than a hardcoded policy name.
do $drop_anon_select$
declare
  v_policy record;
begin
  for v_policy in
    select policyname
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = 'vrc_recaps'
      and cmd in ('SELECT', 'ALL')
      and 'anon' = any(roles)
  loop
    execute pg_catalog.format('drop policy %I on public.vrc_recaps', v_policy.policyname);
  end loop;
end
$drop_anon_select$;

revoke select on table public.vrc_recaps from anon;
revoke select on table public.vrc_recaps from public;

-- Step 2: column-level INSERT for anon, so expires_at and created_at can never be client-supplied.
revoke insert on table public.vrc_recaps from anon;
grant insert (room, deck_id, recap) on table public.vrc_recaps to anon;

revoke insert on table public.vrc_sessions from anon;
grant insert (room, deck_id, started_at, summary) on table public.vrc_sessions to anon;

-- Step 3: the admin archive list, gated on the signed-in caller's own verified identity. See the
-- file header for why this checks auth.uid() against auth.users rather than a claimed email.
create or replace function public.vrc_list_recaps(p_deck_id text default 'vax-or-fiction', p_limit integer default 40)
returns table (room text, deck_id text, recap jsonb, created_at timestamptz, expires_at timestamptz)
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  v_admin_id constant uuid := '00000000-0000-0000-0000-000000000000';
  v_confirmed boolean;
begin
  if auth.uid() is distinct from v_admin_id then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  select (u.email_confirmed_at is not null) into v_confirmed
    from auth.users u
    where u.id = v_admin_id;
  if coalesce(v_confirmed, false) is not true then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  return query
    select r.room, r.deck_id, r.recap, r.created_at, r.expires_at
    from public.vrc_recaps r
    where r.deck_id = p_deck_id
      and r.expires_at > now()
    order by r.created_at desc
    limit greatest(1, least(p_limit, 100));
end;
$$;

revoke all on function public.vrc_list_recaps(text, integer) from public, anon, authenticated;
grant execute on function public.vrc_list_recaps(text, integer) to authenticated;

-- Step 4: delete-on-write, non-blocking sweep. SESSION_RETENTION is this migration's one named
-- window. See the file header for why vrc_recaps needs no equivalent constant of its own, and for
-- why each delete goes through `for update skip locked` instead of a plain WHERE.
create or replace function public.vrc_sweep_expired()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_session_retention constant interval := interval '90 days'; -- SESSION_RETENTION
begin
  delete from public.vrc_recaps
  where ctid in (
    select ctid from public.vrc_recaps
    where expires_at <= now()
    for update skip locked
  );
  delete from public.vrc_sessions
  where ctid in (
    select ctid from public.vrc_sessions
    where created_at <= now() - c_session_retention
    for update skip locked
  );
  return null;
end;
$$;

revoke all on function public.vrc_sweep_expired() from public, anon, authenticated;

drop trigger if exists vrc_recaps_sweep_expired on public.vrc_recaps;
create trigger vrc_recaps_sweep_expired
  after insert on public.vrc_recaps
  for each statement
  execute function public.vrc_sweep_expired();

drop trigger if exists vrc_sessions_sweep_expired on public.vrc_sessions;
create trigger vrc_sessions_sweep_expired
  after insert on public.vrc_sessions
  for each statement
  execute function public.vrc_sweep_expired();
