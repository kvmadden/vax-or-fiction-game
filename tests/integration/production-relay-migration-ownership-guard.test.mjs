// RELAY-CAP ownership guard: if the role applying 20260926140000 does not already own
// vof_relay.rooms and public.vof_relay_exchange(jsonb), every new object in this migration is
// owned by that role instead, and every room creation then fails with "permission denied for
// table room_creation_ledger" (proven against the pre-fix migration). The migration's own
// ownership guard must instead abort the whole apply, before any DDL runs, with nothing
// changed, so the actual failure mode is a clean, immediate exception naming the problem.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { execFile, spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(import.meta.dirname, '../..');
const postgresBin = process.env.POSTGRES_BIN || '/opt/homebrew/opt/postgresql@17/bin';
const migrationDirectory = path.join(repoRoot, 'supabase/migrations');
const baseMigrations = [
  '20260913170036_vax_or_fiction_production_relay.sql',
  '20260913175713_vax_or_fiction_production_relay_lobby_state.sql',
  '20260915005736_vax_or_fiction_production_relay_explaining.sql',
].map((name) => path.join(migrationDirectory, name));
const capMigration = path.join(migrationDirectory, '20260926140000_vax_or_fiction_production_relay_anonymous_room_budget.sql');

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

async function psql(sql, { user } = {}) {
  const args = ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', String(port), '-d', 'postgres'];
  if (user) args.push('-U', user);
  args.push('-c', sql);
  const result = await command('psql', args);
  return result.stdout.trim();
}

async function applyFile(migrationPath, { user, single = true } = {}) {
  const args = ['-X', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', String(port), '-d', 'postgres'];
  if (single) args.push('-1');
  if (user) args.push('-U', user);
  args.push('-f', migrationPath);
  return command('psql', args);
}

before(async () => {
  fixtureRoot = await mkdtemp(path.join(repoRoot, 'work/production-relay-ownership-postgres-'));
  dataDir = path.join(fixtureRoot, 'data');
  port = await freePort();
  await command('initdb', ['-D', dataDir, '--no-locale', '--encoding=UTF8', '--auth=trust']);
  await command('pg_ctl', ['-D', dataDir, '-l', path.join(fixtureRoot, 'postgres.log'), '-o', `-F -p ${port} -h 127.0.0.1`, 'start', '-w']);
  await psql("create role anon nologin; create role authenticated nologin; create schema extensions; create extension pgcrypto with schema extensions;");
  for (const migrationPath of baseMigrations) {
    await applyFile(migrationPath, { single: false });
  }
});

after(async () => {
  if (dataDir) await command('pg_ctl', ['-D', dataDir, 'stop', '-m', 'fast', '-w']).catch(() => {});
  if (fixtureRoot?.startsWith(path.join(repoRoot, 'work/production-relay-ownership-postgres-'))) {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

// RELAY6: nothing tested `set local lock_timeout = '3s'` itself. Reproduced manually before this
// test existed: a conflicting AccessExclusiveLock held
// on vof_relay.rooms by another session queues the migration's `alter table ... add column`
// behind it, and lock_timeout cancels the whole apply after about 3 seconds instead of letting it
// queue indefinitely behind live traffic. This is that manual proof as a real, permanent test.
test('a conflicting lock on vof_relay.rooms cancels the apply via its own 3-second lock_timeout, with the schema unchanged', async () => {
  const holdSeconds = 4.5;
  const holder = spawn(path.join(postgresBin, 'psql'), [
    '-X', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', String(port), '-d', 'postgres',
    '-c', `begin; lock table vof_relay.rooms in access exclusive mode; select pg_sleep(${holdSeconds}); commit;`,
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
        "select count(*) from pg_locks l join pg_class c on l.relation = c.oid where c.relname = 'rooms' and l.mode = 'AccessExclusiveLock' and l.granted;",
      );
      if (Number(granted) > 0) { locked = true; break; }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    assert.ok(locked, `test setup: the holding session must actually acquire its lock before the timed apply starts; holder output: ${holderOutput}`);

    const started = Date.now();
    await assert.rejects(
      () => applyFile(capMigration, { single: true }),
      (error) => {
        const output = `${error.stderr || ''}${error.stdout || ''}`;
        assert.match(output, /canceling statement due to lock timeout/i, `expected the migration's own lock_timeout to cancel the apply, got: ${output}`);
        return true;
      },
      'a migration queued behind a conflicting lock must be cancelled by its own lock_timeout rather than hang indefinitely',
    );
    const elapsedMs = Date.now() - started;
    assert.ok(elapsedMs < 5_000, `expected the lock_timeout cancellation within about 5 seconds, took ${elapsedMs}ms`);
    assert.ok(elapsedMs >= 2_500, `expected the cancellation to actually wait out most of the 3-second lock_timeout rather than fail immediately for some other reason, took only ${elapsedMs}ms`);
  } finally {
    try { holder.kill('SIGTERM'); } catch { /* already gone */ }
    await holderExit;
    // The holding backend only notices its client is gone (and releases the lock) the next time
    // it wakes from pg_sleep, so give that a moment to settle before the next test reuses this
    // instance and needs an uncontended lock on vof_relay.rooms.
    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  assert.equal(
    await psql("select to_regclass('vof_relay.room_creation_ledger') is null;"),
    't',
    'the ledger table must not exist after the lock-timeout-cancelled apply',
  );
  assert.equal(
    await psql("select exists (select 1 from information_schema.columns where table_schema = 'vof_relay' and table_name = 'rooms' and column_name = 'creating_network_key');"),
    'f',
    'vof_relay.rooms must carry no new column after the lock-timeout-cancelled apply',
  );
});

test('a role that does not own vof_relay.rooms and vof_relay_exchange is refused, cleanly, with nothing changed', async () => {
  // A real wrong-role apply is not a role with zero access (that fails earlier, on a plain
  // schema permission error): it is an admin or migration-runner role with full apply
  // capability, that simply is not the specific role that owns these pre-existing objects.
  // A superuser proves the guard, not an ordinary schema permission check, is what stops it.
  await psql('create role intruder login superuser;');

  await assert.rejects(
    () => applyFile(capMigration, { user: 'intruder' }),
    (error) => {
      const output = `${error.stderr || ''}${error.stdout || ''}`;
      assert.match(output, /must be applied as the owner of both vof_relay\.rooms/i, `expected the ownership guard's own message, got: ${output}`);
      return true;
    },
    'applying as a non-owning role must fail',
  );

  assert.equal(
    await psql("select to_regclass('vof_relay.room_creation_ledger') is null;"),
    't',
    'the ledger table must not exist after the refused apply',
  );
  assert.equal(
    await psql("select exists (select 1 from pg_proc where proname = 'caller_key' and pronamespace = 'vof_relay'::regnamespace);"),
    'f',
    'vof_relay.caller_key() must not exist after the refused apply',
  );
  assert.equal(
    await psql("select exists (select 1 from information_schema.columns where table_schema = 'vof_relay' and table_name = 'rooms' and column_name = 'creating_network_key');"),
    'f',
    'vof_relay.rooms must carry no new column after the refused apply',
  );
  assert.doesNotMatch(
    await psql("select prosrc from pg_proc where proname = 'vof_relay_exchange' and pronamespace = 'public'::regnamespace;"),
    /room_creation_ledger|creating_network_key/,
    'public.vof_relay_exchange must still be the pre-migration body after the refused apply',
  );

  // RELAY6: the guard above only ever ran against a role that owns NEITHER object, so a mutant
  // that checks only v_rooms_owner (or only v_exchange_owner) would still pass every existing
  // assertion here. Prove both halves of the "is distinct from" OR independently: a role that
  // owns exactly one of the two objects must still be refused.
  const ownerRole = await psql('select current_user;');
  await psql('create role partial_owner login superuser;');

  await psql('alter table vof_relay.rooms owner to partial_owner;');
  await assert.rejects(
    () => applyFile(capMigration, { user: 'partial_owner' }),
    (error) => {
      const output = `${error.stderr || ''}${error.stdout || ''}`;
      assert.match(output, /must be applied as the owner of both vof_relay\.rooms/i, `expected the ownership guard's own message, got: ${output}`);
      return true;
    },
    'owning vof_relay.rooms but not vof_relay_exchange must still be refused',
  );
  assert.equal(
    await psql("select to_regclass('vof_relay.room_creation_ledger') is null;"),
    't',
    'the ledger table must not exist after the rooms-only-owner refused apply',
  );
  await psql(`alter table vof_relay.rooms owner to ${ownerRole};`);

  await psql('alter function public.vof_relay_exchange(jsonb) owner to partial_owner;');
  await assert.rejects(
    () => applyFile(capMigration, { user: 'partial_owner' }),
    (error) => {
      const output = `${error.stderr || ''}${error.stdout || ''}`;
      assert.match(output, /must be applied as the owner of both vof_relay\.rooms/i, `expected the ownership guard's own message, got: ${output}`);
      return true;
    },
    'owning vof_relay_exchange but not vof_relay.rooms must still be refused',
  );
  assert.equal(
    await psql("select to_regclass('vof_relay.room_creation_ledger') is null;"),
    't',
    'the ledger table must not exist after the exchange-only-owner refused apply',
  );
  await psql(`alter function public.vof_relay_exchange(jsonb) owner to ${ownerRole};`);

  // The same file, applied by the role that actually owns both objects (the default superuser
  // that ran the base migrations above), must succeed: the guard blocks the wrong role, not
  // every role.
  await applyFile(capMigration, { single: true });
  assert.equal(
    await psql("select to_regclass('vof_relay.room_creation_ledger') is not null;"),
    't',
    'the legitimate owner must still be able to apply the same file',
  );
});
