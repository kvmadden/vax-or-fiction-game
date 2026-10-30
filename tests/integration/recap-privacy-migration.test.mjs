// Recap privacy lockdown (2026-09-27): proves the migration in
// supabase/migrations/20260927160000_vof_recap_privacy_lockdown.sql against a real local
// Postgres 17, RED before the migration applies and GREEN after, then RED again after the
// rollback file undoes it. See a local evidence file for the full reader map this
// migration is built from.
//
// public.vrc_recaps and public.vrc_sessions are not created by any migration in this repository
// (they predate it, on the live project). The baseline this test builds in `before` matches the
// exact live schema, grants, policy names and default ACLs captured read-only at
// a local evidence file. This worktree never had direct live database access
// itself.
//
// The fixture seeds Postgres's and Supabase's own default privileges (execute on functions to
// postgres, anon, authenticated, service_role) before creating any new function, matching the
// live project's confirmed default ACL. Without that, a local-only test would never notice a
// missing explicit revoke, because plain Postgres already revokes PUBLIC's own default EXECUTE
// grant is the only thing `revoke ... from public` closes, and Supabase's environment grants
// EXECUTE directly and separately to anon and authenticated on top of that. A mutation that
// dropped the explicit `revoke ... from public, anon, authenticated` line passed clean against an
// earlier, unseeded version of this fixture for exactly that
// reason.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { execFile, spawn } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(import.meta.dirname, '../..');
const postgresBin = process.env.POSTGRES_BIN || '/opt/homebrew/opt/postgresql@17/bin';
const forwardMigrationPath = path.join(repoRoot, 'supabase/migrations/20260927160000_vof_recap_privacy_lockdown.sql');
const rollbackPath = path.join(repoRoot, 'supabase/migrations-rollback/20260927160000_vof_recap_privacy_lockdown_rollback.sql');

// The admin auth user id the migration ships with: an all-zero placeholder a deployment replaces before applying.
const ADMIN_ID = '00000000-0000-0000-0000-000000000000';
const OTHER_ID = '00000000-0000-4000-8000-000000000002';

let fixtureRoot;
let dataDir;
let port;

async function command(name, args, options = {}) {
  return execFileAsync(path.join(postgresBin, name), args, {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 2 * 1024 * 1024,
    ...options,
    env: { ...process.env, LC_ALL: 'C', LANG: 'C', ...options.env },
  });
}

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => server.listen(0, '127.0.0.1', resolve).once('error', reject));
  const address = server.address();
  await new Promise((resolve) => server.close(resolve));
  return address.port;
}

// `set role` mirrors what PostgREST does per request (anon or authenticated, never the owning
// superuser). `request.jwt.claims` mirrors the GUC PostgREST populates from a real bearer JWT, so
// auth.uid() (which this fixture's stand-in reads from the claims' `sub` field) has something to
// read. Both are set inside the same query string so the transaction-local set_config call is
// visible to the statement that follows it.
async function psql(sql, { role, jwtSub, reject = false } = {}) {
  const preamble = [
    // A DO block, not a bare `select set_config(...)`: the latter is itself a SELECT and would
    // print its own result row ahead of the real query's output in -qAt mode, corrupting every
    // caller that reads the trimmed stdout as the query's own answer.
    jwtSub !== undefined
      ? `do $set_jwt$ begin perform set_config('request.jwt.claims', '${JSON.stringify({ sub: jwtSub }).replace(/'/g, "''")}', true); end $set_jwt$;`
      : '',
    role ? `set role ${role};` : '',
  ].join(' ');
  const statement = `${preamble} ${sql}`;
  try {
    const result = await command('psql', ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', String(port), '-d', 'postgres', '-c', statement]);
    if (reject) assert.fail(`Expected SQL to fail but it succeeded: ${sql}\nstdout: ${result.stdout}`);
    return result.stdout.trim();
  } catch (error) {
    if (!reject) throw error;
    return `${error.stderr || ''}${error.stdout || ''}`;
  }
}

async function applyFile(filePath) {
  return command('psql', ['-X', '-1', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', String(port), '-d', 'postgres', '-f', filePath]);
}

async function seedBaseline() {
  await psql(`
    -- Minimal auth schema stand-in. auth.uid() mirrors Supabase's real implementation: it reads
    -- the 'sub' claim PostgREST populates into request.jwt.claims from the caller's bearer JWT.
    -- auth.users is deliberately not readable by anon or authenticated, matching the live project
    -- (only postgres, and a security-definer function owned by it, can read it there).
    create schema if not exists auth;
    create table auth.users (
      id uuid primary key,
      email text not null,
      email_confirmed_at timestamptz
    );
    revoke all on table auth.users from public, anon, authenticated, service_role;
    create or replace function auth.uid() returns uuid
      language sql stable as $$
        select (coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb ->> 'sub')::uuid
      $$;

    -- Exactly one admin account, confirmed. The email here is a fixture placeholder, never the
    -- real address: the migration and every test key off ADMIN_ID above, not an email string.
    insert into auth.users (id, email, email_confirmed_at)
      values ('${ADMIN_ID}', 'admin@example.test', now());

    -- Today's live schema, verified read-only 2026-09-27.
    -- vrc_recaps carries no id column at all. vrc_sessions carries a uuid id with its own default.
    create table public.vrc_sessions (
      id uuid not null default gen_random_uuid(),
      room text not null,
      deck_id text not null,
      started_at timestamptz not null,
      summary jsonb not null,
      created_at timestamptz not null default now()
    );

    create table public.vrc_recaps (
      room text not null,
      deck_id text not null,
      recap jsonb not null,
      created_at timestamptz not null default now(),
      expires_at timestamptz not null default (now() + interval '30 days')
    );

    alter table public.vrc_sessions enable row level security;
    create policy vrc_sessions_anon_insert on public.vrc_sessions for insert to anon with check (true);
    grant insert on table public.vrc_sessions to anon;

    alter table public.vrc_recaps enable row level security;
    create policy vrc_recaps_anon_insert on public.vrc_recaps for insert to anon with check (true);
    create policy vrc_recaps_anon_select_unexpired on public.vrc_recaps for select to anon using (expires_at > now());
    grant insert on table public.vrc_recaps to anon;
    grant select on table public.vrc_recaps to anon;

    -- Production default ACL for anything new created in the public schema from here on,
    -- confirmed read-only 2026-09-27: functions default to EXECUTE for postgres, anon,
    -- authenticated and service_role (four separate direct grants, not routed through PUBLIC).
    -- Tables and sequences default similarly. This must run after both tables above are already
    -- created and already hold their own explicit grants, not before: ALTER DEFAULT PRIVILEGES
    -- only ever applies to objects created after it runs, and an earlier version of this fixture
    -- ran it first, which meant CREATE TABLE picked up the default table ACL too (anon SELECT and
    -- UPDATE, authenticated arwd), a state production's actual vrc_recaps and vrc_sessions never
    -- had. See the assertion right after this call, and its captured RED evidence against that
    -- earlier ordering, in a local evidence file.
    alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
    alter default privileges in schema public grant select, insert, update on tables to anon;
    alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
    alter default privileges in schema public grant select, insert, update, delete, truncate, references, trigger on tables to service_role;
    alter default privileges in schema public grant select, update, usage on sequences to anon, authenticated, service_role;
  `);
}

before(async () => {
  fixtureRoot = await mkdtemp(path.join(repoRoot, 'work/recap-privacy-migration-postgres-'));
  dataDir = path.join(fixtureRoot, 'data');
  port = await freePort();
  await command('initdb', ['-D', dataDir, '--no-locale', '--encoding=UTF8', '--auth=trust']);
  await command('pg_ctl', ['-D', dataDir, '-l', path.join(fixtureRoot, 'postgres.log'), '-o', `-F -p ${port} -h 127.0.0.1`, 'start', '-w']);
  await psql('create role anon nologin; create role authenticated nologin; create role service_role nologin;');
  await seedBaseline();
});

after(async () => {
  if (dataDir) await command('pg_ctl', ['-D', dataDir, 'stop', '-m', 'fast', '-w']).catch(() => {});
  if (fixtureRoot?.startsWith(path.join(repoRoot, 'work/recap-privacy-migration-postgres-'))) {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

test('BASELINE: the seeded relacl for both tables matches the pre-image exactly', async () => {
  // Verified against a real reproduction: seeding ALTER DEFAULT PRIVILEGES before CREATE TABLE
  // (the order this fixture used before this assertion existed) leaves anon holding SELECT and
  // UPDATE it should not have and authenticated holding arwd on both tables, neither of which
  // production ever had. See a local evidence file for that exact failure
  // against these same assertions.
  const recapsAcl = await psql("select relacl::text from pg_class where relname = 'vrc_recaps';");
  assert.match(recapsAcl, /anon=ar\//, `vrc_recaps: anon must hold exactly INSERT and SELECT, matching the pre-image, got: ${recapsAcl}`);
  assert.doesNotMatch(recapsAcl, /authenticated=/, `vrc_recaps: authenticated must hold no grant, matching the pre-image, got: ${recapsAcl}`);

  const sessionsAcl = await psql("select relacl::text from pg_class where relname = 'vrc_sessions';");
  assert.match(sessionsAcl, /anon=a\//, `vrc_sessions: anon must hold exactly INSERT, matching the pre-image, got: ${sessionsAcl}`);
  assert.doesNotMatch(sessionsAcl, /authenticated=/, `vrc_sessions: authenticated must hold no grant, matching the pre-image, got: ${sessionsAcl}`);
});

test('no email address is hardcoded under src/, supabase/ or tests/ as an admin identity', async () => {
  // Admin identity is an auth user id set at deploy time (the migration's placeholder), never an email in the repo.
  // The pattern is built from parts so this file does not match itself.
  const emailPattern = new RegExp(['[a-z0-9._%+-]+', '@', '(gmail|outlook|yahoo|icloud|hotmail)', '\\.com'].join(''), 'i');

  const roots = ['src', 'supabase', 'tests'].map((name) => path.join(repoRoot, name));
  const offenders = [];
  const stack = [...roots];
  while (stack.length) {
    const dir = stack.pop();
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (/\.(ts|tsx|mjs|js|sql|md)$/.test(entry.name)) {
        const contents = await readFile(full, 'utf8');
        if (emailPattern.test(contents)) offenders.push(full);
      }
    }
  }
  assert.deepEqual(offenders, [], `no personal email may appear under src/, supabase/, or tests/: ${offenders.join(', ')}`);
});

describe('before the migration (today\'s live behavior, reproduced locally)', () => {
  test('RED: anon can SELECT every unexpired recap with no room filter, across rooms it was never given', async () => {
    await psql("insert into public.vrc_recaps (room, deck_id, recap) values ('aaaaaa', 'vax-or-fiction', '{}'::jsonb);");
    await psql("insert into public.vrc_recaps (room, deck_id, recap) values ('bbbbbb', 'vax-or-fiction', '{}'::jsonb);");
    await psql("insert into public.vrc_recaps (room, deck_id, recap, expires_at) values ('cccccc', 'vax-or-fiction', '{}'::jsonb, now() - interval '1 days');");
    const rooms = await psql('select room from public.vrc_recaps order by room;', { role: 'anon' });
    assert.equal(rooms, 'aaaaaa\nbbbbbb', 'anon sees both unexpired rooms in one query, with nothing identifying either room supplied');
    const count = await psql('select count(*) from public.vrc_recaps;', { role: 'anon' });
    assert.equal(count, '2', 'anon can count every unexpired row across the whole table');
  });

  test('RED: anon can pin expires_at to infinity today, escaping any future sweep forever', async () => {
    await psql(
      "insert into public.vrc_recaps (room, deck_id, recap, expires_at) values ('infpin', 'vax-or-fiction', '{}'::jsonb, 'infinity');",
      { role: 'anon' },
    );
    const stored = await psql("select expires_at::text from public.vrc_recaps where room = 'infpin';");
    assert.equal(stored, 'infinity', 'today\'s table-level INSERT grant lets anon set expires_at to any value, including infinity');
  });
});

test('apply the forward migration', async () => {
  await applyFile(forwardMigrationPath);
});

describe('after the migration', () => {
  test('GREEN: anon can no longer SELECT public.vrc_recaps at all', async () => {
    const output = await psql('select count(*) from public.vrc_recaps;', { role: 'anon', reject: true });
    assert.match(output, /permission denied for table vrc_recaps/);
  });

  test('BLOCKER: anon can no longer set expires_at or created_at on insert (column-level grant)', async () => {
    const deniedRecap = await psql(
      "insert into public.vrc_recaps (room, deck_id, recap, expires_at) values ('infcol', 'vax-or-fiction', '{}'::jsonb, 'infinity');",
      { role: 'anon', reject: true },
    );
    assert.match(deniedRecap, /permission denied for table vrc_recaps/);

    const deniedSession = await psql(
      "insert into public.vrc_sessions (room, deck_id, started_at, summary, created_at) values ('infcol', 'vax-or-fiction', now(), '{}'::jsonb, 'infinity');",
      { role: 'anon', reject: true },
    );
    assert.match(deniedSession, /permission denied for table vrc_sessions/);

    // The exact columns both real writers send (src/network/game-archive.ts and the classic
    // edition's live-channel.js saveSession/saveRecap) still work.
    await psql("insert into public.vrc_recaps (room, deck_id, recap) values ('infcol', 'vax-or-fiction', '{}'::jsonb);", { role: 'anon' });
    await psql("insert into public.vrc_sessions (room, deck_id, started_at, summary) values ('infcol', 'vax-or-fiction', now(), '{}'::jsonb);", { role: 'anon' });
    const landedExpiry = await psql("select expires_at <= now() + interval '31 days' and expires_at > now() from public.vrc_recaps where room = 'infcol';");
    assert.equal(landedExpiry, 't', 'the real default (30 days out) applies when anon cannot supply its own expires_at');
  });

  test('GREEN: no public.vrc_get_recap exists (dropped in review, never shipped)', async () => {
    assert.equal(await psql("select to_regprocedure('public.vrc_get_recap(text)') is null;"), 't');
  });

  test('GREEN: vrc_list_recaps refuses anon outright, at the grant, before its own identity check ever runs', async () => {
    const output = await psql('select * from public.vrc_list_recaps();', { role: 'anon', reject: true });
    assert.match(output, /permission denied for function vrc_list_recaps/);
  });

  test('GREEN: vrc_list_recaps refuses an authenticated caller whose id is not the admin\'s', async () => {
    const output = await psql(
      'select * from public.vrc_list_recaps();',
      { role: 'authenticated', jwtSub: OTHER_ID, reject: true },
    );
    assert.match(output, /not authorized/);
  });

  test('GREEN: vrc_list_recaps refuses the admin id itself if that account is not confirmed', async () => {
    await psql(`update auth.users set email_confirmed_at = null where id = '${ADMIN_ID}';`);
    const refused = await psql('select * from public.vrc_list_recaps();', { role: 'authenticated', jwtSub: ADMIN_ID, reject: true });
    assert.match(refused, /not authorized/);
    await psql(`update auth.users set email_confirmed_at = now() where id = '${ADMIN_ID}';`);
    const rooms = await psql('select room from public.vrc_list_recaps();', { role: 'authenticated', jwtSub: ADMIN_ID });
    assert.ok(rooms.split('\n').filter(Boolean).length > 0, 'restoring confirmation lets the real admin back in');
  });

  test('GREEN: vrc_list_recaps refuses the admin id if the auth.users row is gone entirely', async () => {
    await psql(`delete from auth.users where id = '${ADMIN_ID}';`);
    const refused = await psql('select * from public.vrc_list_recaps();', { role: 'authenticated', jwtSub: ADMIN_ID, reject: true });
    assert.match(refused, /not authorized/);
    await psql(`insert into auth.users (id, email, email_confirmed_at) values ('${ADMIN_ID}', 'admin@example.test', now());`);
  });

  test('NIT: the refusal raises errcode 42501 (insufficient_privilege), which PostgREST answers as 403', async () => {
    // Re-raises as a plain ERROR (not NOTICE, which libpq routes to stderr through a different
    // path than a query failure and this fixture's psql() helper never reads on success) with a
    // greppable message, only reachable if the inner call actually raised SQLSTATE 42501.
    const output = await psql(
      `do $catch$
       begin
         perform (select count(*) from public.vrc_list_recaps());
         exception when sqlstate '42501' then raise exception 'CAUGHT-42501';
       end
       $catch$;`,
      { role: 'authenticated', jwtSub: OTHER_ID, reject: true },
    );
    assert.match(output, /CAUGHT-42501/);
  });

  test('GREEN: vrc_list_recaps returns the archive list for the admin, unexpired only, newest first', async () => {
    const rooms = await psql(
      'select room from public.vrc_list_recaps();',
      { role: 'authenticated', jwtSub: ADMIN_ID },
    );
    const roomList = rooms.split('\n').filter(Boolean);
    assert.ok(roomList.includes('aaaaaa'));
    assert.ok(roomList.includes('bbbbbb'));
    assert.ok(!roomList.includes('cccccc'), 'the expired room is excluded from the admin list too');
  });

  test('GREEN: writers are unaffected, anon can still INSERT into both tables', async () => {
    await psql("insert into public.vrc_recaps (room, deck_id, recap) values ('eeeeee', 'vax-or-fiction', '{}'::jsonb);", { role: 'anon' });
    await psql(
      "insert into public.vrc_sessions (room, deck_id, started_at, summary) values ('eeeeee', 'vax-or-fiction', now(), '{}'::jsonb);",
      { role: 'anon' },
    );
    const foundRecap = await psql("select count(*) from public.vrc_recaps where room = 'eeeeee';");
    assert.equal(foundRecap, '1', 'the anon recap insert landed');
    const foundSession = await psql("select count(*) from public.vrc_sessions where room = 'eeeeee';");
    assert.equal(foundSession, '1', 'the anon session insert landed');
  });

  test('GREEN: every new function is security definer with search_path locked down, and none is anon-executable', async () => {
    const output = await psql(`
      select p.proname || '|' || p.prosecdef || '|' || coalesce(p.proconfig::text, '') || '|' || p.proacl::text
      from pg_proc p
      where p.pronamespace = 'public'::regnamespace and p.proname in ('vrc_list_recaps', 'vrc_sweep_expired')
      order by p.proname;
    `);
    const rows = output.split('\n').filter(Boolean);
    assert.equal(rows.length, 2, `expected exactly vrc_list_recaps and vrc_sweep_expired, got: ${output}`);
    for (const row of rows) {
      const [proname, prosecdef, proconfig, proacl] = row.split('|');
      // Boolean-to-text through || renders 'true'/'false' (unlike a bare boolean column, which
      // psql's default output renders as 't'/'f').
      assert.equal(prosecdef, 'true', `${proname} must be security definer`);
      // proconfig::text array-serializes its one element with the inner quotes backslash-escaped,
      // so the empty-string search_path shows up as literal \"\" here, not a bare "".
      assert.match(proconfig, /search_path=\\"\\"/, `${proname} must set search_path to empty, got: ${proconfig}`);
      assert.doesNotMatch(proacl, /anon=/, `${proname} must not be directly executable by anon`);
    }
    const listRow = rows.find((row) => row.startsWith('vrc_list_recaps|'));
    assert.match(listRow, /authenticated=X/, 'vrc_list_recaps must still be executable by authenticated');
    const sweepRow = rows.find((row) => row.startsWith('vrc_sweep_expired|'));
    assert.doesNotMatch(sweepRow, /authenticated=X/, 'vrc_sweep_expired must not be directly executable by authenticated either, only by its triggers');
  });

  test('GREEN: the sweep deletes expired recaps and keeps fresh ones', async () => {
    // Every INSERT fires the statement-level sweep, including these three setup rows themselves,
    // so an already-expired row inserted directly would be swept immediately and prove nothing.
    // Insert all three at the real default, then backdate two with an UPDATE (which this
    // migration's trigger deliberately does not fire on), then a single later INSERT is what
    // actually exercises the sweep against rows that were already sitting in the table.
    await psql("insert into public.vrc_recaps (room, deck_id, recap) values ('sweep2', 'vax-or-fiction', '{}'::jsonb);");
    await psql("insert into public.vrc_recaps (room, deck_id, recap) values ('sweep3', 'vax-or-fiction', '{}'::jsonb);");
    await psql("insert into public.vrc_recaps (room, deck_id, recap) values ('sweep4', 'vax-or-fiction', '{}'::jsonb);");
    await psql("update public.vrc_recaps set expires_at = now() - interval '5 days' where room = 'sweep2';");
    await psql("update public.vrc_recaps set expires_at = now() - interval '1 days' where room = 'sweep3';");
    const beforeCount = await psql("select count(*) from public.vrc_recaps where room in ('sweep2','sweep3','sweep4');");
    assert.equal(beforeCount, '3', 'setup: all three rows still exist, now with two already expired, before any write triggers the sweep');

    // The sweep-triggering write uses a throwaway room so it is not itself one of the rows under test.
    await psql("insert into public.vrc_recaps (room, deck_id, recap) values ('sweep5', 'vax-or-fiction', '{}'::jsonb);", { role: 'anon' });

    const afterCount = await psql("select count(*) from public.vrc_recaps where room in ('sweep2','sweep3','sweep4');");
    assert.equal(afterCount, '1', 'both expired rows are gone, the fresh one remains');
    const remaining = await psql("select room from public.vrc_recaps where room in ('sweep2','sweep3','sweep4');");
    assert.equal(remaining, 'sweep4');
  });

  test('GREEN: the sweep deletes vrc_sessions rows past the 90-day retention window and keeps recent ones', async () => {
    // Same reasoning as the recaps sweep test above: insert fresh, backdate with an UPDATE (which
    // does not fire the trigger), then a later INSERT is what actually exercises the sweep.
    await psql("insert into public.vrc_sessions (room, deck_id, started_at, summary) values ('sessn2', 'vax-or-fiction', now(), '{}'::jsonb);");
    await psql("insert into public.vrc_sessions (room, deck_id, started_at, summary) values ('sessn3', 'vax-or-fiction', now(), '{}'::jsonb);");
    await psql("update public.vrc_sessions set created_at = now() - interval '91 days' where room = 'sessn2';");
    await psql("update public.vrc_sessions set created_at = now() - interval '1 days' where room = 'sessn3';");
    const beforeCount = await psql("select count(*) from public.vrc_sessions where room in ('sessn2','sessn3');");
    assert.equal(beforeCount, '2', 'setup: both rows still exist, one now past retention, before any write triggers the sweep');

    await psql("insert into public.vrc_sessions (room, deck_id, started_at, summary) values ('sessn4', 'vax-or-fiction', now(), '{}'::jsonb);", { role: 'anon' });

    const afterCount = await psql("select count(*) from public.vrc_sessions where room in ('sessn2','sessn3');");
    assert.equal(afterCount, '1', 'the 91-day-old row is gone, the 1-day-old row remains');
    const remaining = await psql("select room from public.vrc_sessions where room in ('sessn2','sessn3');");
    assert.equal(remaining, 'sessn3');
  });

  // Shared by both tables below. A plain `for update` (no skip locked) also passes the "row is
  // left in place while locked" half, but blocks the timed insert on the held lock instead of
  // skipping it, so the elapsed-time assertion is what actually distinguishes the real fix from
  // that mutation, on each table independently.
  async function assertSweepSkipsLockedRowAndCatchesItLater({ table, insertLockRow, ageLockRow, insertDuring, insertAfter, lockRoom }) {
    await psql(insertLockRow);
    await psql(ageLockRow);

    const holdSeconds = 4;
    const holder = spawn(path.join(postgresBin, 'psql'), [
      '-X', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', String(port), '-d', 'postgres',
      '-c', `begin; select * from public.${table} where room = '${lockRoom}' for update; select pg_sleep(${holdSeconds}); commit;`,
    ], { env: { ...process.env, LC_ALL: 'C', LANG: 'C' }, stdio: ['ignore', 'pipe', 'pipe'] });
    let holderOutput = '';
    holder.stdout.on('data', (chunk) => { holderOutput += chunk; });
    holder.stderr.on('data', (chunk) => { holderOutput += chunk; });
    const holderExit = new Promise((resolve) => holder.once('exit', (code) => resolve(code)));

    try {
      const deadline = Date.now() + 5_000;
      let locked = false;
      while (Date.now() < deadline) {
        const granted = await psql(
          `select count(*) from pg_locks l join pg_class c on l.relation = c.oid where c.relname = '${table}' and l.mode = 'RowShareLock' and l.granted;`,
        );
        if (Number(granted) > 0) { locked = true; break; }
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      assert.ok(locked, `test setup: the holding session must actually lock ${lockRoom} before the timed insert runs; holder output: ${holderOutput}`);

      const started = Date.now();
      await psql(insertDuring, { role: 'anon' });
      const elapsedMs = Date.now() - started;
      assert.ok(elapsedMs < 2_000, `the sweep must skip the locked row on ${table} instead of waiting on it, took ${elapsedMs}ms`);

      const stillThere = await psql(`select count(*) from public.${table} where room = '${lockRoom}';`);
      assert.equal(stillThere, '1', `the locked row on ${table} is left for a later sweep, not deleted while locked`);
    } finally {
      try { holder.kill('SIGTERM'); } catch { /* already gone */ }
      await holderExit;
      // The holding backend only notices its client is gone (and releases the lock) the next time
      // it wakes from pg_sleep, so poll for the lock actually clearing rather than a flat sleep.
      // A later test (including the rollback that runs right after this file's tests) taking a
      // real lock on this table would otherwise race this leftover lock and fail for an unrelated
      // reason.
      const releaseDeadline = Date.now() + 5_000;
      let released = false;
      while (Date.now() < releaseDeadline) {
        const stillHeld = await psql(
          `select count(*) from pg_locks l join pg_class c on l.relation = c.oid where c.relname = '${table}' and l.mode = 'RowShareLock' and l.granted;`,
        );
        if (Number(stillHeld) === 0) { released = true; break; }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      assert.ok(released, `the holding session's lock on ${table} must actually clear before the next test runs`);
    }

    // A later, uncontended write now sweeps the previously-locked row.
    await psql(insertAfter, { role: 'anon' });
    const sweptNow = await psql(`select count(*) from public.${table} where room = '${lockRoom}';`);
    assert.equal(sweptNow, '0', `once uncontended, the next sweep on ${table} catches the row the earlier one had to skip`);
  }

  test('GREEN: the vrc_recaps sweep never blocks a save behind a row it cannot lock yet, and still catches it later', async () => {
    await assertSweepSkipsLockedRowAndCatchesItLater({
      table: 'vrc_recaps',
      lockRoom: 'lockrm',
      insertLockRow: "insert into public.vrc_recaps (room, deck_id, recap) values ('lockrm', 'vax-or-fiction', '{}'::jsonb);",
      ageLockRow: "update public.vrc_recaps set expires_at = now() - interval '1 days' where room = 'lockrm';",
      insertDuring: "insert into public.vrc_recaps (room, deck_id, recap) values ('lockwr', 'vax-or-fiction', '{}'::jsonb);",
      insertAfter: "insert into public.vrc_recaps (room, deck_id, recap) values ('lockwr2', 'vax-or-fiction', '{}'::jsonb);",
    });
  });

  test('GREEN: the vrc_sessions sweep never blocks a save behind a row it cannot lock yet, and still catches it later', async () => {
    await assertSweepSkipsLockedRowAndCatchesItLater({
      table: 'vrc_sessions',
      lockRoom: 'sessnk',
      insertLockRow: "insert into public.vrc_sessions (room, deck_id, started_at, summary) values ('sessnk', 'vax-or-fiction', now(), '{}'::jsonb);",
      ageLockRow: "update public.vrc_sessions set created_at = now() - interval '91 days' where room = 'sessnk';",
      insertDuring: "insert into public.vrc_sessions (room, deck_id, started_at, summary) values ('sesswx', 'vax-or-fiction', now(), '{}'::jsonb);",
      insertAfter: "insert into public.vrc_sessions (room, deck_id, started_at, summary) values ('sesswy', 'vax-or-fiction', now(), '{}'::jsonb);",
    });
  });
});

test('apply the rollback', async () => {
  await applyFile(rollbackPath);
});

describe('after the rollback', () => {
  test('RED again: anon can once more SELECT every unexpired recap with no room filter', async () => {
    const rooms = await psql('select room from public.vrc_recaps order by room;', { role: 'anon' });
    const roomList = rooms.split('\n').filter(Boolean);
    assert.ok(roomList.includes('aaaaaa'), 'the rollback restores anon list-all access, matching pre-migration behavior');
    assert.ok(roomList.includes('sweep4'));
    assert.ok(!roomList.includes('sweep2'), 'still excludes expired rows, matching the pre-migration policy');
  });

  test('RED again: anon can once more pin expires_at to infinity, table-level grant restored', async () => {
    await psql(
      "insert into public.vrc_recaps (room, deck_id, recap, expires_at) values ('infback', 'vax-or-fiction', '{}'::jsonb, 'infinity');",
      { role: 'anon' },
    );
    const stored = await psql("select expires_at::text from public.vrc_recaps where room = 'infback';");
    assert.equal(stored, 'infinity', 'the rollback restores the original table-level (not column-level) anon INSERT grant');
  });

  test('the rollback\'s REVOKE runs before its table-level GRANT, so no column-level ACL survives', async () => {
    // The rollback does `revoke insert on table ... from anon` before `grant insert on table ...
    // to anon` on both tables, specifically so the plain table-level REVOKE clears the forward
    // migration's column-level grants first. A rollback that granted the table-level privilege
    // without revoking first would leave anon holding both the redundant column-level entries
    // from the forward migration and the new table-level one. information_schema.column_privileges
    // is not the right check here: it reports effective per-column access derived from
    // table-level grants too, so it would show rows regardless. pg_attribute.attacl is the actual
    // stored column ACL, and must be empty.
    const output = await psql(`
      select attrelid::regclass::text || '|' || attname || '|' || attacl::text
      from pg_attribute
      where attrelid in ('public.vrc_recaps'::regclass, 'public.vrc_sessions'::regclass)
        and attacl is not null;
    `);
    assert.equal(output, '', `expected no stored column ACL on either table after the rollback, got: ${output}`);
  });

  test('the RPCs and triggers are gone', async () => {
    assert.equal(await psql("select to_regprocedure('public.vrc_get_recap(text)') is null;"), 't');
    assert.equal(await psql("select to_regprocedure('public.vrc_list_recaps(text, integer)') is null;"), 't');
    assert.equal(await psql("select to_regprocedure('public.vrc_sweep_expired()') is null;"), 't');
    assert.equal(
      await psql("select not exists (select 1 from pg_trigger where tgname = 'vrc_recaps_sweep_expired');"),
      't',
    );
    assert.equal(
      await psql("select not exists (select 1 from pg_trigger where tgname = 'vrc_sessions_sweep_expired');"),
      't',
    );
  });
});
