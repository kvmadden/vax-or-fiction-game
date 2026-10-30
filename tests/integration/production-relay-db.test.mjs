import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { execFile } from 'node:child_process';
import http from 'node:http';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { promisify } from 'node:util';
import { WebSocket } from 'ws';
import { attachRoomRelay } from '../../server/room-relay.mjs';

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(import.meta.dirname, '../..');
const postgresBin = process.env.POSTGRES_BIN || '/opt/homebrew/opt/postgresql@17/bin';
let fixtureRoot;
let dataDir;
let port;
let migrationPaths;

// LC_ALL/LANG=C: this machine's default locale makes initdb and pg_ctl fail to start (or start
// against a locale collation mismatch) unless the C locale is forced. Set on the env this helper
// actually passes to the child, not just the ambient shell, so this suite starts Postgres the
// same way regardless of what locale the calling shell or CI runner happens to have.
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

async function psql(sql, { role, reject = false } = {}) {
  const statement = role ? `set role ${role}; ${sql}` : sql;
  try {
    const result = await command('psql', ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', String(port), '-d', 'postgres', '-c', statement]);
    if (reject) assert.fail(`Expected SQL to fail: ${sql}`);
    return result.stdout.trim();
  } catch (error) {
    if (!reject) throw error;
    return `${error.stderr || ''}${error.stdout || ''}`;
  }
}

// Mirrors what PostgREST actually does per request: it populates the request.headers GUC
// from the live HTTP request before calling the RPC. A direct psql call carries no HTTP
// request, so nothing sets that GUC unless a test asks for it. Distinct default callers per
// room keep unrelated tests from sharing one anonymous-room-creation budget (RELAY-BUDGET),
// the way distinct real hosts would in production. A test proving the budget itself passes
// an explicit callerIp to reuse (or deliberately vary) one caller across several requests.
//
// Three ways to control what the RPC sees as request.headers, most specific first:
// - `headers`: send exactly this object as request.headers (e.g. {} with no cf-connecting-ip
//   key at all, or { 'cf-connecting-ip': '' } for a present-but-empty value).
// - `callerIp`: shorthand for the common case, a header object with just cf-connecting-ip set
//   to this value (may be a real address, an IPv6 literal, or a malformed non-IP string).
// - `noHeaders`: skip setting request.headers entirely, so current_setting(..., true) sees it
//   as genuinely unset (null), the same as a direct psql call with no PostgREST in front of it.
async function exchange(request, role = 'anon', { callerIp, headers, noHeaders = false } = {}) {
  const encoded = Buffer.from(JSON.stringify(request), 'utf8').toString('base64');
  const setHeaders = noHeaders
    ? ''
    : (() => {
        const headerObject = headers ?? { 'cf-connecting-ip': callerIp ?? `test-caller-${request.roomId}` };
        const headerJson = JSON.stringify(headerObject).replace(/'/g, "''");
        return `do $set_headers$ begin perform set_config('request.headers', '${headerJson}', true); end $set_headers$; `;
      })();
  const output = await psql(
    `${setHeaders}select public.vof_relay_exchange(convert_from(decode('${encoded}', 'base64'), 'utf8')::jsonb)::text;`,
    { role },
  );
  return JSON.parse(output);
}

async function realProjectedRoomStates(roomId) {
  const source = `
    import { projectGameState } from './src/network/game-projection.ts';
    import { useGameStore } from './src/store/game-store.ts';
    const initial = useGameStore.getInitialState();
    const initialProjection = projectGameState(initial, ${JSON.stringify(roomId)}, 1).roomState;
    useGameStore.setState(initial, true);
    useGameStore.getState().dispatch({ type: 'ENTER_LOBBY' });
    const lobbyProjection = projectGameState(useGameStore.getState(), ${JSON.stringify(roomId)}, 2).roomState;
    const question = { id: 'phase-fixture', type: 'question', kind: 'binary', statement: 'A synthetic statement.', answer: true, reveal: 'The complete synthetic explanation.', takeaway: 'Synthetic takeaway.' };
    const settled = { ...initial, run: [question], slideIndex: 0, phase: 'revealed', votesLocked: true };
    const resultProjection = projectGameState(settled, ${JSON.stringify(roomId)}, 3).roomState;
    const explanationProjection = projectGameState({ ...settled, phase: 'explaining' }, ${JSON.stringify(roomId)}, 4).roomState;
    process.stdout.write(JSON.stringify({ initialProjection, lobbyProjection, resultProjection, explanationProjection }));
  `;
  const { stdout } = await execFileAsync(process.execPath, ['--import', 'tsx', '--input-type=module', '--eval', source], {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 2 * 1024 * 1024,
  });
  return JSON.parse(stdout);
}

const secret = (seed) => `${seed}`.repeat(36).slice(0, 36);
const hostRequest = (roomId, credential, action = 'connect', extra = {}) => ({
  version: 1,
  action,
  role: 'host',
  roomId,
  credential,
  ...extra,
});
const attendeeRequest = (roomId, deviceId, credential, action = 'connect', extra = {}) => ({
  version: 1,
  action,
  role: 'attendee',
  roomId,
  deviceId,
  credential,
  ...extra,
});
const findEvent = (response, kind) => response.events.find((event) => event.kind === kind);

before(async () => {
  const migrationDirectory = path.join(repoRoot, 'supabase/migrations');
  const files = await readdir(migrationDirectory).catch(() => []);
  const migrations = files
    .filter((name) => /^\d+_vax_or_fiction_production_relay(?:_[a-z0-9_]+)?\.sql$/.test(name))
    .sort();
  assert.deepEqual(migrations, [
    '20260913170036_vax_or_fiction_production_relay.sql',
    '20260913175713_vax_or_fiction_production_relay_lobby_state.sql',
    '20260915005736_vax_or_fiction_production_relay_explaining.sql',
    '20260926140000_vax_or_fiction_production_relay_anonymous_room_budget.sql',
    '20260926150000_vax_or_fiction_production_relay_streak_bonus.sql',
    '20260929140000_vax_or_fiction_production_relay_emphasis_reply.sql',
    '20261002140000_vax_or_fiction_production_relay_room_look.sql',
  ], 'the exact base relay and additive repairs run in order');
  migrationPaths = migrations.map((name) => path.join(migrationDirectory, name));
  for (const migrationPath of migrationPaths) {
    assert.ok((await readFile(migrationPath, 'utf8')).length > 0, `${path.basename(migrationPath)} must not be empty`);
  }

  fixtureRoot = await mkdtemp(path.join(repoRoot, 'work/production-relay-postgres-'));
  dataDir = path.join(fixtureRoot, 'data');
  port = await freePort();
  await command('initdb', ['-D', dataDir, '--no-locale', '--encoding=UTF8', '--auth=trust']);
  await command('pg_ctl', ['-D', dataDir, '-l', path.join(fixtureRoot, 'postgres.log'), '-o', `-F -p ${port} -h 127.0.0.1`, 'start', '-w']);
  await psql("create role anon nologin; create role authenticated nologin; create schema extensions; create extension pgcrypto with schema extensions;");
  for (const migrationPath of migrationPaths) {
    await command('psql', ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', String(port), '-d', 'postgres', '-f', migrationPath]);
  }
});

after(async () => {
  if (dataDir) await command('pg_ctl', ['-D', dataDir, 'stop', '-m', 'fast', '-w']).catch(() => {});
  if (fixtureRoot?.startsWith(path.join(repoRoot, 'work/production-relay-postgres-'))) {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

test('the exact RPC is reachable while every relay table stays inaccessible', async () => {
  assert.equal(await psql("select has_function_privilege('anon', 'public.vof_relay_exchange(jsonb)', 'execute');"), 't');
  assert.equal(await psql("select has_function_privilege('authenticated', 'public.vof_relay_exchange(jsonb)', 'execute');"), 't');
  assert.equal(await psql("select has_schema_privilege('anon', 'vof_relay', 'usage');"), 'f');
  assert.match(await psql('select * from vof_relay.rooms;', { role: 'anon', reject: true }), /permission denied/);
  assert.match(await psql('select * from vof_relay.devices;', { role: 'authenticated', reject: true }), /permission denied/);
});

test('host and device claims bind cryptorandom credentials without allowing takeover', async () => {
  const host = await exchange(hostRequest('Room_A', secret('h')));
  assert.equal(findEvent(host, 'READY')?.role, 'host');
  assert.equal(findEvent(await exchange(hostRequest('Room_A', secret('h'))), 'READY')?.role, 'host');
  assert.match(findEvent(await exchange(hostRequest('Room_A', secret('x'))), 'ERROR')?.reason ?? '', /owned/i);

  const attendee = await exchange(attendeeRequest('Room_A', 'device_A', secret('a')));
  assert.equal(findEvent(attendee, 'READY')?.role, 'attendee');
  assert.equal(findEvent(await exchange(attendeeRequest('Room_A', 'device_A', secret('a'))), 'READY')?.role, 'attendee');
  assert.match(findEvent(await exchange(attendeeRequest('Room_A', 'device_A', secret('b'))), 'ERROR')?.reason ?? '', /identity/i);
  assert.match(findEvent(await exchange(attendeeRequest('room_a', 'device_A', secret('a'))), 'ERROR')?.reason ?? '', /host/i);

  const storedSecrets = await psql("select encode(host_credential_hash, 'hex') || ':' || encode((select credential_hash from vof_relay.devices where room_id = 'Room_A' and device_id = 'device_A'), 'hex') from vof_relay.rooms where room_id = 'Room_A';");
  assert.doesNotMatch(storedSecrets, new RegExp(`${secret('h')}|${secret('a')}`));
  assert.match(storedSecrets, /^[0-9a-f]{64}:[0-9a-f]{64}$/);
});

test('snapshots, inbox messages, ACKs, and personal state follow their role boundaries', async () => {
  const roomId = 'Room_State';
  await exchange(hostRequest(roomId, secret('h')));
  await exchange(attendeeRequest(roomId, 'device_A', secret('a')));
  await exchange(attendeeRequest(roomId, 'device_B', secret('b')));

  const hostReplay = await exchange(hostRequest(roomId, secret('h'), 'poll'));
  assert.deepEqual(hostReplay.events.filter((event) => event.kind === 'ATTENDEE_CONNECTED').map((event) => event.deviceId).sort(), ['device_A', 'device_B']);

  const state = {
    version: 1,
    roomId,
    sessionId: 'run_1',
    revision: 1,
    phase: 'lobby',
    slideIndex: 0,
    slideCount: 20,
    question: null,
    questionData: null,
    reveal: null,
    votesLocked: true,
    timerSeconds: 0,
    timerDurationSeconds: 30,
    timerRunning: false,
    participants: 2,
    teamScores: { NAVY: 0, GOLD: 0 },
    leaderboard: [],
    showdown: null,
    hostConnected: true,
  };
  assert.equal(findEvent(await exchange(hostRequest(roomId, secret('h'), 'send', { message: { kind: 'ROOM_STATE', state } })), 'ERROR'), undefined);
  assert.equal(findEvent(await exchange(attendeeRequest(roomId, 'device_A', secret('a'), 'poll', { knownRevision: 0, personalRevision: 0, ackCursor: 0 })), 'ROOM_STATE')?.state.revision, 1);
  assert.equal(findEvent(await exchange(attendeeRequest(roomId, 'device_B', secret('b'), 'poll', { knownRevision: 1, personalRevision: 0, ackCursor: 0 })), 'ROOM_STATE'), undefined);
  assert.equal(findEvent(await exchange(attendeeRequest(roomId, 'device_C', secret('c'))), 'ROOM_STATE')?.state.revision, 1, 'late join receives the current snapshot');

  const hello = { version: 1, type: 'HELLO', roomId, sessionId: 'run_1', deviceId: 'device_A', messageId: 'hello_A', nickname: 'Ada', team: 'NAVY' };
  assert.equal(findEvent(await exchange(attendeeRequest(roomId, 'device_A', secret('a'), 'send', { message: { kind: 'CLIENT_MESSAGE', message: hello } })), 'ACK'), undefined);
  const inbox = await exchange(hostRequest(roomId, secret('h'), 'poll'));
  assert.deepEqual(findEvent(inbox, 'CLIENT_MESSAGE')?.message, hello);
  assert.deepEqual(findEvent(await exchange(hostRequest(roomId, secret('h'), 'poll')), 'CLIENT_MESSAGE')?.message, hello, 'unacknowledged HTTP delivery is replayed');
  assert.equal(findEvent(await exchange(hostRequest(roomId, secret('h'), 'poll', { consumeCursor: inbox.inboxCursor })), 'CLIENT_MESSAGE'), undefined, 'host explicitly consumes delivered inbox items');

  const duplicatePending = await exchange(attendeeRequest(roomId, 'device_A', secret('a'), 'send', { message: { kind: 'CLIENT_MESSAGE', message: hello } }));
  assert.equal(findEvent(duplicatePending, 'ACK'), undefined);
  assert.equal(findEvent(await exchange(hostRequest(roomId, secret('h'), 'poll')), 'CLIENT_MESSAGE'), undefined, 'pending duplicate is not enqueued twice');

  await exchange(hostRequest(roomId, secret('h'), 'send', { message: { kind: 'DIRECT', deviceId: 'device_A', message: { kind: 'ACK', messageId: 'hello_A', accepted: true } } }));
  const acknowledged = await exchange(attendeeRequest(roomId, 'device_A', secret('a'), 'poll', { knownRevision: 1, personalRevision: 0, ackCursor: 0 }));
  assert.equal(findEvent(acknowledged, 'ACK')?.accepted, true);

  const personal = {
    sessionId: 'run_1', registered: true, nickname: 'Ada', team: 'NAVY', vote: null, result: null,
    score: 100, correct: 1, answered: 1, accuracy: 100, bestStreak: 1, rank: 1,
    totalParticipants: 2, commitments: [],
  };
  await exchange(hostRequest(roomId, secret('h'), 'send', { message: { kind: 'DIRECT', deviceId: 'device_A', message: { kind: 'ATTENDEE_STATE', state: personal } } }));
  assert.equal(findEvent(await exchange(attendeeRequest(roomId, 'device_A', secret('a'), 'poll', { knownRevision: 1, personalRevision: 0, ackCursor: acknowledged.ackCursor })), 'ATTENDEE_STATE')?.state.nickname, 'Ada');
  assert.equal(findEvent(await exchange(attendeeRequest(roomId, 'device_B', secret('b'), 'poll', { knownRevision: 1, personalRevision: 0, ackCursor: 0 })), 'ATTENDEE_STATE'), undefined);
});

test('the real initial and mounted-lobby projections accept the -1 slide sentinel', async () => {
  const roomId = 'Room_Real_Lobby';
  const credential = secret('h');
  const { initialProjection, lobbyProjection } = await realProjectedRoomStates(roomId);
  assert.equal(initialProjection.slideIndex, -1);
  // e4e74cf (2026-09-22, an ancestor of this suite's own base commit d62a1f9) moved the store's
  // default mode from the deck-authored default to curated8, an 8-question run. The accepted
  // count is that 8-question run plus the title and instructions slides, not the older 12-card
  // demo this assertion named before that change landed.
  assert.equal(initialProjection.slideCount, 10, 'the accepted curated-8 run plus title and instructions');
  assert.equal(lobbyProjection.phase, 'lobby');
  assert.equal(lobbyProjection.slideIndex, -1);

  await exchange(hostRequest(roomId, credential));
  for (const state of [initialProjection, lobbyProjection]) {
    const response = await exchange(hostRequest(roomId, credential, 'send', {
      message: { kind: 'ROOM_STATE', state },
    }));
    assert.equal(findEvent(response, 'ERROR'), undefined, `${state.phase} projection must be accepted`);
  }

  const invalid = { ...lobbyProjection, revision: 3, slideIndex: -2 };
  assert.match(findEvent(await exchange(hostRequest(roomId, credential, 'send', {
    message: { kind: 'ROOM_STATE', state: invalid },
  })), 'ERROR')?.reason ?? '', /state/i, 'indices below the -1 sentinel remain invalid');
});

test('shared result and explanation projections round-trip through the production SQL relay', async () => {
  const roomId = 'Room_Shared_Beats';
  const { resultProjection, explanationProjection } = await realProjectedRoomStates(roomId);
  assert.deepEqual(Object.keys(resultProjection.reveal).sort(), ['answerLabel', 'answerToken', 'citations', 'explanation', 'takeaway']);
  assert.deepEqual(explanationProjection.reveal, resultProjection.reveal);
  assert.equal(explanationProjection.votesLocked, true);
  assert.equal(explanationProjection.timerRunning, false);
  await exchange(hostRequest(roomId, secret('h')));
  await exchange(attendeeRequest(roomId, 'device_A', secret('a')));
  for (const state of [resultProjection, explanationProjection]) {
    const response = await exchange(hostRequest(roomId, secret('h'), 'send', { message: { kind: 'ROOM_STATE', state } }));
    assert.equal(findEvent(response, 'ERROR'), undefined, `${state.phase} must be accepted`);
    const replay = await exchange(attendeeRequest(roomId, 'device_A', secret('a'), 'poll', { knownRevision: 0, personalRevision: 0, ackCursor: 0 }));
    assert.deepEqual(findEvent(replay, 'ROOM_STATE')?.state, state, `${state.phase} readback preserves every field`);
  }
  const forged = { ...explanationProjection, revision: 5, phase: 'locked' };
  assert.match(findEvent(await exchange(hostRequest(roomId, secret('h'), 'send', { message: { kind: 'ROOM_STATE', state: forged } })), 'ERROR')?.reason ?? '', /state/i, 'locked phases still reject answer data');
  const extraField = { ...explanationProjection, revision: 6, reveal: { ...explanationProjection.reveal, privateNotes: 'must be rejected' } };
  assert.match(findEvent(await exchange(hostRequest(roomId, secret('h'), 'send', { message: { kind: 'ROOM_STATE', state: extraField } })), 'ERROR')?.reason ?? '', /state/i, 'the exact reveal field allowlist remains enforced');
});

test('host ACK traffic requires a pending message and prunes history to 128 synchronously', async () => {
  const roomId = 'Room_Ack_Bound';
  const deviceId = 'device_A';
  const hostCredential = secret('h');
  await exchange(hostRequest(roomId, hostCredential));
  await exchange(attendeeRequest(roomId, deviceId, secret('a')));

  await psql(`
    do $do$
    declare
      response jsonb;
    begin
      for series in 1..500 loop
        response := public.vof_relay_exchange(jsonb_build_object(
          'version', 1,
          'action', 'send',
          'role', 'host',
          'roomId', '${roomId}',
          'credential', '${hostCredential}',
          'message', jsonb_build_object(
            'kind', 'DIRECT',
            'deviceId', '${deviceId}',
            'message', jsonb_build_object('kind', 'ACK', 'messageId', 'fabricated_' || series, 'accepted', true)
          )
        ));
        if not exists (
          select 1 from jsonb_array_elements(response->'events') event
          where event->>'kind' = 'ERROR'
        ) then
          raise exception 'fabricated ACK % unexpectedly accepted', series;
        end if;
      end loop;
    end
    $do$;
  `);
  assert.equal(Number(await psql(`select count(*) from vof_relay.ack_history where room_id = '${roomId}' and device_id = '${deviceId}';`)), 0);

  await psql(`
    insert into vof_relay.inbox(room_id, device_id, message_id, event)
    select '${roomId}', '${deviceId}', 'pending_' || series,
      jsonb_build_object('kind','CLIENT_MESSAGE','message',jsonb_build_object('messageId','pending_' || series))
    from generate_series(1, 1000) series;

    do $do$
    declare
      response jsonb;
    begin
      for series in 1..1000 loop
        if series in (1, 501) then
          update vof_relay.rooms
            set host_rate_window_at = clock_timestamp(), host_rate_count = 0
            where room_id = '${roomId}';
        end if;
        response := public.vof_relay_exchange(jsonb_build_object(
          'version', 1,
          'action', 'send',
          'role', 'host',
          'roomId', '${roomId}',
          'credential', '${hostCredential}',
          'message', jsonb_build_object(
            'kind', 'DIRECT',
            'deviceId', '${deviceId}',
            'message', jsonb_build_object('kind', 'ACK', 'messageId', 'pending_' || series, 'accepted', true)
          )
        ));
        if exists (
          select 1 from jsonb_array_elements(response->'events') event
          where event->>'kind' = 'ERROR'
        ) then
          raise exception 'pending ACK % rejected: %', series, response;
        end if;
      end loop;
    end
    $do$;
  `);

  assert.equal(Number(await psql(`select count(*) from vof_relay.inbox where room_id = '${roomId}' and message_id is not null;`)), 0);
  assert.equal(Number(await psql(`select count(*) from vof_relay.ack_history where room_id = '${roomId}' and device_id = '${deviceId}';`)), 128);
  assert.equal(await psql(`select exists(select 1 from vof_relay.ack_history where room_id = '${roomId}' and device_id = '${deviceId}' and message_id = 'pending_872');`), 'f');
  assert.equal(await psql(`select exists(select 1 from vof_relay.ack_history where room_id = '${roomId}' and device_id = '${deviceId}' and message_id = 'pending_873');`), 't');
  assert.equal(await psql(`select exists(select 1 from vof_relay.ack_history where room_id = '${roomId}' and device_id = '${deviceId}' and message_id = 'pending_1000');`), 't');

  await psql(`update vof_relay.rooms set host_rate_window_at = clock_timestamp(), host_rate_count = 0 where room_id = '${roomId}';`);
  assert.equal(findEvent(await exchange(hostRequest(roomId, hostCredential, 'send', {
    message: { kind: 'DIRECT', deviceId, message: { kind: 'ACK', messageId: 'pending_1000', accepted: true } },
  })), 'ERROR'), undefined, 'an existing ACK can be replayed idempotently after its inbox row is gone');
  assert.equal(Number(await psql(`select count(*) from vof_relay.ack_history where room_id = '${roomId}' and device_id = '${deviceId}';`)), 128);
});

test('host batch exchange accepts at most 32 bounded DIRECT messages', async () => {
  const roomId = 'Room_Host_Batch';
  const deviceId = 'device_A';
  await exchange(hostRequest(roomId, secret('h')));
  await exchange(attendeeRequest(roomId, deviceId, secret('a')));
  await psql(`
    insert into vof_relay.inbox(room_id, device_id, message_id, event)
    select '${roomId}', '${deviceId}', 'batch_' || series,
      jsonb_build_object('kind','CLIENT_MESSAGE','message',jsonb_build_object('messageId','batch_' || series))
    from generate_series(1, 32) series;
  `);
  const messages = Array.from({ length: 32 }, (_, index) => ({
    kind: 'DIRECT', deviceId, message: { kind: 'ACK', messageId: `batch_${index + 1}`, accepted: true },
  }));

  const invalidMember = [messages[0], {
    kind: 'DIRECT', deviceId, message: { kind: 'ACK', messageId: 'fabricated_batch_member', accepted: true },
  }];
  assert.match(findEvent(await exchange(hostRequest(roomId, secret('h'), 'send', { messages: invalidMember })), 'ERROR')?.reason ?? '', /pending/i);
  assert.equal(Number(await psql(`select count(*) from vof_relay.ack_history where room_id = '${roomId}' and device_id = '${deviceId}';`)), 0, 'a rejected batch must not commit earlier members');
  assert.equal(Number(await psql(`select count(*) from vof_relay.inbox where room_id = '${roomId}' and message_id like 'batch_%';`)), 32);

  await psql(`update vof_relay.rooms set host_rate_window_at = clock_timestamp(), host_rate_count = 580 where room_id = '${roomId}';`);
  assert.match(findEvent(await exchange(hostRequest(roomId, secret('h'), 'send', { messages })), 'ERROR')?.reason ?? '', /rate/i);
  assert.equal(Number(await psql(`select count(*) from vof_relay.ack_history where room_id = '${roomId}' and device_id = '${deviceId}';`)), 0, 'a rate-rejected batch must not write ACKs');
  assert.equal(Number(await psql(`select count(*) from vof_relay.inbox where room_id = '${roomId}' and message_id like 'batch_%';`)), 32);

  await psql(`update vof_relay.rooms set host_rate_window_at = clock_timestamp(), host_rate_count = 0 where room_id = '${roomId}';`);
  const accepted = await exchange(hostRequest(roomId, secret('h'), 'send', { messages }));
  assert.equal(findEvent(accepted, 'ERROR'), undefined);
  assert.equal(Number(await psql(`select count(*) from vof_relay.inbox where room_id = '${roomId}' and message_id like 'batch_%';`)), 0);
  assert.equal(Number(await psql(`select count(*) from vof_relay.ack_history where room_id = '${roomId}' and device_id = '${deviceId}';`)), 32);

  assert.match(findEvent(await exchange(hostRequest(roomId, secret('h'), 'send', { messages: [] })), 'ERROR')?.reason ?? '', /invalid/i);
  assert.match(findEvent(await exchange(hostRequest(roomId, secret('h'), 'send', { messages: [...messages, messages[0]] })), 'ERROR')?.reason ?? '', /invalid/i);
  assert.match(findEvent(await exchange(attendeeRequest(roomId, deviceId, secret('a'), 'send', { messages })), 'ERROR')?.reason ?? '', /invalid/i);
});

test('host reconnect resumes above the durable revision and colon-bearing showdown IDs remain valid', async () => {
  const roomId = 'Room_Reload';
  await exchange(hostRequest(roomId, secret('h')));
  for (let revision = 1; revision <= 3; revision += 1) {
    const current = {
      version: 1, roomId, sessionId: 'run_1', revision, phase: revision === 3 ? 'showdown' : 'lobby',
      slideIndex: 0, slideCount: 20, question: null, questionData: null, reveal: null, votesLocked: true,
      timerSeconds: 0, timerDurationSeconds: 30, timerRunning: false, participants: 0, teamScores: null,
      leaderboard: [], hostConnected: true,
      showdown: revision === 3 ? { id: 'run_1:showdown', stage: 'lineup', finalists: [], predictions: {}, question: null, winner: null } : null,
    };
    assert.equal(findEvent(await exchange(hostRequest(roomId, secret('h'), 'send', { message: { kind: 'ROOM_STATE', state: current } })), 'ERROR'), undefined);
  }
  const reconnect = await exchange(hostRequest(roomId, secret('h')));
  assert.equal(findEvent(reconnect, 'READY')?.snapshotRevision, 3);
  const stale = { version: 1, roomId, sessionId: 'run_1', revision: 3, phase: 'lobby', slideIndex: 0, slideCount: 20, question: null, questionData: null, reveal: null, votesLocked: true, timerSeconds: 0, timerDurationSeconds: 30, timerRunning: false, participants: 0, teamScores: null, leaderboard: [], showdown: null, hostConnected: true };
  assert.match(findEvent(await exchange(hostRequest(roomId, secret('h'), 'send', { message: { kind: 'ROOM_STATE', state: stale } })), 'ERROR')?.reason ?? '', /stale/i);
});

test('invalid, stale, oversized, unavailable-host, and over-rate traffic is rejected', async () => {
  const roomId = 'Room_Guards';
  await exchange(hostRequest(roomId, secret('h')));
  await exchange(attendeeRequest(roomId, 'device_A', secret('a')));

  const invalidState = { kind: 'ROOM_STATE', state: { version: 1, roomId, revision: 1, answer: true } };
  assert.match(findEvent(await exchange(hostRequest(roomId, secret('h'), 'send', { message: invalidState })), 'ERROR')?.reason ?? '', /state/i);
  assert.match(findEvent(await exchange(attendeeRequest(roomId, 'device_A', secret('a'), 'send', { message: invalidState })), 'ERROR')?.reason ?? '', /attendee/i);
  assert.match(findEvent(await exchange({ ...hostRequest(roomId, secret('h')), action: null }), 'ERROR')?.reason ?? '', /invalid/i);
  assert.match(findEvent(await exchange({ ...hostRequest(roomId, secret('h')), credential: null }), 'ERROR')?.reason ?? '', /invalid/i);

  const oversized = attendeeRequest(roomId, 'device_A', secret('a'), 'send', { message: { kind: 'CLIENT_MESSAGE', message: { filler: 'x'.repeat(132 * 1024) } } });
  assert.match(findEvent(await exchange(oversized), 'ERROR')?.reason ?? '', /large/i);

  await psql(`update vof_relay.rooms set host_seen_at = now() - interval '1 minute' where room_id = '${roomId}';`);
  const message = { version: 1, type: 'REACTION', roomId, sessionId: 'run_1', deviceId: 'device_A', messageId: 'offline_1', reaction: 'knew-it' };
  const unavailable = await exchange(attendeeRequest(roomId, 'device_A', secret('a'), 'send', { message: { kind: 'CLIENT_MESSAGE', message } }));
  assert.equal(findEvent(unavailable, 'ACK')?.accepted, false);
  assert.equal(findEvent(await exchange(attendeeRequest(roomId, 'device_A', secret('a'), 'poll', { knownRevision: 0, personalRevision: 0, ackCursor: 0 })), 'HOST_STATUS')?.connected, false);
});

test('JSON null is rejected for every required client-message field and present conviction', async () => {
  const roomId = 'Room_Null_Fields';
  const deviceId = 'device_A';
  await exchange(hostRequest(roomId, secret('h')));
  await exchange(attendeeRequest(roomId, deviceId, secret('a')));

  const common = { version: 1, roomId, sessionId: 'run_1', deviceId };
  const hello = { ...common, type: 'HELLO', messageId: 'hello_base', nickname: 'Ada' };
  const vote = { ...common, type: 'VOTE', messageId: 'vote_base', questionInstanceId: 'run_1:q1', choice: 'choice_A', conviction: 'certain' };
  const reaction = { ...common, type: 'REACTION', messageId: 'reaction_base', reaction: 'knew-it' };
  const prediction = { ...common, type: 'PREDICT_WINNER', messageId: 'prediction_base', winner: 'ticket_A', showdownId: 'run_1:showdown' };
  const nullCases = [
    ['version', hello, 'version'],
    ['type', hello, 'type'],
    ['roomId', hello, 'roomId'],
    ['sessionId', hello, 'sessionId'],
    ['deviceId', hello, 'deviceId'],
    ['messageId', hello, 'messageId'],
    ['nickname', hello, 'nickname'],
    ['questionInstanceId', vote, 'questionInstanceId'],
    ['choice', vote, 'choice'],
    ['conviction', vote, 'conviction'],
    ['reaction', reaction, 'reaction'],
    ['winner', prediction, 'winner'],
    ['showdownId', prediction, 'showdownId'],
  ];

  for (const [label, base, field] of nullCases) {
    const message = { ...base, messageId: `null_${label}`, [field]: null };
    const response = await exchange(attendeeRequest(roomId, deviceId, secret('a'), 'send', {
      message: { kind: 'CLIENT_MESSAGE', message },
    }));
    assert.match(findEvent(response, 'ERROR')?.reason ?? '', /invalid/i, `${label}:null must be rejected`);
  }
  assert.equal(Number(await psql(`select count(*) from vof_relay.inbox where room_id = '${roomId}' and message_id is not null;`)), 0);
});

test('rate-window reset enqueues its first message and host/global caps reject only bounded writes', async () => {
  const roomId = 'Room_Caps';
  await exchange(hostRequest(roomId, secret('h')));
  await exchange(attendeeRequest(roomId, 'device_A', secret('a')));
  await psql(`update vof_relay.devices set rate_window_at = now() - interval '20 seconds', rate_count = 30 where room_id = '${roomId}' and device_id = 'device_A';`);
  const reaction = { version: 1, type: 'REACTION', roomId, sessionId: 'run_1', deviceId: 'device_A', messageId: 'after_window', reaction: 'knew-it' };
  await exchange(attendeeRequest(roomId, 'device_A', secret('a'), 'send', { message: { kind: 'CLIENT_MESSAGE', message: reaction } }));
  assert.equal(findEvent(await exchange(hostRequest(roomId, secret('h'), 'poll')), 'CLIENT_MESSAGE')?.message.messageId, 'after_window');

  for (let index = 0; index < 29; index += 1) {
    const flood = { ...reaction, messageId: `flood_${index}` };
    assert.equal(findEvent(await exchange(attendeeRequest(roomId, 'device_A', secret('a'), 'send', { message: { kind: 'CLIENT_MESSAGE', message: flood } })), 'ACK'), undefined);
  }
  const overflow = { ...reaction, messageId: 'flood_overflow' };
  assert.match(findEvent(await exchange(attendeeRequest(roomId, 'device_A', secret('a'), 'send', { message: { kind: 'CLIENT_MESSAGE', message: overflow } })), 'ACK')?.reason ?? '', /rate/i);

  await psql(`update vof_relay.rooms set host_rate_window_at = now(), host_rate_count = 600 where room_id = '${roomId}';`);
  assert.match(findEvent(await exchange(hostRequest(roomId, secret('h'), 'send', { message: { kind: 'DIRECT', deviceId: 'device_A', message: { kind: 'ACK', messageId: 'after_window', accepted: true } } })), 'ERROR')?.reason ?? '', /rate/i);
  assert.equal(findEvent(await exchange(hostRequest(roomId, secret('h'), 'poll')), 'ERROR'), undefined, 'host polling remains available at the send cap');

  await psql(`
    insert into vof_relay.rooms(room_id, host_credential_hash, host_seen_at, expires_at, host_rate_window_at)
    select 'Capacity_' || series, extensions.digest('fixture_secret_' || lpad(series::text, 24, 'x'), 'sha256'), now(), now() + interval '1 hour', now()
    from generate_series(1, 500 - (select count(*)::integer from vof_relay.rooms where expires_at > now())) series;
  `);
  assert.match(findEvent(await exchange(hostRequest('Capacity_Overflow', secret('z'))), 'ERROR')?.reason ?? '', /capacity/i);
  assert.equal(findEvent(await exchange(hostRequest(roomId, secret('h'))), 'READY')?.role, 'host', 'an owned room can reconnect while global capacity is full');
  await psql("delete from vof_relay.rooms where room_id ~ '^Capacity_[0-9]+$';");
});

// RELAY-BUDGET / RELAY-CAP: reproduced against the pre-fix contract in a local evidence file,
// a single anonymous caller created 120 rooms (24% of the entire 500-room cap) in under 3 seconds
// with zero rejections. Nothing bounded how fast NEW rooms could be created, only how many could
// exist at once. A first fix (RELAY-BUDGET) added a per-caller creation-RATE gate (5 per 10
// minutes), but that did not bound HOLDINGS: rooms live 8 hours, so it capped the rate of new rooms
// without capping how many any one network could hold open at once, and it would have locked out a
// real presenter relaunching a room a sixth time inside 10 minutes. the design call replaced it with
// a per-network cap on OPEN (unexpired) rooms instead: at most 20 at a time, 4% of the shared
// 500-room cap. These tests prove the cap is bounded per network, independent across networks,
// freed by expiry rather than by time alone, blind to legacy rows with no recorded network, and
// that it never touches an owned room's reconnect, an attendee's join, or a host's reload, which is
// exactly the traffic a real show produces.
test('the per-network open-room cap accepts 20 open rooms and rejects the 21st, and an expired room frees a slot', async () => {
  await psql('delete from vof_relay.room_creation_ledger;');
  const callerIp = '203.0.113.50';
  const created = [];
  for (let index = 0; index < 20; index += 1) {
    const roomId = `Netcap_A_${index}`;
    const response = await exchange(hostRequest(roomId, secret(`n${index}`)), 'anon', { callerIp });
    assert.equal(findEvent(response, 'READY')?.role, 'host', `room ${index} within the 20-open-room network cap must succeed`);
    created.push(roomId);
  }
  const twentyFirst = await exchange(hostRequest('Netcap_A_20', secret('n20')), 'anon', { callerIp });
  assert.match(findEvent(twentyFirst, 'ERROR')?.reason ?? '', /already has 20 open games/i, 'the 21st open room from the same network is rejected');
  assert.equal(Number(await psql("select count(*) from vof_relay.rooms where room_id = 'Netcap_A_20';")), 0, 'the rejected room was never created');

  // Expire one of the 20 held rooms directly instead of waiting 8 hours. The cap counts
  // expires_at > now(), not every room ever created by this network, so freeing one slot lets
  // the 21st room through without touching the other 19 or the rejected room's absence above.
  await psql(`update vof_relay.rooms set expires_at = now() - interval '1 minute' where room_id = '${created[0]}';`);
  const afterExpiry = await exchange(hostRequest('Netcap_A_20', secret('n20')), 'anon', { callerIp });
  assert.equal(findEvent(afterExpiry, 'READY')?.role, 'host', 'an expired room frees its network a slot');

  await psql("delete from vof_relay.rooms where room_id ~ '^Netcap_A_';");
  await psql('delete from vof_relay.room_creation_ledger;');
});

// RELAY-CAP concurrency: the count-then-insert cap check is only safe because every host
// 'connect' takes vof_relay_room_capacity's project-wide advisory lock first, serializing it
// against every other concurrent room creation, this network's own included. Without that
// lock, 25 concurrent creators racing the same "count my network's open rooms" read before any
// of them commits their insert can all observe fewer than 20 and all be admitted (proven: 25 of
// 25 through with the lock removed). Each creator here is its own psql process and therefore
// its own database connection, matching 25 real, simultaneous browser tabs on one network.
//
// RELAY6: this was flaky as a guard. With the advisory lock removed, ordinary machine speed
// let all 25 connections race through the count-then-insert window close enough together that
// only 1 of 3 runs actually caught the regression.
// A test-only BEFORE INSERT trigger on vof_relay.room_creation_ledger below sleeps about 100ms,
// which every host 'connect' path passes through (the ledger row is inserted right after the
// per-network count check and before the room itself is inserted), so every one of the 25
// connections is forced to read its network's open-room count before any of them can commit.
// This makes the race deterministic regardless of hardware speed. The trigger is created here
// and dropped in the finally below, never in the migration itself: it exists only to widen a
// race window on purpose for this test, which the shipped RPC must never do.
test('25 concurrent room creations from one network, each its own connection, let through exactly 20', async () => {
  await psql('delete from vof_relay.room_creation_ledger;');
  const callerIp = '203.0.113.55';
  await psql(`
    create or replace function vof_relay.test_only_ledger_insert_delay() returns trigger
    language plpgsql as $delay$
    begin
      perform pg_sleep(0.1);
      return new;
    end;
    $delay$;
    create trigger test_only_ledger_insert_delay before insert on vof_relay.room_creation_ledger
      for each row execute function vof_relay.test_only_ledger_insert_delay();
  `);
  try {
    const results = await Promise.all(Array.from({ length: 25 }, (_, index) =>
      exchange(hostRequest(`Netcap_Race_${index}`, secret(`r${index}`)), 'anon', { callerIp })
        .then((response) => ({ ready: findEvent(response, 'READY'), error: findEvent(response, 'ERROR') }))));
    const succeeded = results.filter((entry) => entry.ready);
    const failed = results.filter((entry) => entry.error);
    assert.equal(succeeded.length, 20, `expected exactly 20 of 25 concurrent creators from one network to succeed, saw ${succeeded.length}`);
    assert.equal(failed.length, 5, `expected exactly 5 of 25 concurrent creators from one network to be rejected, saw ${failed.length}`);
    assert.ok(failed.every((entry) => /already has 20 open games/i.test(entry.error.reason)), 'every rejection must be the per-network cap, not some other error');
    assert.equal(Number(await psql("select count(*) from vof_relay.rooms where room_id ~ '^Netcap_Race_';")), 20, 'exactly 20 rooms actually exist regardless of which 20 of the 25 racing creators won');
  } finally {
    await psql(`
      drop trigger if exists test_only_ledger_insert_delay on vof_relay.room_creation_ledger;
      drop function if exists vof_relay.test_only_ledger_insert_delay();
    `);
  }

  await psql("delete from vof_relay.rooms where room_id ~ '^Netcap_Race_';");
  await psql('delete from vof_relay.room_creation_ledger;');
});

test('a second network has its own independent open-room cap, and a reconnect, reload, or attendee join at the cap still works', async () => {
  await psql('delete from vof_relay.room_creation_ledger;');
  const callerIp = '203.0.113.60';
  const created = [];
  for (let index = 0; index < 20; index += 1) {
    const roomId = `Netcap_B_${index}`;
    await exchange(hostRequest(roomId, secret(`b${index}`)), 'anon', { callerIp });
    created.push(roomId);
  }
  const rejected = await exchange(hostRequest('Netcap_B_20', secret('b20')), 'anon', { callerIp });
  assert.match(findEvent(rejected, 'ERROR')?.reason ?? '', /already has 20 open games/i);

  const otherNetwork = await exchange(hostRequest('Netcap_Other', secret('o1')), 'anon', { callerIp: '198.51.100.60' });
  assert.equal(findEvent(otherNetwork, 'READY')?.role, 'host', 'a different network has its own, unexhausted cap');

  const firstRoomId = created[0];
  const reconnect = await exchange(hostRequest(firstRoomId, secret('b0')), 'anon', { callerIp });
  assert.equal(findEvent(reconnect, 'READY')?.role, 'host', 'reconnecting to an already-owned room never consumes or checks the open-room cap');
  const reload = await exchange(hostRequest(firstRoomId, secret('b0')), 'anon', { callerIp });
  assert.equal(findEvent(reload, 'READY')?.role, 'host', 'a host reload against the same room keeps working while the network is at its cap');
  const attendee = await exchange(attendeeRequest(firstRoomId, 'device_netcap_B', secret('d1')), 'anon', { callerIp: '198.51.100.61' });
  assert.equal(findEvent(attendee, 'READY')?.role, 'attendee', 'a phone joining an existing room is never subject to the open-room cap');

  await psql("delete from vof_relay.rooms where room_id ~ '^Netcap_(B_|Other)';");
  await psql('delete from vof_relay.room_creation_ledger;');
});

test("the per-network cap counts only currently-unexpired rooms, not every room a network has ever created", async () => {
  await psql('delete from vof_relay.room_creation_ledger;');
  const callerIp = '203.0.113.65';
  // 8 real, currently-open rooms, well under the 20-room cap.
  for (let index = 0; index < 8; index += 1) {
    await exchange(hostRequest(`Netcap_Window_${index}`, secret(`w${index}`)), 'anon', { callerIp });
  }
  // 20 more rooms for the same network, inserted directly (bypassing the RPC and its ledger),
  // already expired. If the per-network cap's expires_at predicate were ever removed, these
  // would count toward the same network's cap forever, even long after they expired, and the
  // opportunistic project-wide expired-room sweep at the top of every call only removes up to
  // 8 rows per call, so at least 12 of these 20 are still physically present (8 open + 12
  // leftover expired = 20) when the probe below runs its own single sweep-then-check.
  await psql(`
    insert into vof_relay.rooms(room_id, host_credential_hash, host_seen_at, expires_at, host_rate_window_at, creating_network_key)
    select 'Netcap_Window_Expired_' || series, extensions.digest('window_secret_' || lpad(series::text, 24, 'x'), 'sha256'),
      now() - interval '9 hours', now() - interval '1 hour', now() - interval '9 hours', '${callerIp}'
    from generate_series(1, 20) series;
  `);
  const probe = await exchange(hostRequest('Netcap_Window_Probe', secret('wp')), 'anon', { callerIp });
  assert.equal(findEvent(probe, 'READY')?.role, 'host', "expired rooms this network created must never count toward its 20-room cap, no matter how many of them still physically exist");

  await psql("delete from vof_relay.rooms where room_id ~ '^Netcap_Window_';");
  await psql('delete from vof_relay.room_creation_ledger;');
});

test("rooms created before this migration (a null network key) count toward no network's cap", async () => {
  await psql('delete from vof_relay.room_creation_ledger;');
  // Simulate 25 legacy rows: created directly, bypassing the RPC entirely, the way rooms created
  // before this migration exist today with creating_network_key left at its default null.
  await psql(`
    insert into vof_relay.rooms(room_id, host_credential_hash, host_seen_at, expires_at, host_rate_window_at, creating_network_key)
    select 'Legacy_' || series, extensions.digest('legacy_secret_' || lpad(series::text, 24, 'x'), 'sha256'), now(), now() + interval '1 hour', now(), null
    from generate_series(1, 25) series;
  `);
  const response = await exchange(hostRequest('Netcap_Legacy_Probe', secret('L1')), 'anon', { callerIp: '203.0.113.70' });
  assert.equal(findEvent(response, 'READY')?.role, 'host', "25 null-key legacy rooms never count toward a real network's 20-room cap");

  await psql("delete from vof_relay.rooms where room_id ~ '^(Legacy_|Netcap_Legacy_Probe$)';");
  await psql('delete from vof_relay.room_creation_ledger;');
});

test('IPv6 addresses bucket by their /64 prefix: two addresses in one prefix share a cap, a different prefix does not', async () => {
  await psql('delete from vof_relay.room_creation_ledger;');
  const addressA = '2001:db8:aaaa:1::1';
  const addressB = '2001:db8:aaaa:1::2';
  for (let index = 0; index < 20; index += 1) {
    const roomId = `Netcap_V6_${index}`;
    const response = await exchange(hostRequest(roomId, secret(`v${index}`)), 'anon', { callerIp: index % 2 === 0 ? addressA : addressB });
    assert.equal(findEvent(response, 'READY')?.role, 'host', `room ${index} from either address in the shared /64 must succeed`);
  }
  const rejected = await exchange(hostRequest('Netcap_V6_20', secret('v20')), 'anon', { callerIp: addressA });
  assert.match(findEvent(rejected, 'ERROR')?.reason ?? '', /already has 20 open games/i, 'both addresses in the /64 share one exhausted cap');

  const otherPrefix = await exchange(hostRequest('Netcap_V6_Other_Prefix', secret('v21')), 'anon', { callerIp: '2001:db8:aaaa:2::1' });
  assert.equal(findEvent(otherPrefix, 'READY')?.role, 'host', 'a different /64 prefix has its own, unexhausted cap');

  await psql("delete from vof_relay.rooms where room_id ~ '^Netcap_V6_';");
  await psql('delete from vof_relay.room_creation_ledger;');
});

test('an IPv4-mapped IPv6 address keys by its IPv4 form, not by the shared ::/64 every mapped address falls in', async () => {
  await psql('delete from vof_relay.room_creation_ledger;');
  const mappedA = '::ffff:198.51.100.4';
  const mappedB = '::ffff:203.0.113.9';
  for (let index = 0; index < 20; index += 1) {
    const response = await exchange(hostRequest(`Netcap_MappedA_${index}`, secret(`ma${index}`)), 'anon', { callerIp: mappedA });
    assert.equal(findEvent(response, 'READY')?.role, 'host', `room ${index} for the first mapped address must succeed`);
  }
  const rejectedA = await exchange(hostRequest('Netcap_MappedA_20', secret('ma20')), 'anon', { callerIp: mappedA });
  assert.match(findEvent(rejectedA, 'ERROR')?.reason ?? '', /already has 20 open games/i, 'the first mapped address is capped at its own 20');

  const otherMapped = await exchange(hostRequest('Netcap_MappedB_0', secret('mb0')), 'anon', { callerIp: mappedB });
  assert.equal(findEvent(otherMapped, 'READY')?.role, 'host', 'a different mapped IPv4 address has its own, unexhausted cap: mapped addresses do not share ::/64');

  const plainEquivalent = await exchange(hostRequest('Netcap_MappedA_PlainEquivalent', secret('mp1')), 'anon', { callerIp: '198.51.100.4' });
  assert.match(findEvent(plainEquivalent, 'ERROR')?.reason ?? '', /already has 20 open games/i, "the mapped address's bare IPv4 form shares its exhausted cap, proving both key identically");

  await psql("delete from vof_relay.rooms where room_id ~ '^Netcap_MappedA_|^Netcap_MappedB_';");
  await psql('delete from vof_relay.room_creation_ledger;');
});

// Each of these three fallback paths gets its own ledger-cleared 22-room run (more than the
// 20-room cap, safely under the 40-per-60s global budget) rather than sharing one smaller
// count across all three: a mutant that returns some OTHER literal on just one of these paths
// (instead of the real 'unknown') would make every one of that path's calls share that literal
// as a real, capped network key, and only a run past 20 on that specific path catches it. A
// combined run under 20 per path could pass even with that regression in place.
test('no request.headers at all falls back to the unknown bucket and skips the per-network cap', async () => {
  await psql('delete from vof_relay.room_creation_ledger;');
  for (let index = 0; index < 22; index += 1) {
    const roomId = `Netcap_NoHeaders_${index}`;
    const response = await exchange(hostRequest(roomId, secret(`nh${index}`)), 'anon', { noHeaders: true });
    assert.equal(findEvent(response, 'READY')?.role, 'host', `room ${index} with no request.headers at all must succeed past the 20-room network cap`);
  }
  await psql("delete from vof_relay.rooms where room_id ~ '^Netcap_NoHeaders_';");
  await psql('delete from vof_relay.room_creation_ledger;');
});

test('a headers object with no cf-connecting-ip key falls back to the unknown bucket and skips the per-network cap', async () => {
  await psql('delete from vof_relay.room_creation_ledger;');
  for (let index = 0; index < 22; index += 1) {
    const roomId = `Netcap_KeylessHeaders_${index}`;
    const response = await exchange(hostRequest(roomId, secret(`kh${index}`)), 'anon', { headers: {} });
    assert.equal(findEvent(response, 'READY')?.role, 'host', `room ${index} with a headers object carrying no cf-connecting-ip key must succeed past the 20-room network cap`);
  }
  await psql("delete from vof_relay.rooms where room_id ~ '^Netcap_KeylessHeaders_';");
  await psql('delete from vof_relay.room_creation_ledger;');
});

test('a present but empty cf-connecting-ip value falls back to the unknown bucket and skips the per-network cap', async () => {
  await psql('delete from vof_relay.room_creation_ledger;');
  for (let index = 0; index < 22; index += 1) {
    const roomId = `Netcap_EmptyHeader_${index}`;
    const response = await exchange(hostRequest(roomId, secret(`eh${index}`)), 'anon', { headers: { 'cf-connecting-ip': '' } });
    assert.equal(findEvent(response, 'READY')?.role, 'host', `room ${index} with an empty cf-connecting-ip value must succeed past the 20-room network cap`);
  }
  await psql("delete from vof_relay.rooms where room_id ~ '^Netcap_EmptyHeader_';");
  await psql('delete from vof_relay.room_creation_ledger;');
});

test('a malformed connecting-ip value falls back to the unknown bucket rather than being used as a literal network key', async () => {
  await psql('delete from vof_relay.room_creation_ledger;');
  const malformed = 'not-an-ip-address';
  for (let index = 0; index < 22; index += 1) {
    const roomId = `Netcap_Malformed_${index}`;
    const response = await exchange(hostRequest(roomId, secret(`m${index}`)), 'anon', { callerIp: malformed });
    // If the fallback ever returned the raw, unparsable header value instead of 'unknown', every
    // one of these 22 requests would share that literal string as their network key, and the 21st
    // would be rejected by the 20-room cap exactly like a real, attributable network would be.
    assert.equal(findEvent(response, 'READY')?.role, 'host', `room ${index} with a malformed connecting-ip must not be capped as if it were a real network`);
  }
  await psql("delete from vof_relay.rooms where room_id ~ '^Netcap_Malformed_';");
  await psql('delete from vof_relay.room_creation_ledger;');
});

test("the global creation-rate budget only counts its own 60-second window, not the ledger's full history", async () => {
  await psql('delete from vof_relay.room_creation_ledger;');
  // 40 rows dated well outside the 60-second window. If that window predicate were ever removed
  // from the global count, this alone would already read as 40 and the very next room would be
  // wrongly rejected.
  await psql(`
    insert into vof_relay.room_creation_ledger(created_at)
    select now() - interval '5 minutes'
    from generate_series(1, 40) series;
  `);
  const response = await exchange(hostRequest('Window_Probe', secret('w1')), 'anon', { callerIp: '203.0.113.80' });
  assert.equal(findEvent(response, 'READY')?.role, 'host', 'ledger rows outside the 60-second window must not count against the global budget');

  await psql("delete from vof_relay.rooms where room_id = 'Window_Probe';");
  await psql('delete from vof_relay.room_creation_ledger;');
});

test('the global ledger prunes rows older than 15 minutes when a new room is created', async () => {
  await psql('delete from vof_relay.room_creation_ledger;');
  await psql(`
    insert into vof_relay.room_creation_ledger(created_at)
    select now() - interval '20 minutes'
    from generate_series(1, 5) series;
  `);
  assert.equal(Number(await psql('select count(*) from vof_relay.room_creation_ledger;')), 5);
  await exchange(hostRequest('Prune_Probe', secret('p1')), 'anon', { callerIp: '203.0.113.81' });
  assert.equal(Number(await psql('select count(*) from vof_relay.room_creation_ledger;')), 1, 'the 5 rows older than 15 minutes are pruned by the next room creation, leaving only its own fresh ledger row');

  await psql("delete from vof_relay.rooms where room_id = 'Prune_Probe';");
  await psql('delete from vof_relay.room_creation_ledger;');
});

test('anonymous room creation is bounded globally across distinct networks, separately from the per-network and 500-room bounds', async () => {
  await psql("delete from vof_relay.room_creation_ledger;");
  const results = [];
  for (let index = 0; index < 41; index += 1) {
    const roomId = `Budget_Global_${index}`;
    const response = await exchange(hostRequest(roomId, secret(`g${index}`)), 'anon', { callerIp: `192.0.2.${index}` });
    results.push({ roomId, ready: findEvent(response, 'READY'), error: findEvent(response, 'ERROR') });
  }
  const succeeded = results.filter((entry) => entry.ready);
  const failed = results.filter((entry) => entry.error);
  assert.equal(succeeded.length, 40, 'exactly the first 40 distinct-network creations in the window succeed');
  assert.equal(failed.length, 1, "the 41st is rejected even though every network is well under its own 20-open-room cap");
  assert.match(failed[0].error.reason, /creating rooms too quickly/i);
  assert.notEqual(failed[0].error.reason, 'This network already has 20 open games, so reopen one you started on this device or try again later.', 'the global reason is distinct from the per-network reason');

  await psql("delete from vof_relay.rooms where room_id ~ '^Budget_Global_[0-9]+$';");
  await psql('delete from vof_relay.room_creation_ledger;');
});

test('the 250-device room bound accepts its edge and rejects the next identity', async () => {
  const roomId = 'Room_Devices';
  await exchange(hostRequest(roomId, secret('h')));
  await psql(`
    insert into vof_relay.devices(room_id, device_id, credential_hash, seen_at, rate_window_at)
    select '${roomId}', 'seed_' || series, extensions.digest('seed_secret_' || lpad(series::text, 24, 'x'), 'sha256'), now(), now()
    from generate_series(1, 249) series;
  `);
  assert.equal(findEvent(await exchange(attendeeRequest(roomId, 'device_250', secret('y'))), 'READY')?.role, 'attendee');
  assert.match(findEvent(await exchange(attendeeRequest(roomId, 'device_251', secret('z'))), 'ERROR')?.reason ?? '', /capacity/i);
});

test('host polling chunks a full inbox below the 128 KiB response boundary', async () => {
  const roomId = 'Room_Response_Bound';
  await exchange(hostRequest(roomId, secret('h')));
  await psql(`
    insert into vof_relay.inbox(room_id, device_id, message_id, event)
    select '${roomId}', 'device_' || series, 'message_' || series,
      jsonb_build_object('kind','CLIENT_MESSAGE','message',jsonb_build_object(
        'version',1,'type','HELLO','roomId','${roomId}','sessionId','run_1','deviceId','device_' || series,
        'messageId','message_' || series,'nickname',repeat('n',40)
      ))
    from generate_series(1, 1000) series;
  `);
  const first = await exchange(hostRequest(roomId, secret('h'), 'poll'));
  const delivered = first.events.filter((event) => event.kind === 'CLIENT_MESSAGE').length;
  assert.ok(delivered > 0 && delivered < 1000, `expected a nonempty bounded chunk, received ${delivered}`);
  assert.ok(Buffer.byteLength(JSON.stringify(first), 'utf8') <= 128 * 1024);
  const second = await exchange(hostRequest(roomId, secret('h'), 'poll', { consumeCursor: first.inboxCursor }));
  assert.ok(second.events.some((event) => event.kind === 'CLIENT_MESSAGE'), 'remaining messages arrive after cursor acknowledgement');
});

test('simultaneous independent clients preserve every claimed device', async () => {
  const roomId = 'Room_Concurrent';
  await exchange(hostRequest(roomId, secret('h')));
  const clients = Array.from({ length: 16 }, (_, index) => ({ deviceId: `device_${index}`, credential: secret(String.fromCharCode(97 + index)) }));
  const responses = await Promise.all(clients.map(({ deviceId, credential }) => exchange(attendeeRequest(roomId, deviceId, credential))));
  assert.equal(responses.filter((response) => findEvent(response, 'READY')?.role === 'attendee').length, clients.length);
  assert.equal(Number(await psql(`select count(*) from vof_relay.devices where room_id = '${roomId}';`)), clients.length);
  const replay = await exchange(hostRequest(roomId, secret('h'), 'poll'));
  assert.equal(new Set(replay.events.filter((event) => event.kind === 'ATTENDEE_CONNECTED').map((event) => event.deviceId)).size, clients.length);
});

// STREAK-PILL drift contract (RELAY-STREAK): the same attendee-state result, unchanged, is checked
// against all three surfaces that must accept streakBonus in lockstep: src/network/guards.ts (the
// client), server/room-relay.mjs (the dev relay), and vof_relay.valid_attendee_state (the production
// SQL contract, exercised directly here rather than through the full RPC). Reverting the widening in
// any single one of the three, alone, fails this one test: guards.ts alone makes the guards step
// throw, the dev relay alone turns the relay step's ATTENDEE_STATE into an ERROR, and the SQL
// migration alone makes the sql step return 'f'. A bad value (over the 100 bound, negative, or
// non-integer) must be rejected by all three, not merely one.

/** Runs src/network/guards.ts's real validateAttendeeState in a fresh child process (this test file
 * runs under plain `node --test`, with no tsx loader, so a TS import must happen out of process). */
async function realValidateAttendeeState(attendeeState, sessionId) {
  const source = `
    import { validateAttendeeState } from './src/network/guards.ts';
    const state = ${JSON.stringify(attendeeState)};
    process.stdout.write(JSON.stringify(validateAttendeeState(state, ${JSON.stringify(sessionId)})));
  `;
  const { stdout } = await execFileAsync(process.execPath, ['--import', 'tsx', '--input-type=module', '--eval', source], {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 2 * 1024 * 1024,
  });
  return JSON.parse(stdout);
}

/** Sends one DIRECT ATTENDEE_STATE through a fresh in-process dev relay (server/room-relay.mjs) and
 * reports whether the phone actually received it (true) or the host was told it was invalid (false). */
async function realDevRelayAcceptsAttendeeState(state) {
  const server = http.createServer((_request, response) => response.end('relay'));
  const relay = attachRoomRelay(server);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const base = `ws://127.0.0.1:${port}`;
  const roomId = `Room_Drift_${Math.random().toString(36).slice(2)}`;
  const open = (registration) => new Promise((resolve, reject) => {
    const socket = new WebSocket(`${base}/api/rooms/${roomId}/ws`, { headers: { origin: base.replace('ws:', 'http:') } });
    const messages = [];
    socket.on('message', (raw) => { const message = JSON.parse(raw.toString()); messages.push(message); if (message.kind === 'READY') resolve({ socket, messages }); });
    socket.on('error', reject);
    socket.on('open', () => socket.send(JSON.stringify({ kind: 'CONNECT', version: 1, roomId, ...registration })));
    setTimeout(() => reject(new Error('Timed out opening relay client')), 1500).unref();
  });
  const waitFor = (client, predicate, timeout = 800) => new Promise((resolve, reject) => {
    const existing = client.messages.find(predicate);
    if (existing) { resolve(existing); return; }
    const started = Date.now();
    const interval = setInterval(() => {
      const found = client.messages.find(predicate);
      if (found) { clearInterval(interval); resolve(found); }
      else if (Date.now() - started > timeout) { clearInterval(interval); reject(new Error('Timed out waiting for relay message')); }
    }, 10);
  });
  try {
    const host = await open({ role: 'host', credential: secret('drift_h') });
    const phone = await open({ role: 'attendee', credential: secret('drift_a'), deviceId: 'device_drift' });
    host.socket.send(JSON.stringify({ kind: 'DIRECT', deviceId: 'device_drift', message: { kind: 'ATTENDEE_STATE', state } }));
    const outcome = await Promise.race([
      waitFor(phone, (message) => message.kind === 'ATTENDEE_STATE').then(() => true),
      waitFor(host, (message) => message.kind === 'ERROR').then(() => false),
    ]);
    host.socket.close();
    phone.socket.close();
    return outcome;
  } finally {
    await relay.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

async function realSqlAcceptsAttendeeState(state) {
  const encoded = Buffer.from(JSON.stringify(state), 'utf8').toString('base64');
  return (await psql(`select vof_relay.valid_attendee_state(convert_from(decode('${encoded}', 'base64'), 'utf8')::jsonb);`)) === 't';
}

function driftFixture(streakBonus) {
  return {
    sessionId: 'run_drift', registered: true, nickname: 'Ada', team: 'NAVY', vote: null,
    result: {
      questionInstanceId: 'run_drift:0:q1', choice: 'true', isCorrect: true, points: 150,
      ...(streakBonus === undefined ? {} : { streakBonus }),
    },
    score: 150, correct: 1, answered: 1, accuracy: 100, bestStreak: 3, rank: 1, totalParticipants: 1, commitments: [],
  };
}

test('an in-bound streakBonus validates across guards.ts, the dev relay, and the production SQL contract at once', async () => {
  // 100 (the every-5-streak milestone, and scoring.ts's real ceiling) is the upper bound itself, not
  // just a value under it: a bound quietly lowered to 99 or 60 (server/room-relay.mjs's
  // MAX_STREAK_BONUS, or the SQL bound) would reject this and silently drop whole personal states on
  // every 5-streak, while the earlier out-of-bound test (101) alone would stay green.
  for (const streakBonus of [50, 100]) {
    const state = driftFixture(streakBonus);
    assert.equal(await realValidateAttendeeState(state, 'run_drift'), true, `src/network/guards.ts (${streakBonus})`);
    assert.equal(await realDevRelayAcceptsAttendeeState(state), true, `server/room-relay.mjs (${streakBonus})`);
    assert.equal(await realSqlAcceptsAttendeeState(state), true, `vof_relay.valid_attendee_state (${streakBonus})`);
  }
});

test('a result with no streakBonus at all still validates across all three surfaces (old clients, old stored states)', async () => {
  const state = driftFixture(undefined);
  assert.equal(await realValidateAttendeeState(state, 'run_drift'), true, 'src/network/guards.ts');
  assert.equal(await realDevRelayAcceptsAttendeeState(state), true, 'server/room-relay.mjs');
  assert.equal(await realSqlAcceptsAttendeeState(state), true, 'vof_relay.valid_attendee_state');
});

test('an out-of-bound streakBonus is rejected by all three surfaces, not just one', async () => {
  for (const bad of [101, -1, 12.5]) {
    const state = driftFixture(bad);
    assert.equal(await realValidateAttendeeState(state, 'run_drift'), false, `src/network/guards.ts rejects ${bad}`);
    assert.equal(await realDevRelayAcceptsAttendeeState(state), false, `server/room-relay.mjs rejects ${bad}`);
    assert.equal(await realSqlAcceptsAttendeeState(state), false, `vof_relay.valid_attendee_state rejects ${bad}`);
  }
});

// STREAK-PILL migration proof: a dedicated, isolated Postgres cluster (not the shared one from the
// top-level before() hook, which already has all five migrations applied) proves the migration is a
// real RED-to-GREEN change, not a no-op, and that its rollback restores the exact prior function body.
test('the streak-bonus migration is RED before it applies and GREEN after, and its rollback restores the exact prior function body', async () => {
  const migrationDirectory = path.join(repoRoot, 'supabase/migrations');
  const baseMigrationPaths = [
    '20260913170036_vax_or_fiction_production_relay.sql',
    '20260913175713_vax_or_fiction_production_relay_lobby_state.sql',
    '20260915005736_vax_or_fiction_production_relay_explaining.sql',
    '20260926140000_vax_or_fiction_production_relay_anonymous_room_budget.sql',
  ].map((name) => path.join(migrationDirectory, name));
  const streakMigrationPath = path.join(migrationDirectory, '20260926150000_vax_or_fiction_production_relay_streak_bonus.sql');
  const rollbackPath = path.join(repoRoot, 'supabase/migrations-rollback/20260926150000_vax_or_fiction_production_relay_streak_bonus_rollback.sql');

  const migrationRoot = await mkdtemp(path.join(repoRoot, 'work/streak-bonus-migration-postgres-'));
  const migrationDataDir = path.join(migrationRoot, 'data');
  const migrationPort = await freePort();
  const run = async (sql) => (await command('psql', ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', String(migrationPort), '-d', 'postgres', '-c', sql])).stdout.trim();
  const applyFile = (filePath) => command('psql', ['-X', '-1', '-q', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', String(migrationPort), '-d', 'postgres', '-f', filePath]);
  const acceptsEncoded = async (state) => {
    const encoded = Buffer.from(JSON.stringify(state), 'utf8').toString('base64');
    return run(`select vof_relay.valid_attendee_state(convert_from(decode('${encoded}', 'base64'), 'utf8')::jsonb);`);
  };
  const fingerprint = () => run("select md5(prosrc) || ':' || length(prosrc) from pg_proc where oid = 'vof_relay.valid_attendee_state(jsonb)'::regprocedure;");

  try {
    await command('initdb', ['-D', migrationDataDir, '--no-locale', '--encoding=UTF8', '--auth=trust']);
    await command('pg_ctl', ['-D', migrationDataDir, '-l', path.join(migrationRoot, 'postgres.log'), '-o', `-F -p ${migrationPort} -h 127.0.0.1`, 'start', '-w']);
    await run('create role anon nologin; create role authenticated nologin; create schema extensions; create extension pgcrypto with schema extensions;');
    for (const migrationPath of baseMigrationPaths) await applyFile(migrationPath);

    const withBonus = driftFixture(50);
    const withoutBonus = driftFixture(undefined);

    assert.equal(await acceptsEncoded(withBonus), 'f', 'RED: streakBonus is rejected before the migration applies');
    assert.equal(await acceptsEncoded(withoutBonus), 't', 'a result with no streakBonus already validates before the migration (unaffected baseline)');

    const before = await fingerprint();
    const [beforeMd5] = before.split(':');

    await applyFile(streakMigrationPath);

    assert.equal(await acceptsEncoded(withBonus), 't', 'GREEN: streakBonus is accepted after the migration applies');
    assert.equal(await acceptsEncoded(withoutBonus), 't', 'a result with no streakBonus still validates after the migration');
    assert.equal(await acceptsEncoded(driftFixture(100)), 't', 'a streakBonus of exactly 100 (scoring.ts\'s real maximum, the every-5-streak milestone) is accepted, not just values under it');
    assert.equal(await acceptsEncoded(driftFixture(101)), 'f', 'a streakBonus above 100 (scoring.ts\'s real maximum) is rejected');
    assert.equal(await acceptsEncoded(driftFixture(-1)), 'f', 'a negative streakBonus is rejected');
    assert.equal(await acceptsEncoded(driftFixture(12.5)), 'f', 'a non-integer streakBonus is rejected');

    const after = await fingerprint();
    const [afterMd5] = after.split(':');
    assert.notEqual(afterMd5, beforeMd5, 'the migration actually replaced the function body, not a no-op');

    await applyFile(rollbackPath);

    assert.equal(await fingerprint(), before, 'the rollback restores the exact prior md5(prosrc) and length(prosrc)');
    assert.equal(await acceptsEncoded(withBonus), 'f', 'after rollback, streakBonus is rejected again, matching pre-migration behavior');
    assert.equal(await acceptsEncoded(withoutBonus), 't', 'after rollback, a plain result still validates');

    console.log(`STREAK-PILL fingerprint: before=${before} after=${after}`);
  } finally {
    await command('pg_ctl', ['-D', migrationDataDir, 'stop', '-m', 'fast', '-w']).catch(() => {});
    await rm(migrationRoot, { recursive: true, force: true });
  }
});

// VOF-RELOAD: a page reload builds a brand-new connection with personalRevision reset to 0 (that
// number is never persisted client-side), so this is exactly the request src/network/production-
// room.ts sends after the build-skew guard reloads a phone. It carries no HELLO. The server, not
// the client, is what must hand the same registered identity back on a plain 'connect', which is
// why this lives against the real SQL RPC rather than as a stub in production-relay-client.test.ts.
test('an attendee reconnect (what a page reload sends) redelivers its own registered ATTENDEE_STATE without a fresh HELLO', async () => {
  const roomId = 'Room_Reload';
  await exchange(hostRequest(roomId, secret('h')));
  await exchange(attendeeRequest(roomId, 'device_A', secret('a')));

  const hello = { version: 1, type: 'HELLO', roomId, sessionId: 'run_reload', deviceId: 'device_A', messageId: 'hello_reload', nickname: 'Ada', team: 'NAVY' };
  await exchange(attendeeRequest(roomId, 'device_A', secret('a'), 'send', { message: { kind: 'CLIENT_MESSAGE', message: hello } }));
  await exchange(hostRequest(roomId, secret('h'), 'poll'));

  const personalState = {
    sessionId: 'run_reload', registered: true, nickname: 'Ada', team: 'NAVY', vote: null, result: null,
    score: 0, correct: 0, answered: 0, accuracy: null, bestStreak: 0, rank: null, totalParticipants: 1, commitments: [],
  };
  assert.equal(findEvent(await exchange(hostRequest(roomId, secret('h'), 'send', {
    message: { kind: 'DIRECT', deviceId: 'device_A', message: { kind: 'ATTENDEE_STATE', state: personalState } },
  })), 'ERROR'), undefined);

  const reconnect = await exchange(attendeeRequest(roomId, 'device_A', secret('a'), 'connect'));
  const restored = findEvent(reconnect, 'ATTENDEE_STATE');
  assert.ok(restored, 'a plain connect must redeliver the attendee\'s own personal state with no new HELLO sent');
  assert.deepEqual(restored.state, personalState);
  assert.equal(restored.state.registered, true, 'the phone must not be asked to join again after the reload');
});

// ROOM-EMPHASIS (20260929140000): the stem, reveal and closing phrase lists and the reply flag cross three validators
// that must agree, src/network/guards.ts on the phone, server/room-relay.mjs in dev, and the production SQL. Every case
// below runs through all three, at each bound's edge and one past it, so narrowing or widening any one of them alone
// fails this test.
const EMPHASIS_ROOM = 'Room_Emphasis';

function emphasisRoomState({ questionData = {}, reveal = {}, showdownQuestion } = {}, roomId = EMPHASIS_ROOM) {
  const question = (patch) => ({
    id: 'q1', questionInstanceId: 'run_emphasis:0:q1', kind: 'binary', statement: 'Only a synthetic stem.', number: 1, total: 1,
    options: [{ token: 'true', label: 'VAX', text: 'Vax' }, { token: 'false', label: 'FICTION', text: 'Fiction' }], ...patch,
  });
  // A Showdown duel carries its question inside the showdown, which the relay checks with the same question validator.
  const showdown = showdownQuestion === undefined ? null : {
    id: 'run_emphasis:showdown', stage: 'duel', predictions: {}, winner: null, question: question(showdownQuestion),
    finalists: [{ ticket: 'a', name: 'Ada', score: 300, duelPoints: 1 }, { ticket: 'b', name: 'Ben', score: 250, duelPoints: 0 }],
  };
  return {
    version: 1, roomId, sessionId: 'run_emphasis', revision: 1, phase: showdown ? 'showdown' : 'revealed', slideIndex: 0, slideCount: 1, question: 'q1',
    questionData: showdown ? null : question(questionData),
    reveal: showdown ? null : { answerLabel: 'VAX', answerToken: 'true', explanation: 'Every time, a synthetic reason.', takeaway: 'Always a synthetic takeaway.', citations: [], ...reveal },
    votesLocked: true, timerSeconds: 0, timerDurationSeconds: 0, timerRunning: false, participants: 1,
    teamScores: null, leaderboard: [], showdown, hostConnected: true,
  };
}

const repeated = (count, value) => Array.from({ length: count }, () => value);
const EMPHASIS_CASES = [
  ['the old shape, with no new key', {}, true],
  ['a stem list and the reply flag', { questionData: { emphasis: ['Only'], reply: true } }, true],
  ['reply false', { questionData: { reply: false } }, true],
  ['eight stem phrases, the bound', { questionData: { emphasis: repeated(8, 'a') } }, true],
  ['nine stem phrases', { questionData: { emphasis: repeated(9, 'a') } }, false],
  ['a 128-character phrase, the bound', { questionData: { emphasis: ['x'.repeat(128)] } }, true],
  ['a 129-character phrase', { questionData: { emphasis: ['x'.repeat(129)] } }, false],
  ['128 astral characters (code points, not UTF-16 units)', { questionData: { emphasis: ['\u{1F600}'.repeat(128)] } }, true],
  ['129 astral characters', { questionData: { emphasis: ['\u{1F600}'.repeat(129)] } }, false],
  ['an empty phrase', { questionData: { emphasis: [''] } }, false],
  ['a phrase that is not a string', { questionData: { emphasis: [7] } }, false],
  ['a stem list that is a string', { questionData: { emphasis: 'Only' } }, false],
  ['reply as a string', { questionData: { reply: 'true' } }, false],
  ['a null reply', { questionData: { reply: null } }, false],
  ['reveal and takeaway lists', { reveal: { explanationEmphasis: ['Every time'], takeawayEmphasis: ['Always'] } }, true],
  ['sixteen closing lines, the bound', { reveal: { takeawayLineEmphasis: repeated(16, []) } }, true],
  ['seventeen closing lines', { reveal: { takeawayLineEmphasis: repeated(17, []) } }, false],
  ['a closing line that is a phrase, not a list', { reveal: { takeawayLineEmphasis: ['Always'] } }, false],
  ['a closing line with nine phrases', { reveal: { takeawayLineEmphasis: [repeated(9, 'a')] } }, false],
  ['a null takeaway list', { reveal: { takeawayEmphasis: null } }, false],
  ['a reveal key on the question', { questionData: { takeawayEmphasis: ['Always'] } }, false],
  ['a question key on the reveal', { reveal: { emphasis: ['Only'] } }, false],
  ['an empty stem list', { questionData: { emphasis: [] } }, true],
  ['a null stem list', { questionData: { emphasis: null } }, false],
  ['a null closing list', { reveal: { takeawayLineEmphasis: null } }, false],
  ['a closing line holding an empty phrase', { reveal: { takeawayLineEmphasis: [['']] } }, false],
  ['a closing line holding a null phrase', { reveal: { takeawayLineEmphasis: [[null]] } }, false],
  ['a Showdown question with stem phrases and the reply flag', { showdownQuestion: { emphasis: ['Only'], reply: true } }, true],
  ['a Showdown question with nine stem phrases', { showdownQuestion: { emphasis: repeated(9, 'a') } }, false],
  ['a Showdown question with a reply of the wrong type', { showdownQuestion: { reply: 'yes' } }, false],
];

/** src/network/guards.ts's real validatePublicRoomState over a batch, in one child process (this file has no tsx loader). */
async function realGuardsAcceptRoomStates(states) {
  const source = `
    import { validatePublicRoomState } from './src/network/guards.ts';
    const states = ${JSON.stringify(states)};
    process.stdout.write(JSON.stringify(states.map((state) => validatePublicRoomState(state, ${JSON.stringify(EMPHASIS_ROOM)}))));
  `;
  const { stdout } = await execFileAsync(process.execPath, ['--import', 'tsx', '--input-type=module', '--eval', source], {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
  });
  return JSON.parse(stdout);
}

/** Sends one ROOM_STATE through a fresh in-process dev relay and reports whether the phone received it (true) or the
 * host was told it was invalid (false). The state is re-addressed to the relay's own random room. */
async function realDevRelayAcceptsRoomState(state) {
  const server = http.createServer((_request, response) => response.end('relay'));
  const relay = attachRoomRelay(server);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port: relayPort } = server.address();
  const base = `ws://127.0.0.1:${relayPort}`;
  const roomId = `Room_Emphasis_${Math.random().toString(36).slice(2)}`;
  const open = (registration) => new Promise((resolve, reject) => {
    const socket = new WebSocket(`${base}/api/rooms/${roomId}/ws`, { headers: { origin: base.replace('ws:', 'http:') } });
    const messages = [];
    socket.on('message', (raw) => { const message = JSON.parse(raw.toString()); messages.push(message); if (message.kind === 'READY') resolve({ socket, messages }); });
    socket.on('error', reject);
    socket.on('open', () => socket.send(JSON.stringify({ kind: 'CONNECT', version: 1, roomId, ...registration })));
    setTimeout(() => reject(new Error('Timed out opening relay client')), 1500).unref();
  });
  const waitFor = (client, predicate, timeout = 800) => new Promise((resolve, reject) => {
    const started = Date.now();
    const interval = setInterval(() => {
      const found = client.messages.find(predicate);
      if (found) { clearInterval(interval); resolve(found); }
      else if (Date.now() - started > timeout) { clearInterval(interval); reject(new Error('Timed out waiting for relay message')); }
    }, 10);
  });
  try {
    const host = await open({ role: 'host', credential: secret('emph_h') });
    const phone = await open({ role: 'attendee', credential: secret('emph_a'), deviceId: 'device_emphasis' });
    host.socket.send(JSON.stringify({ kind: 'ROOM_STATE', state: { ...state, roomId } }));
    const outcome = await Promise.race([
      waitFor(phone, (message) => message.kind === 'ROOM_STATE').then(() => true),
      waitFor(host, (message) => message.kind === 'ERROR').then(() => false),
    ]);
    host.socket.close();
    phone.socket.close();
    return outcome;
  } finally {
    await relay.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

async function realSqlAcceptsRoomState(state) {
  const encoded = Buffer.from(JSON.stringify(state), 'utf8').toString('base64');
  return (await psql(`select vof_relay.valid_room_state(convert_from(decode('${encoded}', 'base64'), 'utf8')::jsonb, '${EMPHASIS_ROOM}', 0);`)) === 't';
}

test('room emphasis and the reply flag: guards.ts, the dev relay and the production SQL agree at every edge', async () => {
  const states = EMPHASIS_CASES.map(([, patch]) => emphasisRoomState(patch));
  const guards = await realGuardsAcceptRoomStates(states);
  assert.equal(guards.length, EMPHASIS_CASES.length, 'the guards child judged every case');
  let judged = 0;
  for (const [index, [label, , expected]] of EMPHASIS_CASES.entries()) {
    assert.equal(guards[index], expected, `src/network/guards.ts: ${label}`);
    assert.equal(await realDevRelayAcceptsRoomState(states[index]), expected, `server/room-relay.mjs: ${label}`);
    assert.equal(await realSqlAcceptsRoomState(states[index]), expected, `vof_relay.valid_room_state: ${label}`);
    judged += 1;
  }
  console.log(`ROOM-EMPHASIS: ${judged} cases judged by all three surfaces`);
  assert.equal(judged, EMPHASIS_CASES.length);
});

/** Real room states from the real projection and real shipped questions: a spoken-reply vote, an emphasized reveal,
 * and a closing whose takeaway lines carry their own phrases. */
async function realEmphasisProjections(roomId) {
  const source = `
    import { projectGameState } from './src/network/game-projection.ts';
    import { vaxOrFictionDeck } from './src/data/decks/vax-or-fiction.ts';
    import { SOLO_DECKS } from './src/data/decks/topics/index.ts';
    import { useGameStore } from './src/store/game-store.ts';
    const offer = (await SOLO_DECKS['art-of-the-offer']()).questions.find((question) => question.id === 'q1');
    const byId = (id) => vaxOrFictionDeck.questions.find((question) => question.id === id);
    const run = [offer, byId('q24'), byId('q19')].map((question) => ({ ...question, type: 'question' }));
    const initial = useGameStore.getInitialState();
    const at = (slideIndex, phase, revision) => projectGameState({ ...initial, run, slideIndex, phase, votesLocked: phase !== 'deliberating' }, ${JSON.stringify(roomId)}, revision).roomState;
    process.stdout.write(JSON.stringify({ voting: at(0, 'deliberating', 1), revealed: at(1, 'revealed', 2), closing: at(2, 'closing', 3) }));
  `;
  const { stdout } = await execFileAsync(process.execPath, ['--import', 'tsx', '--input-type=module', '--eval', source], {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 2 * 1024 * 1024,
  });
  return JSON.parse(stdout);
}

test('real projected states carrying the reply flag, reveal phrases and closing line phrases round-trip through the production SQL relay', async () => {
  const roomId = 'Room_Emphasis_Real';
  const { voting, revealed, closing } = await realEmphasisProjections(roomId);
  assert.equal(voting.questionData.reply, true, 'fixture: the spoken-reply question reaches the wire flagged');
  assert.deepEqual(revealed.questionData.emphasis, ['preferably late'], 'fixture: the stem phrases');
  assert.deepEqual([revealed.reveal.explanationEmphasis, revealed.reveal.takeawayEmphasis], [['Every pregnancy'], ['Every pregnancy']], 'fixture: the reveal phrases');
  assert.ok(closing.reveal.takeawayLineEmphasis?.some((phrases) => phrases.length > 0), 'fixture: the closing carries line phrases');
  assert.equal(closing.reveal.takeawayLineEmphasis.length, closing.reveal.takeaway.split('\n').length, 'one list per closing line');
  await exchange(hostRequest(roomId, secret('h')));
  await exchange(attendeeRequest(roomId, 'device_A', secret('a')));
  for (const state of [voting, revealed, closing]) {
    const response = await exchange(hostRequest(roomId, secret('h'), 'send', { message: { kind: 'ROOM_STATE', state } }));
    assert.equal(findEvent(response, 'ERROR'), undefined, `${state.phase} must be accepted`);
    const replay = await exchange(attendeeRequest(roomId, 'device_A', secret('a'), 'poll', { knownRevision: 0, personalRevision: 0, ackCursor: 0 }));
    assert.deepEqual(findEvent(replay, 'ROOM_STATE')?.state, state, `${state.phase} readback preserves every field, the new keys included`);
  }
});

// ROOM-EMPHASIS migration proof, on its own cluster (the shared one already has every migration applied): RED before
// the apply and GREEN after, the ownership guard stops a role that does not own the functions with nothing changed,
// the helper stays out of reach of both client roles, and the rollback restores both exact prior bodies.
test('the emphasis and reply migration is RED before and GREEN after, its guard stops a non-owner, and its rollback restores both exact prior bodies', async () => {
  const migrationDirectory = path.join(repoRoot, 'supabase/migrations');
  const baseMigrationPaths = [
    '20260913170036_vax_or_fiction_production_relay.sql',
    '20260913175713_vax_or_fiction_production_relay_lobby_state.sql',
    '20260915005736_vax_or_fiction_production_relay_explaining.sql',
    '20260926140000_vax_or_fiction_production_relay_anonymous_room_budget.sql',
    '20260926150000_vax_or_fiction_production_relay_streak_bonus.sql',
  ].map((name) => path.join(migrationDirectory, name));
  const emphasisMigrationPath = path.join(migrationDirectory, '20260929140000_vax_or_fiction_production_relay_emphasis_reply.sql');
  const rollbackPath = path.join(repoRoot, 'supabase/migrations-rollback/20260929140000_vax_or_fiction_production_relay_emphasis_reply_rollback.sql');

  const migrationRoot = await mkdtemp(path.join(repoRoot, 'work/emphasis-migration-postgres-'));
  const migrationDataDir = path.join(migrationRoot, 'data');
  const migrationPort = await freePort();
  const run = async (sql) => (await command('psql', ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', String(migrationPort), '-d', 'postgres', '-c', sql])).stdout.trim();
  const applyFile = (filePath, user) => command('psql', ['-X', '-1', '-q', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', String(migrationPort), '-d', 'postgres', ...(user ? ['-U', user] : []), '-f', filePath]);
  const accepts = async (state) => {
    const encoded = Buffer.from(JSON.stringify(state), 'utf8').toString('base64');
    return run(`select vof_relay.valid_room_state(convert_from(decode('${encoded}', 'base64'), 'utf8')::jsonb, '${EMPHASIS_ROOM}', 0);`);
  };
  const fingerprint = () => run("select string_agg(p.proname || '=' || md5(p.prosrc) || ':' || length(p.prosrc), ',' order by p.proname) from pg_proc p where p.oid in ('vof_relay.valid_public_question(jsonb)'::regprocedure, 'vof_relay.valid_reveal(jsonb)'::regprocedure);");
  const helperExists = () => run("select to_regprocedure('vof_relay.valid_phrase_list(jsonb)') is not null;");
  const widened = emphasisRoomState({
    questionData: { emphasis: ['Only'], reply: true },
    reveal: { explanationEmphasis: ['Every time'], takeawayEmphasis: ['Always'], takeawayLineEmphasis: [['Always']] },
  });
  const plain = emphasisRoomState({});

  try {
    await command('initdb', ['-D', migrationDataDir, '--no-locale', '--encoding=UTF8', '--auth=trust']);
    await command('pg_ctl', ['-D', migrationDataDir, '-l', path.join(migrationRoot, 'postgres.log'), '-o', `-F -p ${migrationPort} -h 127.0.0.1`, 'start', '-w']);
    await run('create role anon nologin; create role authenticated nologin; create schema extensions; create extension pgcrypto with schema extensions;');
    for (const migrationPath of baseMigrationPaths) await applyFile(migrationPath);

    assert.equal(await accepts(widened), 'f', 'RED: the new keys are refused before the migration');
    assert.equal(await accepts(plain), 't', 'the old shape validates before the migration');
    const before = await fingerprint();
    assert.equal(await helperExists(), 'f');

    // A role that can see vof_relay but owns nothing in it: the guard, not a permission error later on, must stop it.
    await run('create role vof_emphasis_intruder login; grant usage, create on schema vof_relay to vof_emphasis_intruder;');
    await assert.rejects(() => applyFile(emphasisMigrationPath, 'vof_emphasis_intruder'), (error) => {
      assert.match(`${error.stderr || ''}${error.stdout || ''}`, /must be applied as the owner of vof_relay\.valid_public_question/);
      return true;
    });
    assert.equal(await fingerprint(), before, 'the guarded apply changed neither function');
    assert.equal(await helperExists(), 'f', 'the guarded apply left no helper behind');

    await applyFile(emphasisMigrationPath);
    assert.equal(await accepts(widened), 't', 'GREEN: the new keys validate after the migration');
    assert.equal(await accepts(plain), 't', 'the old shape still validates after the migration');
    const after = await fingerprint();
    assert.notEqual(after, before, 'the migration replaced the bodies, not a no-op');
    assert.equal(await helperExists(), 't');
    assert.equal(await run("select has_function_privilege('anon', 'vof_relay.valid_phrase_list(jsonb)', 'execute') or has_function_privilege('authenticated', 'vof_relay.valid_phrase_list(jsonb)', 'execute');"), 'f', 'neither client role can call the helper');

    await applyFile(rollbackPath);
    assert.equal(await fingerprint(), before, 'the rollback restores both exact prior bodies');
    assert.equal(await helperExists(), 'f', 'the rollback drops the helper');
    assert.equal(await accepts(widened), 'f', 'after the rollback the new keys are refused again');
    assert.equal(await accepts(plain), 't', 'after the rollback the old shape still validates');
    console.log(`ROOM-EMPHASIS fingerprint: before=${before} after=${after}`);
  } finally {
    await command('pg_ctl', ['-D', migrationDataDir, 'stop', '-m', 'fast', '-w']).catch(() => {});
    await rm(migrationRoot, { recursive: true, force: true });
  }
});

// ROOM-LOOK migration (20261002140000, VOF-93 and VOF-94): the host's look and its topic pattern switch cross the same three
// validators as the emphasis keys, src/network/guards.ts on the phone, server/room-relay.mjs in dev and the production SQL,
// and they must agree at every edge. These cases run on the throwaway local clusters this file starts, like the emphasis ones.
const lookRoomState = (extra = {}) => ({ ...emphasisRoomState({}), ...extra });
const LOOK_CASES = [
  ['the old shape, with neither key', {}, true],
  ['a look alone', { look: 'studio' }, true],
  ['the switch alone, off', { patterns: false }, true],
  ['the switch alone, on', { patterns: true }, true],
  ['both keys', { look: 'casefile', patterns: false }, true],
  ['each of the four looks', { look: 'seventies', patterns: true }, true],
  ['Today, which a phone also shows with no key at all', { look: 'today' }, true],
  ['a look added later, which needs no second migration', { look: 'noir-2' }, true],
  ['a 24-character look id, the bound', { look: `a${'b'.repeat(23)}` }, true],
  ['a 25-character look id', { look: `a${'b'.repeat(24)}` }, false],
  ['an empty look id', { look: '' }, false],
  ['a look id with a capital', { look: 'Studio' }, false],
  ['a look id with a space', { look: 'studio set' }, false],
  ['a look id that starts with a digit', { look: '70s' }, false],
  ['a look id with an underscore', { look: 'case_file' }, false],
  ['a look that is a number', { look: 7 }, false],
  ['a null look', { look: null }, false],
  ['a look that is a list', { look: ['studio'] }, false],
  ['the switch as a string', { patterns: 'false' }, false],
  ['the switch as a number', { patterns: 0 }, false],
  ['a null switch', { patterns: null }, false],
  ['a key the relay does not know beside the two', { look: 'studio', theme: 'dark' }, false],
  ['a stale key of the first design', { patterns: true, art: 'ai' }, false],
];

test('room look and the pattern switch: guards.ts, the dev relay and the production SQL agree at every edge', async () => {
  const states = LOOK_CASES.map(([, patch]) => lookRoomState(patch));
  const guards = await realGuardsAcceptRoomStates(states);
  assert.equal(guards.length, LOOK_CASES.length, 'the guards child judged every case');
  let judged = 0;
  for (const [index, [label, , expected]] of LOOK_CASES.entries()) {
    assert.equal(guards[index], expected, `src/network/guards.ts: ${label}`);
    assert.equal(await realDevRelayAcceptsRoomState(states[index]), expected, `server/room-relay.mjs: ${label}`);
    assert.equal(await realSqlAcceptsRoomState(states[index]), expected, `vof_relay.valid_room_state: ${label}`);
    judged += 1;
  }
  // A required key that goes missing is still refused by all three, so the widening opened exactly two keys.
  const { hostConnected: _dropped, ...withoutRequired } = lookRoomState({ look: 'studio' });
  assert.equal((await realGuardsAcceptRoomStates([withoutRequired]))[0], false, 'guards.ts: a required key is still required');
  assert.equal(await realDevRelayAcceptsRoomState(withoutRequired), false, 'server/room-relay.mjs: a required key is still required');
  assert.equal(await realSqlAcceptsRoomState(withoutRequired), false, 'vof_relay.valid_room_state: a required key is still required');
  console.log(`ROOM-LOOK: ${judged} cases judged by all three surfaces`);
  assert.equal(judged, LOOK_CASES.length);
});

test('a real projected room state carrying the look and the pattern switch round-trips through the production SQL relay, and the dev relay hands it to a phone whole', async () => {
  const roomId = 'Room_Look_Real';
  const source = `
    import { projectGameState } from './src/network/game-projection.ts';
    import { roomLookKeys } from './src/network/room-look.ts';
    import { vaxOrFictionDeck } from './src/data/decks/vax-or-fiction.ts';
    import { useGameStore } from './src/store/game-store.ts';
    const run = [vaxOrFictionDeck.questions.find((question) => question.id === 'q5')].map((question) => ({ ...question, type: 'question' }));
    const initial = useGameStore.getInitialState();
    const at = (phase, revision, look, patterns) => ({ ...projectGameState({ ...initial, run, slideIndex: 0, phase, votesLocked: phase !== 'deliberating' }, ${JSON.stringify(roomId)}, revision).roomState, ...roomLookKeys({ look, patterns }) });
    process.stdout.write(JSON.stringify({ voting: at('deliberating', 1, 'studio', false), revealed: at('revealed', 2, 'seventies', true) }));
  `;
  const { stdout } = await execFileAsync(process.execPath, ['--import', 'tsx', '--input-type=module', '--eval', source], { cwd: repoRoot, encoding: 'utf8', maxBuffer: 2 * 1024 * 1024 });
  const { voting, revealed } = JSON.parse(stdout);
  assert.deepEqual([voting.look, voting.patterns, revealed.look, revealed.patterns], ['studio', false, 'seventies', true], 'fixture: the projection carries both keys');
  await exchange(hostRequest(roomId, secret('h')));
  await exchange(attendeeRequest(roomId, 'device_A', secret('a')));
  for (const state of [voting, revealed]) {
    const response = await exchange(hostRequest(roomId, secret('h'), 'send', { message: { kind: 'ROOM_STATE', state } }));
    assert.equal(findEvent(response, 'ERROR'), undefined, `${state.phase} must be accepted`);
    const replay = await exchange(attendeeRequest(roomId, 'device_A', secret('a'), 'poll', { knownRevision: 0, personalRevision: 0, ackCursor: 0 }));
    assert.deepEqual(findEvent(replay, 'ROOM_STATE')?.state, state, `${state.phase} readback preserves every field, the look and the switch included`);
  }
  assert.equal(await realDevRelayAcceptsRoomState(voting), true, 'the dev relay accepts the same real state');
});

// ROOM-LOOK migration proof, on its own cluster (the shared one already has every migration applied): RED before the apply
// and GREEN after, the ownership guard stops a role that does not own the function with nothing changed, and the rollback
// restores the exact prior body.
test('the room look migration is RED before and GREEN after, its guard stops a non-owner, and its rollback restores the exact prior body', async () => {
  const migrationDirectory = path.join(repoRoot, 'supabase/migrations');
  const baseMigrationPaths = [
    '20260913170036_vax_or_fiction_production_relay.sql',
    '20260913175713_vax_or_fiction_production_relay_lobby_state.sql',
    '20260915005736_vax_or_fiction_production_relay_explaining.sql',
    '20260926140000_vax_or_fiction_production_relay_anonymous_room_budget.sql',
    '20260926150000_vax_or_fiction_production_relay_streak_bonus.sql',
    '20260929140000_vax_or_fiction_production_relay_emphasis_reply.sql',
  ].map((name) => path.join(migrationDirectory, name));
  const lookMigrationPath = path.join(migrationDirectory, '20261002140000_vax_or_fiction_production_relay_room_look.sql');
  const rollbackPath = path.join(repoRoot, 'supabase/migrations-rollback/20261002140000_vax_or_fiction_production_relay_room_look_rollback.sql');

  const migrationRoot = await mkdtemp(path.join(repoRoot, 'work/room-look-migration-postgres-'));
  const migrationDataDir = path.join(migrationRoot, 'data');
  const migrationPort = await freePort();
  const run = async (sql) => (await command('psql', ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', String(migrationPort), '-d', 'postgres', '-c', sql])).stdout.trim();
  const applyFile = (filePath, user) => command('psql', ['-X', '-1', '-q', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', String(migrationPort), '-d', 'postgres', ...(user ? ['-U', user] : []), '-f', filePath]);
  const accepts = async (state) => {
    const encoded = Buffer.from(JSON.stringify(state), 'utf8').toString('base64');
    return run(`select vof_relay.valid_room_state(convert_from(decode('${encoded}', 'base64'), 'utf8')::jsonb, '${EMPHASIS_ROOM}', 0);`);
  };
  const fingerprint = () => run("select p.proname || '=' || md5(p.prosrc) || ':' || length(p.prosrc) from pg_proc p where p.oid = 'vof_relay.valid_room_state(jsonb, text, bigint)'::regprocedure;");
  const widened = lookRoomState({ look: 'studio', patterns: false });
  const plain = lookRoomState({});

  try {
    await command('initdb', ['-D', migrationDataDir, '--no-locale', '--encoding=UTF8', '--auth=trust']);
    await command('pg_ctl', ['-D', migrationDataDir, '-l', path.join(migrationRoot, 'postgres.log'), '-o', `-F -p ${migrationPort} -h 127.0.0.1`, 'start', '-w']);
    await run('create role anon nologin; create role authenticated nologin; create schema extensions; create extension pgcrypto with schema extensions;');
    for (const migrationPath of baseMigrationPaths) await applyFile(migrationPath);

    assert.equal(await accepts(widened), 'f', 'RED: the new keys are refused before the migration');
    assert.equal(await accepts(plain), 't', 'the old shape validates before the migration');
    const before = await fingerprint();
    assert.equal(before.split('=')[0], 'valid_room_state');

    // A role that can see vof_relay but owns nothing in it: the guard, not a permission error later on, must stop it.
    await run('create role vof_look_intruder login; grant usage, create on schema vof_relay to vof_look_intruder;');
    await assert.rejects(() => applyFile(lookMigrationPath, 'vof_look_intruder'), (error) => {
      assert.match(`${error.stderr || ''}${error.stdout || ''}`, /must be applied as the owner of vof_relay\.valid_room_state/);
      return true;
    });
    assert.equal(await fingerprint(), before, 'the guarded apply changed nothing');

    await applyFile(lookMigrationPath);
    assert.equal(await accepts(widened), 't', 'GREEN: the new keys validate after the migration');
    assert.equal(await accepts(plain), 't', 'the old shape still validates after the migration');
    assert.equal(await accepts(lookRoomState({ look: 'Studio Set' })), 'f', 'a bad look is still refused');
    assert.equal(await accepts(lookRoomState({ patterns: 'no' })), 'f', 'a bad switch is still refused');
    const after = await fingerprint();
    assert.notEqual(after, before, 'the migration replaced the body, not a no-op');
    assert.equal(await run("select has_function_privilege('anon', 'vof_relay.valid_room_state(jsonb, text, bigint)', 'execute') or has_function_privilege('authenticated', 'vof_relay.valid_room_state(jsonb, text, bigint)', 'execute');"), 'f', 'neither client role can call the validator');

    await applyFile(rollbackPath);
    assert.equal(await fingerprint(), before, 'the rollback restores the exact prior body');
    assert.equal(await accepts(widened), 'f', 'after the rollback the new keys are refused again');
    assert.equal(await accepts(plain), 't', 'after the rollback the old shape still validates');
    // The fingerprints the migration header tells an operator to expect, so the header can never drift from the SQL.
    assert.equal(before, 'valid_room_state=e7f684a187512f57f45f66440e29cf65:3289', 'the body 20260915005736 defined');
    assert.equal(after, 'valid_room_state=1616a6bd93d0143349cfa1938789a219:3629', 'the body the migration writes');
    const header = await readFile(lookMigrationPath, 'utf8');
    assert.ok(header.includes('e7f684a187512f57f45f66440e29cf65:3289') && header.includes('1616a6bd93d0143349cfa1938789a219:3629'), 'and the header names both');
    console.log(`ROOM-LOOK fingerprint: before=${before} after=${after}`);
  } finally {
    await command('pg_ctl', ['-D', migrationDataDir, 'stop', '-m', 'fast', '-w']).catch(() => {});
    await rm(migrationRoot, { recursive: true, force: true });
  }
});
