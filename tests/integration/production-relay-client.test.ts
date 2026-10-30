import assert from 'node:assert/strict';
import http from 'node:http';
import { afterEach, test } from 'node:test';
import { connectProductionRoom } from '../../src/network/production-room';
import { createHostLookStore } from '../../src/looks/host-look';
import { startHostLiveLink } from '../../src/network/host-live-link';
import { ROOM_STATE_REFUSED, roomLookKeys } from '../../src/network/room-look';
import { useGameStore } from '../../src/store/game-store';

const originalUrl = process.env.VITE_SUPABASE_URL;
const originalKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

afterEach(() => {
  if (originalUrl === undefined) delete process.env.VITE_SUPABASE_URL;
  else process.env.VITE_SUPABASE_URL = originalUrl;
  if (originalKey === undefined) delete process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  else process.env.VITE_SUPABASE_PUBLISHABLE_KEY = originalKey;
});

function listen(server: http.Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.listen(0, '127.0.0.1', () => resolve((server.address() as { port: number }).port));
    server.once('error', reject);
  });
}

function waitFor<T>(read: () => T | undefined, timeout = 2500): Promise<T> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const check = () => {
      const value = read();
      if (value !== undefined) resolve(value);
      else if (Date.now() - started > timeout) reject(new Error('Timed out waiting for production relay event'));
      else setTimeout(check, 10);
    };
    check();
  });
}

const state = (revision: number) => ({
  version: 1 as const,
  roomId: 'Room_A',
  sessionId: 'run_1',
  revision,
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
  participants: 0,
  teamScores: null,
  leaderboard: [],
  showdown: null,
  hostConnected: true,
});

const attendeeState = (nickname: string, score = 0) => ({
  sessionId: 'run_1',
  registered: true,
  nickname,
  team: null,
  vote: null,
  result: null,
  score,
  correct: 0,
  answered: 0,
  accuracy: null,
  bestStreak: 0,
  rank: null,
  totalParticipants: 250,
  commitments: [],
});

test('production adapter uses the exact RPC, advances cursors, rejects stale state, and stops polling on close', async () => {
  const requests: Array<{ headers: http.IncomingHttpHeaders; body: any }> = [];
  let poll = 0;
  const server = http.createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    requests.push({ headers: request.headers, body });
    response.setHeader('content-type', 'application/json');
    if (body.p_request.action === 'connect') {
      response.end(JSON.stringify({ events: [{ kind: 'READY', role: 'attendee' }, { kind: 'HOST_STATUS', connected: true }], snapshotRevision: 0, personalRevision: 0, ackCursor: 0 }));
    } else if (body.p_request.action === 'send') {
      response.end(JSON.stringify({ events: [{ kind: 'ACK', messageId: 'hello_1', accepted: true }], snapshotRevision: 0, personalRevision: 0, ackCursor: 4 }));
    } else {
      poll += 1;
      response.end(JSON.stringify({
        events: poll === 1
          ? [{ kind: 'ROOM_STATE', state: state(2) }, { kind: 'ROOM_STATE', state: state(1) }]
          : [],
        snapshotRevision: 2,
        personalRevision: 0,
        ackCursor: 4,
      }));
    }
  });
  const port = await listen(server);
  process.env.VITE_SUPABASE_URL = `http://127.0.0.1:${port}`;
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test_key';
  const statuses: string[] = [];
  const messages: any[] = [];
  const errors: string[] = [];
  const connection = connectProductionRoom({
    roomId: 'Room_A',
    role: 'attendee',
    credential: 'a'.repeat(36),
    deviceId: 'device_A',
    onStatus: (status) => statuses.push(status),
    onMessage: (message) => messages.push(message),
    onError: (reason) => errors.push(reason),
  });

  await waitFor(() => statuses.includes('connected') ? true : undefined);
  assert.equal(connection.send({
    kind: 'CLIENT_MESSAGE',
    message: { version: 1, type: 'HELLO', roomId: 'Room_A', sessionId: 'run_1', deviceId: 'device_A', messageId: 'hello_1', nickname: 'Ada' },
  }), true);
  await waitFor(() => messages.find((message) => message.kind === 'ACK'));
  await waitFor(() => messages.find((message) => message.kind === 'ROOM_STATE'));

  assert.equal(requests[0].body.p_request.action, 'connect');
  assert.equal(requests[0].body.p_request.credential, 'a'.repeat(36));
  assert.equal(requests[0].headers.apikey, 'sb_publishable_test_key');
  assert.equal(requests[0].headers.authorization, 'Bearer sb_publishable_test_key');
  assert.equal(requests[0].headers['content-type'], 'application/json');
  assert.ok(requests.every(({ body }) => Object.keys(body).length === 1 && body.p_request.roomId === 'Room_A'));
  assert.equal(messages.filter((message) => message.kind === 'ROOM_STATE').length, 1, 'stale revision is not delivered');
  assert.deepEqual(errors, []);

  connection.close();
  const countAtClose = requests.length;
  await new Promise((resolve) => setTimeout(resolve, 1150));
  assert.equal(requests.length, countAtClose, 'close cancels future polling');
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

test('production adapter rejects missing public configuration before sending credentials', async () => {
  delete process.env.VITE_SUPABASE_URL;
  delete process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const statuses: string[] = [];
  const errors: string[] = [];
  const connection = connectProductionRoom({
    roomId: 'Room_A',
    role: 'host',
    credential: 'h'.repeat(36),
    onStatus: (status) => statuses.push(status),
    onMessage: () => {},
    onError: (reason) => errors.push(reason),
  });
  await waitFor(() => errors[0]);
  assert.deepEqual(statuses, ['offline']);
  assert.match(errors[0], /configuration/i);
  assert.equal(connection.send({ kind: 'ROOM_STATE', state: state(1) }), false);
  connection.close();
});

for (const reason of [
  'This network already has 20 open games, so reopen one you started on this device or try again later.',
  'The relay is creating rooms too quickly right now. Try again in a minute.',
]) {
  test(`presenter sees the relay's own reason for a rejected connect (${reason.slice(0, 24)}...), not the generic registration message`, async (context) => {
    const server = http.createServer(async (request, response) => {
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      JSON.parse(Buffer.concat(chunks).toString('utf8'));
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({ events: [{ kind: 'ERROR', reason }], snapshotRevision: 0, inboxCursor: 0 }));
    });
    const port = await listen(server);
    process.env.VITE_SUPABASE_URL = `http://127.0.0.1:${port}`;
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test_key';
    const errors: string[] = [];
    const connection = connectProductionRoom({
      roomId: 'Room_A', role: 'host', credential: 'h'.repeat(36),
      onStatus: () => {}, onError: (error) => errors.push(error), onMessage: () => {},
    });
    context.after(async () => {
      connection.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    });
    await waitFor(() => errors.length >= 2 ? true : undefined);
    assert.ok(errors.every((error) => error === reason), `every reported error must be the relay's exact reason, saw: ${errors.join(' | ')}`);
    assert.ok(!errors.includes('Relay did not complete registration'), 'the generic registration message must not replace a known budget rejection');
  });
}

test("a connect ERROR that is not a known budget rejection still falls back to the generic registration message", async (context) => {
  const server = http.createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    JSON.parse(Buffer.concat(chunks).toString('utf8'));
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({ events: [{ kind: 'ERROR', reason: 'Room is unavailable' }], snapshotRevision: 0, inboxCursor: 0 }));
  });
  const port = await listen(server);
  process.env.VITE_SUPABASE_URL = `http://127.0.0.1:${port}`;
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test_key';
  const errors: string[] = [];
  const connection = connectProductionRoom({
    roomId: 'Room_A', role: 'host', credential: 'h'.repeat(36),
    onStatus: () => {}, onError: (error) => errors.push(error), onMessage: () => {},
  });
  context.after(async () => {
    connection.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  await waitFor(() => errors.length >= 2 ? true : undefined);
  assert.equal(errors[0], 'Room is unavailable', 'the relay event itself is still reported verbatim by deliver()');
  assert.equal(errors[errors.length - 1], 'Relay did not complete registration', 'an unrecognized connect failure keeps the existing generic message');
});

test('host adapter forwards durable revision and acknowledges inbox only on its next request', async () => {
  const requests: any[] = [];
  let polls = 0;
  const clientMessage = {
    kind: 'CLIENT_MESSAGE',
    message: { version: 1, type: 'HELLO', roomId: 'Room_A', sessionId: 'run_1', deviceId: 'device_A', messageId: 'hello_1', nickname: 'Ada' },
  };
  const server = http.createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    requests.push(body.p_request);
    response.setHeader('content-type', 'application/json');
    if (body.p_request.action === 'connect') {
      response.end(JSON.stringify({ events: [{ kind: 'READY', role: 'host', snapshotRevision: 3 }], snapshotRevision: 3, inboxCursor: 0 }));
    } else {
      polls += 1;
      response.end(JSON.stringify({ events: polls === 1 ? [clientMessage] : [], snapshotRevision: 3, inboxCursor: polls === 1 ? 7 : 7 }));
    }
  });
  const port = await listen(server);
  process.env.VITE_SUPABASE_URL = `http://127.0.0.1:${port}`;
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test_key';
  const messages: any[] = [];
  const connection = connectProductionRoom({
    roomId: 'Room_A', role: 'host', credential: 'h'.repeat(36),
    onStatus: () => {}, onError: () => {}, onMessage: (message) => messages.push(message),
  });

  await waitFor(() => requests.length >= 3 ? true : undefined, 3500);
  assert.equal(messages.find((message) => message.kind === 'READY')?.snapshotRevision, 3);
  assert.equal(messages.filter((message) => message.kind === 'CLIENT_MESSAGE').length, 1);
  assert.equal(requests[1].consumeCursor, 0, 'delivery is not pre-acknowledged');
  assert.equal(requests[2].consumeCursor, 7, 'validated delivery is acknowledged on the next exchange');
  connection.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

test('host adapter accepts and batches 250 ACKs within eight seconds at bounded network latency', async (context) => {
  const sentIds: string[] = [];
  const batchSizes: number[] = [];
  const requestSizes: number[] = [];
  const server = http.createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const bodyBuffer = Buffer.concat(chunks);
    const body = JSON.parse(bodyBuffer.toString('utf8'));
    response.setHeader('content-type', 'application/json');
    if (body.p_request.action === 'connect') {
      response.end(JSON.stringify({ events: [{ kind: 'READY', role: 'host', snapshotRevision: 0 }], snapshotRevision: 0, inboxCursor: 0 }));
      return;
    }
    if (body.p_request.action === 'poll') {
      response.end(JSON.stringify({ events: [], snapshotRevision: 0, inboxCursor: 0 }));
      return;
    }
    const messages = body.p_request.messages ?? [body.p_request.message];
    batchSizes.push(messages.length);
    requestSizes.push(bodyBuffer.byteLength);
    for (const message of messages) {
      if (message?.message?.kind === 'ACK') sentIds.push(message.message.messageId);
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
    response.end(JSON.stringify({ events: [], snapshotRevision: 0, inboxCursor: 0 }));
  });
  const port = await listen(server);
  process.env.VITE_SUPABASE_URL = `http://127.0.0.1:${port}`;
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test_key';
  const statuses: string[] = [];
  const errors: string[] = [];
  const connection = connectProductionRoom({
    roomId: 'Room_A', role: 'host', credential: 'h'.repeat(36),
    onStatus: (status) => statuses.push(status), onError: (reason) => errors.push(reason), onMessage: () => {},
  });
  context.after(async () => {
    connection.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  await waitFor(() => statuses.includes('connected') ? true : undefined);

  const started = Date.now();
  const accepted = Array.from({ length: 250 }, (_, index) => connection.send({
    kind: 'DIRECT', deviceId: `device_${index}`, message: { kind: 'ACK', messageId: `message_${index}`, accepted: true },
  }));
  assert.equal(accepted.filter(Boolean).length, 250, 'normal 250-device ACK fanout must not hit local backpressure');
  await waitFor(() => sentIds.length === 250 ? true : undefined, 8_000);
  assert.ok(Date.now() - started < 8_000, 'the final ACK must leave the adapter before the phone timeout');
  assert.ok(batchSizes.some((size) => size > 1), 'host DIRECT messages use bounded batch RPC requests');
  assert.ok(batchSizes.every((size) => size <= 32), `observed batch sizes: ${batchSizes.join(',')}`);
  assert.ok(requestSizes.every((size) => size <= 128 * 1024));
  assert.equal(new Set(sentIds).size, 250);
  assert.deepEqual(errors, []);

});

test('host adapter coalesces replaceable state and applies finite explicit ACK backpressure', async (context) => {
  let releaseFirstSend!: () => void;
  const firstSendGate = new Promise<void>((resolve) => { releaseFirstSend = resolve; });
  let sendRequests = 0;
  const delivered: any[] = [];
  const server = http.createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    response.setHeader('content-type', 'application/json');
    if (body.p_request.action === 'connect') {
      response.end(JSON.stringify({ events: [{ kind: 'READY', role: 'host', snapshotRevision: 0 }], snapshotRevision: 0, inboxCursor: 0 }));
      return;
    }
    if (body.p_request.action === 'send') {
      sendRequests += 1;
      if (sendRequests === 1) await firstSendGate;
      delivered.push(...(body.p_request.messages ?? [body.p_request.message]));
    }
    response.end(JSON.stringify({ events: [], snapshotRevision: 0, inboxCursor: 0 }));
  });
  const port = await listen(server);
  process.env.VITE_SUPABASE_URL = `http://127.0.0.1:${port}`;
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test_key';
  const statuses: string[] = [];
  const connection = connectProductionRoom({
    roomId: 'Room_A', role: 'host', credential: 'h'.repeat(36),
    onStatus: (status) => statuses.push(status), onError: () => {}, onMessage: () => {},
  });
  context.after(async () => {
    releaseFirstSend();
    connection.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  await waitFor(() => statuses.includes('connected') ? true : undefined);

  assert.equal(connection.send({ kind: 'DIRECT', deviceId: 'device_0', message: { kind: 'ACK', messageId: 'message_0', accepted: true } }), true);
  const remainingCapacity = Array.from({ length: 511 }, (_, index) => connection.send({
    kind: 'DIRECT', deviceId: `device_${(index + 1) % 250}`, message: { kind: 'ACK', messageId: `message_${index + 1}`, accepted: true },
  }));
  assert.ok(remainingCapacity.every(Boolean));
  assert.equal(connection.send({ kind: 'DIRECT', deviceId: 'device_0', message: { kind: 'ACK', messageId: 'message_overflow', accepted: true } }), false);

  for (let index = 0; index < 250; index += 1) {
    assert.equal(connection.send({ kind: 'DIRECT', deviceId: `device_${index}`, message: { kind: 'ATTENDEE_STATE', state: attendeeState(`Old ${index}`) } }), true);
    assert.equal(connection.send({ kind: 'DIRECT', deviceId: `device_${index}`, message: { kind: 'ATTENDEE_STATE', state: attendeeState(`Latest ${index}`, index) } }), true);
  }
  assert.equal(connection.send({ kind: 'ROOM_STATE', state: state(1) }), true);
  assert.equal(connection.send({ kind: 'ROOM_STATE', state: state(2) }), true);
  releaseFirstSend();

  await waitFor(() => delivered.filter((message) => message?.message?.kind === 'ACK').length === 512
    && delivered.filter((message) => message?.message?.kind === 'ATTENDEE_STATE').length === 250
    && delivered.filter((message) => message?.kind === 'ROOM_STATE').length === 1 ? true : undefined, 8_000);
  assert.ok(delivered.slice(1, 33).every((message) => message?.message?.kind === 'ACK'), 'ACKs drain ahead of replaceable state');
  assert.equal(delivered.find((message) => message?.message?.kind === 'ATTENDEE_STATE' && message.deviceId === 'device_249')?.message.state.nickname, 'Latest 249');
  assert.equal(delivered.find((message) => message?.kind === 'ROOM_STATE')?.state.revision, 2);

});

test('host adapter retains a rate-rejected ACK batch and isolates one permanently rejected member', async (context) => {
  let rateRejected = false;
  const acceptedIds: string[] = [];
  const errors: string[] = [];
  const server = http.createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    response.setHeader('content-type', 'application/json');
    if (body.p_request.action === 'connect') {
      response.end(JSON.stringify({ events: [{ kind: 'READY', role: 'host', snapshotRevision: 0 }], snapshotRevision: 0, inboxCursor: 0 }));
      return;
    }
    if (body.p_request.action === 'poll') {
      response.end(JSON.stringify({ events: [], snapshotRevision: 0, inboxCursor: 0 }));
      return;
    }
    const messages = body.p_request.messages ?? [body.p_request.message];
    if (!rateRejected) {
      rateRejected = true;
      response.end(JSON.stringify({ events: [{ kind: 'ERROR', reason: 'Host message rate exceeded' }], snapshotRevision: 0, inboxCursor: 0 }));
      return;
    }
    if (messages.some((message: any) => message?.message?.messageId === 'message_bad')) {
      response.end(JSON.stringify({ events: [{ kind: 'ERROR', reason: 'ACK does not match a pending message' }], snapshotRevision: 0, inboxCursor: 0 }));
      return;
    }
    acceptedIds.push(...messages.map((message: any) => message.message.messageId));
    response.end(JSON.stringify({ events: [], snapshotRevision: 0, inboxCursor: 0 }));
  });
  const port = await listen(server);
  process.env.VITE_SUPABASE_URL = `http://127.0.0.1:${port}`;
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test_key';
  const statuses: string[] = [];
  const connection = connectProductionRoom({
    roomId: 'Room_A', role: 'host', credential: 'h'.repeat(36),
    onStatus: (status) => statuses.push(status), onError: (reason) => errors.push(reason), onMessage: () => {},
  });
  context.after(async () => {
    connection.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  await waitFor(() => statuses.includes('connected') ? true : undefined);

  for (let index = 0; index < 70; index += 1) {
    assert.equal(connection.send({
      kind: 'DIRECT', deviceId: `device_${index}`, message: { kind: 'ACK', messageId: index === 17 ? 'message_bad' : `message_${index}`, accepted: true },
    }), true);
  }
  await waitFor(() => acceptedIds.length === 69 ? true : undefined, 5_000);
  assert.equal(new Set(acceptedIds).size, 69);
  assert.ok(acceptedIds.includes('message_0'), 'the rate-rejected leading ACK must be retried');
  assert.ok(!acceptedIds.includes('message_bad'));
  assert.ok(errors.some((reason) => /rate/i.test(reason)));
  assert.ok(errors.some((reason) => /pending/i.test(reason)));
});

test('attendee adapter does not replay an interaction after its send request fails', async (context) => {
  const actions: string[] = [];
  let failed = false;
  const server = http.createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    actions.push(body.p_request.action);
    response.setHeader('content-type', 'application/json');
    if (body.p_request.action === 'connect') {
      response.end(JSON.stringify({ events: [{ kind: 'READY', role: 'attendee' }, { kind: 'ROOM_STATE', state: state(1) }], snapshotRevision: 1, personalRevision: 0, ackCursor: 0 }));
    } else if (body.p_request.action === 'send' && !failed) {
      failed = true;
      response.statusCode = 503;
      response.end(JSON.stringify({ error: 'response lost' }));
    } else {
      response.end(JSON.stringify({ events: [], snapshotRevision: 2, personalRevision: 0, ackCursor: 0 }));
    }
  });
  const port = await listen(server);
  process.env.VITE_SUPABASE_URL = `http://127.0.0.1:${port}`;
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test_key';
  const statuses: string[] = [];
  const connection = connectProductionRoom({
    roomId: 'Room_A', role: 'attendee', credential: 'a'.repeat(36), deviceId: 'device_A',
    onStatus: (status) => statuses.push(status), onError: () => {}, onMessage: () => {},
  });
  context.after(async () => {
    connection.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  await waitFor(() => statuses.includes('connected') ? true : undefined);
  assert.equal(connection.send({
    kind: 'CLIENT_MESSAGE',
    message: { version: 1, type: 'VOTE', roomId: 'Room_A', sessionId: 'run_1', deviceId: 'device_A', messageId: 'vote_1', questionInstanceId: 'run_1:q1', choice: 'choice_A' },
  }), true);
  await waitFor(() => actions.filter((action) => action === 'send').length >= 1 ? true : undefined);
  // A failed request drops readiness (VOF-T01), so the adapter re-registers and then resumes polling.
  await waitFor(() => actions.lastIndexOf('poll') > actions.lastIndexOf('connect') && actions.lastIndexOf('connect') > actions.indexOf('send') ? true : undefined, 4_000);
  assert.equal(actions.filter((action) => action === 'send').length, 1, `actions: ${actions.join(',')}`);
  assert.ok(actions.includes('poll'), `adapter should resume polling after dropping the failed interaction: ${actions.join(',')}`);

});

interface FakeDocument {
  visibilityState: 'visible' | 'hidden';
  listeners: Array<() => void>;
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
}

function installFakeDocument(): FakeDocument {
  const fake: FakeDocument = {
    visibilityState: 'visible',
    listeners: [],
    addEventListener(type, listener) { if (type === 'visibilitychange') fake.listeners.push(listener); },
    removeEventListener(type, listener) { if (type === 'visibilitychange') fake.listeners = fake.listeners.filter((entry) => entry !== listener); },
  };
  (globalThis as { document?: unknown }).document = fake;
  return fake;
}

function relayServer(onRequest: (action: string, role: string) => { status?: number; body: unknown }) {
  const requests: Array<{ action: string; role: string }> = [];
  const server = http.createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    const entry = { action: body.p_request.action as string, role: body.p_request.role as string };
    requests.push(entry);
    const reply = onRequest(entry.action, entry.role);
    response.statusCode = reply.status ?? 200;
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify(reply.body));
  });
  return { server, requests };
}

const ready = (role: 'host' | 'attendee') => role === 'host'
  ? { events: [{ kind: 'READY', role, snapshotRevision: 0 }], snapshotRevision: 0, inboxCursor: 0 }
  : { events: [{ kind: 'READY', role }], snapshotRevision: 0, personalRevision: 0, ackCursor: 0 };
const idle = (role: 'host' | 'attendee') => role === 'host'
  ? { events: [], snapshotRevision: 0, inboxCursor: 0 }
  : { events: [], snapshotRevision: 0, personalRevision: 0, ackCursor: 0 };

for (const role of ['host', 'attendee'] as const) {
  test(`VOF-T01 ${role}: one transient relay failure returns the status to connected on the next success`, async (context) => {
    let failed = false;
    const { server, requests } = relayServer((action) => {
      if (action === 'connect') return { body: ready(role) };
      if (!failed) { failed = true; return { status: 503, body: { error: 'transient' } }; }
      return { body: idle(role) };
    });
    const port = await listen(server);
    process.env.VITE_SUPABASE_URL = `http://127.0.0.1:${port}`;
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test_key';
    const statuses: string[] = [];
    const connection = connectProductionRoom({
      roomId: 'Room_A', role, credential: 'k'.repeat(36), ...(role === 'attendee' ? { deviceId: 'device_A' } : {}),
      onStatus: (status) => statuses.push(status), onError: () => {}, onMessage: () => {},
    });
    context.after(async () => {
      connection.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    });
    await waitFor(() => statuses.includes('reconnecting') ? true : undefined, 4_000);
    const degradedAt = statuses.lastIndexOf('reconnecting');
    await waitFor(() => statuses.slice(degradedAt).includes('connected') ? true : undefined, 4_000);
    assert.equal(statuses[statuses.length - 1], 'connected', `status must recover, saw ${statuses.join(' > ')}`);
    assert.equal(requests.filter((entry) => entry.action === 'connect').length, 2, 'recovery re-registers so the relay re-issues READY');
    assert.ok(!statuses.includes('offline'));
  });
}

for (const role of ['host', 'attendee'] as const) {
  test(`VOF-TEAMS-04 ${role}: polling ${role === 'host' ? 'continues' : 'pauses'} while the document is hidden`, async (context) => {
    const fake = installFakeDocument();
    const { server, requests } = relayServer((action) => ({ body: action === 'connect' ? ready(role) : idle(role) }));
    const port = await listen(server);
    process.env.VITE_SUPABASE_URL = `http://127.0.0.1:${port}`;
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test_key';
    const statuses: string[] = [];
    const connection = connectProductionRoom({
      roomId: 'Room_A', role, credential: 'k'.repeat(36), ...(role === 'attendee' ? { deviceId: 'device_A' } : {}),
      onStatus: (status) => statuses.push(status), onError: () => {}, onMessage: () => {},
    });
    context.after(async () => {
      connection.close();
      delete (globalThis as { document?: unknown }).document;
      await new Promise<void>((resolve) => server.close(() => resolve()));
    });
    await waitFor(() => statuses.includes('connected') ? true : undefined);
    fake.visibilityState = 'hidden';
    for (const listener of fake.listeners) listener();
    await new Promise((resolve) => setTimeout(resolve, 150));
    const hiddenAt = requests.length;
    await new Promise((resolve) => setTimeout(resolve, 2_300));
    const during = requests.length - hiddenAt;
    if (role === 'host') assert.ok(during >= 2, `host must keep polling while hidden (saw ${during} requests in 2.3 s)`);
    else assert.equal(during, 0, `attendee control must stop polling while hidden (saw ${during})`);
    assert.equal(statuses[statuses.length - 1], 'connected');
  });
}

// VOF build-skew guard: a phone on an older bundle validates relay responses strictly and must
// stay strict, so a release that adds an optional field makes the old bundle's validResponse
// reject the whole batch. Without this guard the phone reconnects into the same stored state and
// goes offline after maxAttempts, even though a reload is all it needs. These stub fetchRoot, now
// and reload so nothing here touches a real network or navigates a real page.
const OLD_SHA = 'a'.repeat(40);
const NEW_SHA = 'b'.repeat(40);
const rootHtml = (sha: string) => `<html data-build-sha="${sha}"><body></body></html>`;

function malformedRelayServer() {
  // A release adding an optional field to the wire shape looks exactly like this to an old
  // bundle: an extra top-level key validResponse's hasOnlyKeys does not recognize. Every action
  // fails the same way, so ready never becomes true and attempts accumulates across retries
  // instead of resetting on an intervening successful connect.
  return relayServer(() => ({ body: { ...idle('attendee'), newOptionalField: true } }));
}

function memoryStorage(): { getItem(key: string): string | null; setItem(key: string, value: string): void } {
  const data = new Map<string, string>();
  return {
    getItem: (key) => (data.has(key) ? (data.get(key) as string) : null),
    setItem: (key, value) => { data.set(key, value); },
  };
}

test('build skew: a newer-shape response plus a root serving a different sha reloads once, and a repeat failure for the same sha does not reload again', async (context) => {
  const { server } = malformedRelayServer();
  const port = await listen(server);
  process.env.VITE_SUPABASE_URL = `http://127.0.0.1:${port}`;
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test_key';
  const reloads: number[] = [];
  const fetchRootCalls: number[] = [];
  let nowValue = 0;
  const connection = connectProductionRoom({
    roomId: 'Room_A', role: 'attendee', credential: 'k'.repeat(36), deviceId: 'device_A',
    onStatus: () => {}, onError: () => {}, onMessage: () => {},
    buildSha: OLD_SHA,
    fetchRoot: async () => { fetchRootCalls.push(fetchRootCalls.length); return rootHtml(NEW_SHA); },
    reload: () => reloads.push(reloads.length),
    reloadStorage: memoryStorage(),
    // Advances well past SKEW_CHECK_MIN_INTERVAL_MS every call, so each failure below runs a real
    // skew check instead of being absorbed by the rate limit: what stops the second reload is
    // purely the once-per-target-sha memory this test means to prove.
    now: () => { nowValue += 60_000; return nowValue; },
  });
  context.after(async () => {
    connection.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  await waitFor(() => reloads.length > 0 ? true : undefined);
  assert.equal(reloads.length, 1, 'the first validation failure with a differing root sha reloads exactly once');
  assert.equal(fetchRootCalls.length, 1);

  // The stubbed reload does not really navigate away, so the same connection can still poll: a
  // real reload would tear this whole object down, but nothing here needs the page to actually
  // reload to prove the guard holds for a repeat failure against the same target sha.
  connection.retry();
  await waitFor(() => fetchRootCalls.length > 1 ? true : undefined);
  assert.equal(reloads.length, 1, 'a second failure for the same target sha must not reload again');
});

test('build skew: a matching root sha keeps today\'s failure path unchanged', async (context) => {
  const { server } = malformedRelayServer();
  const port = await listen(server);
  process.env.VITE_SUPABASE_URL = `http://127.0.0.1:${port}`;
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test_key';
  const reloads: number[] = [];
  const fetchRootCalls: number[] = [];
  const errors: string[] = [];
  const statuses: string[] = [];
  const connection = connectProductionRoom({
    roomId: 'Room_A', role: 'attendee', credential: 'k'.repeat(36), deviceId: 'device_A',
    maxReconnectAttempts: 1,
    onStatus: (status) => statuses.push(status), onError: (reason) => errors.push(reason), onMessage: () => {},
    buildSha: OLD_SHA,
    fetchRoot: async () => { fetchRootCalls.push(fetchRootCalls.length); return rootHtml(OLD_SHA); },
    reload: () => reloads.push(reloads.length),
    reloadStorage: memoryStorage(),
  });
  context.after(async () => {
    connection.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  await waitFor(() => statuses.includes('offline') ? true : undefined, 4_000);
  assert.ok(fetchRootCalls.length > 0, 'the skew check must actually run, not be skipped, for this to prove anything about a matching sha');
  assert.equal(reloads.length, 0, 'a matching build sha must never reload');
  assert.ok(errors.includes('Relay returned an invalid response'), `expected the ordinary validation error, saw: ${errors.join(' | ')}`);
});

test('build skew: no build sha on the page skips the check entirely', async (context) => {
  const { server } = malformedRelayServer();
  const port = await listen(server);
  process.env.VITE_SUPABASE_URL = `http://127.0.0.1:${port}`;
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test_key';
  const reloads: number[] = [];
  const fetchRootCalls: number[] = [];
  const errors: string[] = [];
  const statuses: string[] = [];
  const connection = connectProductionRoom({
    roomId: 'Room_A', role: 'attendee', credential: 'k'.repeat(36), deviceId: 'device_A',
    maxReconnectAttempts: 1,
    onStatus: (status) => statuses.push(status), onError: (reason) => errors.push(reason), onMessage: () => {},
    buildSha: null,
    fetchRoot: async () => { fetchRootCalls.push(fetchRootCalls.length); return rootHtml(NEW_SHA); },
    reload: () => reloads.push(reloads.length),
  });
  context.after(async () => {
    connection.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  await waitFor(() => statuses.includes('offline') ? true : undefined, 4_000);
  assert.equal(fetchRootCalls.length, 0, 'a missing build sha must skip the root fetch entirely');
  assert.equal(reloads.length, 0);
  assert.ok(errors.includes('Relay returned an invalid response'));
});

// HOST-SIDE CHECK: a host on an older bundle hits this exact same validation
// failure when a newer phone writes a state field the host's bundle does not recognize. Reproduced
// here as the real case, not a stand-in: the relay forwards a CLIENT_MESSAGE event carrying the
// phone's own envelope, and validClientEnvelope's hasOnlyKeys rejects the one extra field the same
// way validResponse does for the phone case above. Confirmed here: the failure is real, and the
// guard never reloads a host even under the same build-skew conditions that reload a phone. A host
// auto-reload is out of scope pending an operator decision, so a host never auto-reloads here.
function malformedClientMessageEvent() {
  return {
    kind: 'CLIENT_MESSAGE',
    message: {
      version: 1, type: 'VOTE', roomId: 'Room_A', sessionId: 'run_1', deviceId: 'device_A',
      messageId: 'msg_1', questionInstanceId: 'q1', choice: 'true',
      // The one field a newer phone bundle writes that this host bundle does not recognize.
      extraNewField: true,
    },
  };
}

test('build skew: a host hits the same validation failure a newer phone can cause, but never auto-reloads', async (context) => {
  const { server } = relayServer(() => ({ body: { events: [malformedClientMessageEvent()], snapshotRevision: 0, inboxCursor: 0 } }));
  const port = await listen(server);
  process.env.VITE_SUPABASE_URL = `http://127.0.0.1:${port}`;
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test_key';
  const reloads: number[] = [];
  const errors: string[] = [];
  const statuses: string[] = [];
  const connection = connectProductionRoom({
    roomId: 'Room_A', role: 'host', credential: 'k'.repeat(36),
    maxReconnectAttempts: 1,
    onStatus: (status) => statuses.push(status), onError: (reason) => errors.push(reason), onMessage: () => {},
    buildSha: OLD_SHA,
    fetchRoot: async () => rootHtml(NEW_SHA),
    reload: () => reloads.push(reloads.length),
    reloadStorage: memoryStorage(),
  });
  context.after(async () => {
    connection.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  await waitFor(() => statuses.includes('offline') ? true : undefined, 4_000);
  assert.ok(errors.includes('Relay returned an invalid response'), `the host must hit the same validation failure, saw: ${errors.join(' | ')}`);
  assert.equal(reloads.length, 0, 'a host must never auto-reload, even with a differing root sha');
});

function throwingStorage(): { getItem(key: string): string | null; setItem(key: string, value: string): void } {
  return {
    getItem: () => { throw new Error('storage blocked'); },
    setItem: () => { throw new Error('storage blocked'); },
  };
}

// Safari with all cookies blocked throws on sessionStorage access.
// Before the fix, alreadyReloadedFor swallowed that and returned false, markReloadedFor swallowed
// it too and returned nothing, and reload() ran anyway: a persistent skew would reload forever, and
// each reload would also mint a fresh credential (storedIdentity, src/network/room.ts, also throws
// on that storage), so the phone would rejoin as a stranger every time. markReloadedFor now returns
// true only once the write is confirmed by reading the key back, and the caller only reloads then.
test('build skew: a storage that throws on every call (Safari, cookies blocked) never reloads', async (context) => {
  const { server } = malformedRelayServer();
  const port = await listen(server);
  process.env.VITE_SUPABASE_URL = `http://127.0.0.1:${port}`;
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test_key';
  const reloads: number[] = [];
  const fetchRootCalls: number[] = [];
  const statuses: string[] = [];
  const connection = connectProductionRoom({
    roomId: 'Room_A', role: 'attendee', credential: 'k'.repeat(36), deviceId: 'device_A',
    maxReconnectAttempts: 1,
    onStatus: (status) => statuses.push(status), onError: () => {}, onMessage: () => {},
    buildSha: OLD_SHA,
    fetchRoot: async () => { fetchRootCalls.push(fetchRootCalls.length); return rootHtml(NEW_SHA); },
    reload: () => reloads.push(reloads.length),
    reloadStorage: throwingStorage(),
  });
  context.after(async () => {
    connection.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  await waitFor(() => statuses.includes('offline') ? true : undefined, 4_000);
  assert.ok(fetchRootCalls.length > 0, 'the skew check still runs and still finds a real skew');
  assert.equal(reloads.length, 0, 'an unconfirmed write to a throwing storage must never trigger a reload');
});

function silentlyNoopStorage(): { getItem(key: string): string | null; setItem(key: string, value: string): void } {
  // Unlike throwingStorage above, setItem here neither throws nor rejects: it simply does not
  // store the value (Safari can also do this under some cookie-blocking configurations, not only
  // throw). The read-back in markReloadedFor is what catches this case: getItem after the write
  // still returns null, so the write is never treated as confirmed.
  const data = new Map<string, string>();
  return {
    getItem: (key) => (data.has(key) ? (data.get(key) as string) : null),
    setItem: () => { /* silently does nothing */ },
  };
}

test('build skew: a storage whose setItem silently does nothing never reloads', async (context) => {
  const { server } = malformedRelayServer();
  const port = await listen(server);
  process.env.VITE_SUPABASE_URL = `http://127.0.0.1:${port}`;
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test_key';
  const reloads: number[] = [];
  const fetchRootCalls: number[] = [];
  const statuses: string[] = [];
  const connection = connectProductionRoom({
    roomId: 'Room_A', role: 'attendee', credential: 'k'.repeat(36), deviceId: 'device_A',
    maxReconnectAttempts: 1,
    onStatus: (status) => statuses.push(status), onError: () => {}, onMessage: () => {},
    buildSha: OLD_SHA,
    fetchRoot: async () => { fetchRootCalls.push(fetchRootCalls.length); return rootHtml(NEW_SHA); },
    reload: () => reloads.push(reloads.length),
    reloadStorage: silentlyNoopStorage(),
  });
  context.after(async () => {
    connection.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  await waitFor(() => statuses.includes('offline') ? true : undefined, 4_000);
  assert.ok(fetchRootCalls.length > 0, 'the skew check still runs and still finds a real skew');
  assert.equal(reloads.length, 0, 'a write that silently does nothing, so the read-back returns null, must never trigger a reload');
});

test('build skew: a second invalid response inside the 15 s throttle window does not fetch the root again', async (context) => {
  const { server } = malformedRelayServer();
  const port = await listen(server);
  process.env.VITE_SUPABASE_URL = `http://127.0.0.1:${port}`;
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test_key';
  const fetchRootCalls: number[] = [];
  // Starts past SKEW_CHECK_MIN_INTERVAL_MS (15 s) so the very first check still runs against the
  // initial lastSkewCheckAt of 0, then advances only 10ms per call after that: every later failure
  // in this test stays well inside the 15 s window measured from the first check, so what stops
  // the second (and later) root fetch is purely the time-window throttle this test means to prove,
  // not the once-per-target-sha memory the earlier "reloads once" test already covers with a
  // deliberately fast-forwarding clock.
  let nowValue = 20_000;
  const connection = connectProductionRoom({
    roomId: 'Room_A', role: 'attendee', credential: 'k'.repeat(36), deviceId: 'device_A',
    maxReconnectAttempts: 5,
    onStatus: () => {}, onError: () => {}, onMessage: () => {},
    buildSha: OLD_SHA,
    // A matching root sha keeps every failure on the ordinary reconnect path (never reloads),
    // so the connection keeps retrying on its own backoff schedule with no manual retry() needed.
    fetchRoot: async () => { fetchRootCalls.push(fetchRootCalls.length); return rootHtml(OLD_SHA); },
    reload: () => {},
    reloadStorage: memoryStorage(),
    now: () => { nowValue += 10; return nowValue; },
  });
  context.after(async () => {
    connection.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  await waitFor(() => fetchRootCalls.length > 0 ? true : undefined);
  assert.equal(fetchRootCalls.length, 1, 'the first invalid response runs the skew check once');
  // Real backoff retries (500 ms, 1 s, 2 s...) keep failing validation the same way. Give several
  // of them time to run against the fake clock above, which never advances anywhere near 15 s.
  await new Promise((resolve) => setTimeout(resolve, 3_000));
  assert.equal(fetchRootCalls.length, 1, 'a second invalid response inside the throttle window must not fetch the root again');
});

// The root fetch used to have no timeout and was raced by nothing: a
// stalled network froze the skew check with no bound, and a concurrent send()/retry()/visibility
// change could start a second pump while activeRequest looked idle. fetchRootBuildSha now really
// aborts (an AbortController, aborted by a real timer, cleared in finally) and the connection holds
// that same controller in activeRequest for the duration, so pump()'s own `if (... activeRequest
// ...) return` guard blocks a second pump, and close()/backgrounding's existing
// `activeRequest?.abort()` aborts this fetch exactly as they already abort a real relay request.
// rootFetchTimeoutMs is a test-only override so this proves the real bound without a real 4s wait.
test('build skew: a root fetch that never settles is really aborted, and the pump recovers within the bound', async (context) => {
  const { server } = malformedRelayServer();
  const port = await listen(server);
  process.env.VITE_SUPABASE_URL = `http://127.0.0.1:${port}`;
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test_key';
  const reloads: number[] = [];
  const statuses: string[] = [];
  let aborted = false;
  const connection = connectProductionRoom({
    roomId: 'Room_A', role: 'attendee', credential: 'k'.repeat(36), deviceId: 'device_A',
    maxReconnectAttempts: 1,
    onStatus: (status) => statuses.push(status), onError: () => {}, onMessage: () => {},
    buildSha: OLD_SHA,
    rootFetchTimeoutMs: 50,
    fetchRoot: (signal) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => { aborted = true; reject(new Error('aborted')); });
    }),
    reload: () => reloads.push(reloads.length),
    reloadStorage: memoryStorage(),
  });
  context.after(async () => {
    connection.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  await waitFor(() => statuses.includes('offline') ? true : undefined, 4_000);
  assert.equal(aborted, true, 'the stalled fetch must actually be aborted, not just abandoned to hang');
  assert.equal(reloads.length, 0, 'an aborted (failed) skew check must never reload');
});

// Nothing tests activeRequest = controller (production-room.ts:312) on its own: deleting that one
// line keeps every other test in this file green, because none of them observe the relay while a
// root fetch is still pending. This holds the root fetch open (it only settles once its signal
// aborts) and pokes the connection with send() while it is pending, proving pump()'s own
// `if (... activeRequest ...) return` guard blocks a second request even mid-skew-check, not only
// mid-poll. It then proves retry() and close() reach into that same pending fetch through the
// same activeRequest reference and really abort it.
test('build skew: send() while the root fetch is pending never starts a second relay request, and retry()/close() abort that same pending fetch', async (context) => {
  let requestCount = 0;
  const { server, requests } = relayServer((action) => {
    requestCount += 1;
    if (action === 'connect') return { body: ready('attendee') };
    // Every action after the first connect fails validation (an extra field), which is what
    // drives this connection into maybeReloadForBuildSkew below, with `ready` still true from the
    // earlier successful connect.
    return { body: { ...idle('attendee'), newOptionalField: true } };
  });
  const port = await listen(server);
  process.env.VITE_SUPABASE_URL = `http://127.0.0.1:${port}`;
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test_key';
  const fetchRootCalls: AbortSignal[] = [];
  const connection = connectProductionRoom({
    roomId: 'Room_A', role: 'attendee', credential: 'k'.repeat(36), deviceId: 'device_A',
    onStatus: () => {}, onError: () => {}, onMessage: () => {},
    buildSha: OLD_SHA,
    // Only settles once its signal aborts, matching this file's other never-settling-fetch test:
    // this stub's promise stays open for as long as the guard this test proves is expected to
    // hold it open, and resolves cleanly once retry()/close() abort it rather than leaking a
    // timer.
    fetchRoot: (signal) => new Promise((_resolve, reject) => {
      fetchRootCalls.push(signal);
      signal.addEventListener('abort', () => reject(new Error('aborted')));
    }),
    reload: () => {},
    reloadStorage: memoryStorage(),
  });
  context.after(async () => {
    connection.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  await waitFor(() => fetchRootCalls.length > 0 ? true : undefined);
  assert.equal(fetchRootCalls.length, 1, 'the skew check must have actually started the root fetch');
  assert.equal(fetchRootCalls[0].aborted, false, 'the root fetch must still be pending, not already aborted, before this test pokes the connection');
  const baseline = requestCount;

  // send() alone, with no retry() involved yet: a clean read of whether the guard blocks a second
  // request, with nothing here that could abort the pending fetch itself and confound the count.
  const sent = connection.send({
    kind: 'CLIENT_MESSAGE',
    message: { version: 1, type: 'HELLO', roomId: 'Room_A', sessionId: 'run_1', deviceId: 'device_A', messageId: 'hello_1', nickname: 'Ada' },
  });
  assert.equal(sent, true, 'send() must accept the message: ready is still true from the earlier connect');
  // Give any wrongly-triggered pump() enough real time to reach the relay server before checking.
  await new Promise((resolve) => setTimeout(resolve, 150));
  assert.equal(requestCount, baseline, 'send() while the root fetch is pending must not issue a second relay request');
  assert.equal(requests.length, requestCount);
  assert.equal(fetchRootCalls.length, 1, 'send() must not have started a second root fetch either');
  assert.equal(fetchRootCalls[0].aborted, false, 'send() must not have aborted the pending root fetch');

  // retry() reaches into the same pending fetch through the shared activeRequest reference.
  connection.retry();
  assert.equal(fetchRootCalls[0].aborted, true, 'retry() must abort the pending root fetch through the same activeRequest it also uses to guard against a second poll');

  connection.close();
  assert.equal(fetchRootCalls[0].aborted, true, 'the pending root fetch is (still) aborted once close() runs');
});

// Client half of the rejoin proof. The stub server below returns the same registered
// ATTENDEE_STATE on every request, not only on connect, so it cannot by itself prove the real
// relay's connect-only redelivery. production-relay-db.test.mjs is the real proof of that server
// half, run against the actual production SQL RPC. This test proves the client half:
// connectProductionRoom recreated with exactly the identity a reload reconstructs from storage
// (the same roomId, deviceId and credential, no HELLO sent) receives that same ATTENDEE_STATE
// without asking to join again.
test('a connection recreated from the stored identity (what a reload does) receives ATTENDEE_STATE with no HELLO sent', async (context) => {
  const roomId = 'Room_A';
  const deviceId = 'device_A';
  const credential = 'k'.repeat(36);
  const personalState = {
    sessionId: 'run_1', registered: true, nickname: 'Ada', team: 'NAVY', vote: null, result: null,
    score: 0, correct: 0, answered: 0, accuracy: null, bestStreak: 0, rank: null, totalParticipants: 1, commitments: [],
  };
  const requests: Array<{ action: string }> = [];
  const server = http.createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    requests.push({ action: body.p_request.action });
    response.setHeader('content-type', 'application/json');
    // Every connect (the first one, and the one after the simulated reload) redelivers the
    // device's own personal state, mirroring the real RPC's `v_action = 'connect'` branch proven
    // against Postgres in production-relay-db.test.mjs.
    response.end(JSON.stringify({
      events: [{ kind: 'READY', role: 'attendee' }, { kind: 'ATTENDEE_STATE', state: personalState }],
      snapshotRevision: 0, personalRevision: 0, ackCursor: 0,
    }));
  });
  const port = await listen(server);
  process.env.VITE_SUPABASE_URL = `http://127.0.0.1:${port}`;
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test_key';

  const firstMessages: unknown[] = [];
  const first = connectProductionRoom({
    roomId, role: 'attendee', credential, deviceId,
    onStatus: () => {}, onError: () => {}, onMessage: (message) => firstMessages.push(message),
  });
  await waitFor(() => firstMessages.find((message: any) => message.kind === 'ATTENDEE_STATE'));
  first.close();

  // Simulate the reload: a brand new connectProductionRoom call, same roomId/deviceId/credential
  // (exactly what storedIdentity and getOrCreateDeviceId reconstruct from localStorage), and no
  // HELLO sent on this connection at all.
  const secondMessages: unknown[] = [];
  const second = connectProductionRoom({
    roomId, role: 'attendee', credential, deviceId,
    onStatus: () => {}, onError: () => {}, onMessage: (message) => secondMessages.push(message),
  });
  context.after(async () => {
    second.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  const restored = await waitFor(() => secondMessages.find((message: any) => message.kind === 'ATTENDEE_STATE')) as any;
  assert.deepEqual(restored.state, personalState, 'the recreated connection must receive the same registered identity unprompted');
  assert.equal(requests.filter((r) => r.action === 'send').length, 0, 'no HELLO (a send action) was ever sent by either connection');
});

// The host's look and topic pattern switch ride in two optional keys of the room state (VOF-93 and VOF-94). These two cases run the
// host's real live link over the real production client against a relay that answers the way vof_relay.valid_room_state makes it
// answer, before and after its room look migration. A relay that does not list the keys refuses the first state that carries them,
// and the host must go on with plain states and show no error. A relay that lists them must see them on every state.
async function lookRelay(listsLookKeys: boolean, { firstStateDelayMs = 0 }: { firstStateDelayMs?: number } = {}) {
  const seen: Array<{ revision: number; keys: string[]; refused: boolean }> = [];
  let delayed = false;
  const server = http.createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const { p_request: relayRequest } = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    response.setHeader('content-type', 'application/json');
    if (relayRequest.action === 'connect') {
      response.end(JSON.stringify({ events: [{ kind: 'READY', role: 'host', snapshotRevision: 0 }], snapshotRevision: 0, inboxCursor: 0 }));
      return;
    }
    const message = relayRequest.message ?? relayRequest.messages?.[0];
    if (relayRequest.action === 'send' && message?.kind === 'ROOM_STATE') {
      const keys = Object.keys(message.state).filter((key) => key === 'look' || key === 'patterns');
      const refused = keys.length > 0 && !listsLookKeys;
      seen.push({ revision: message.state.revision, keys, refused });
      if (firstStateDelayMs && !delayed) {
        delayed = true;
        await new Promise((resolve) => setTimeout(resolve, firstStateDelayMs));
      }
      response.end(JSON.stringify({ events: refused ? [{ kind: 'ERROR', reason: ROOM_STATE_REFUSED }] : [], snapshotRevision: refused ? 0 : message.state.revision, inboxCursor: 0 }));
      return;
    }
    response.end(JSON.stringify({ events: [], snapshotRevision: seen.at(-1)?.revision ?? 0, inboxCursor: 0 }));
  });
  const port = await listen(server);
  process.env.VITE_SUPABASE_URL = `http://127.0.0.1:${port}`;
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test_key';
  return { seen, close: () => new Promise<void>((resolve) => server.close(() => resolve())) };
}

function hostLink(onError: (reason: string | null) => void) {
  useGameStore.setState(useGameStore.getInitialState(), true);
  useGameStore.setState({ offlineMode: false, interactionMode: 'polling', phase: 'lobby', votesLocked: false,
    run: [{ id: 'synthetic', type: 'question', kind: 'binary', statement: 'Synthetic', answer: true }], slideIndex: 0 });
  const picks = createHostLookStore({ search: '?look=casefile&pattern=off', storage: null });
  const link = startHostLiveLink({
    roomId: 'Room_A', credential: 'h'.repeat(36), enabled: true,
    store: { getState: useGameStore.getState, subscribe: (listener) => useGameStore.subscribe(listener) },
    connect: connectProductionRoom, onStatus: () => {}, onError,
    roomLook: { keys: () => roomLookKeys(picks.getState()), subscribe: (listener) => picks.subscribe(listener) },
  });
  return { link, picks };
}

test('a production relay that does not list the look keys refuses the first state with them, and the host goes on with plain states and no error', async (context) => {
  const relay = await lookRelay(false);
  const errors: Array<string | null> = [];
  const { link, picks } = hostLink((reason) => errors.push(reason));
  context.after(async () => { link.close(); await relay.close(); });

  await waitFor(() => relay.seen.find((entry) => entry.keys.length === 0));
  const refused = relay.seen.find((entry) => entry.refused);
  assert.deepEqual(refused?.keys.sort(), ['look', 'patterns'], 'the first state carried both keys and the relay refused it');
  assert.ok(relay.seen.some((entry) => entry.keys.length === 0 && !entry.refused && entry.revision > (refused?.revision ?? 0)), 'the next state went without them and was taken');
  assert.deepEqual(errors.filter(Boolean), [], 'no error showed for a refusal the keys caused');

  picks.getState().pick('studio');
  await new Promise((resolve) => setTimeout(resolve, 150));
  const last = relay.seen.at(-1);
  assert.deepEqual(last?.keys, [], 'a pick made after that goes out as a plain state');
  assert.equal(relay.seen.filter((entry) => entry.refused).length, 1, 'and the relay was asked with the keys only once');
});

test('a pick made while the first state with the keys is still on its way to a relay that refuses them never shows an error', async (context) => {
  // The relay is slow with its first answer, so a second state with the keys is waiting behind it when the refusal arrives. The
  // plain state must replace that one, and the relay must never be asked a second time with the keys.
  const relay = await lookRelay(false, { firstStateDelayMs: 150 });
  const errors: Array<string | null> = [];
  const { link, picks } = hostLink((reason) => errors.push(reason));
  context.after(async () => { link.close(); await relay.close(); });

  await waitFor(() => relay.seen.length > 0 ? true : undefined);
  picks.getState().pick('studio');
  await new Promise((resolve) => setTimeout(resolve, 700));
  assert.deepEqual(errors.filter(Boolean), [], 'no error shows');
  assert.equal(relay.seen.filter((entry) => entry.refused).length, 1, 'the relay was asked with the keys once');
  assert.ok(relay.seen.some((entry) => entry.keys.length === 0 && !entry.refused), 'and took the plain state that followed');
  assert.deepEqual(relay.seen.at(-1)?.keys, [], 'every state after the refusal went without the keys');
});

test('a production relay that lists the look keys takes them on every state', async (context) => {
  const relay = await lookRelay(true);
  const errors: Array<string | null> = [];
  const { link, picks } = hostLink((reason) => errors.push(reason));
  context.after(async () => { link.close(); await relay.close(); });

  await waitFor(() => relay.seen.length > 0 ? true : undefined);
  picks.getState().pick('studio');
  await new Promise((resolve) => setTimeout(resolve, 150));
  assert.ok(relay.seen.length >= 2, 'the host published, and published again for the pick');
  assert.ok(relay.seen.every((entry) => !entry.refused && entry.keys.sort().join() === 'look,patterns'), 'every state carried both keys and was taken');
  assert.deepEqual(errors.filter(Boolean), []);
});

// The host adapter marks each phone message in a relay response with the newest room state the relay could have held when it
// took it (VOF-RELIABILITY-2026-10-05). The host link counts a vote the relay took before the host's own lock with it.
test('host adapter marks each phone message with the newest room state the relay held when it took it', async (context) => {
  const vote = (messageId: string) => ({ kind: 'CLIENT_MESSAGE', message: { version: 1, type: 'VOTE', roomId: 'Room_A', sessionId: 'run_1', deviceId: 'phone_1', messageId, questionInstanceId: 'run_1:0:q1', choice: 'true', conviction: 'fairly-sure' } });
  let pollAnswered = false;
  const server = http.createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const { p_request: relayRequest } = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    response.setHeader('content-type', 'application/json');
    const sent = relayRequest.message?.kind === 'ROOM_STATE' ? relayRequest.message.state.revision : null;
    let answer: unknown;
    if (relayRequest.action === 'connect') answer = { events: [{ kind: 'READY', role: 'host', snapshotRevision: 0 }], snapshotRevision: 0, inboxCursor: 0 };
    else if (sent === 5) answer = { events: [vote('stored_with_5')], snapshotRevision: 5, inboxCursor: 1 };
    // The real relay sends no inbox with an error, so this only pins the client's rule: no stored revision, no bound.
    else if (sent === 6) answer = { events: [{ kind: 'ERROR', reason: 'Invalid or stale room state' }, vote('with_a_refused_state')] };
    else {
      answer = { events: pollAnswered ? [] : [vote('on_a_poll')], snapshotRevision: 5, inboxCursor: 2 };
      pollAnswered = true;
    }
    response.end(JSON.stringify(answer));
  });
  const port = await listen(server);
  process.env.VITE_SUPABASE_URL = `http://127.0.0.1:${port}`;
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test_key';
  const heard: any[] = [];
  let connected = false;
  const connection = connectProductionRoom({
    roomId: 'Room_A', role: 'host', credential: 'h'.repeat(36),
    onStatus: (status) => { if (status === 'connected') connected = true; }, onError: () => {}, onMessage: (message) => heard.push(message),
  });
  context.after(async () => { connection.close(); await new Promise<void>((resolve) => server.close(() => resolve())); });
  await waitFor(() => (connected ? true : undefined));
  assert.equal(connection.send({ kind: 'ROOM_STATE', state: { ...state(5), phase: 'deliberating' } }), true);
  const stored = await waitFor(() => heard.find((message) => message.message?.messageId === 'stored_with_5'));
  assert.equal(stored.relayRevision, 4, 'one under the state the same exchange stored, which the relay did not hold yet');
  const polled = await waitFor(() => heard.find((message) => message.message?.messageId === 'on_a_poll'), 3000);
  assert.equal(polled.relayRevision, 5, 'on an exchange that stored nothing, the revision the relay holds');
  assert.equal(connection.send({ kind: 'ROOM_STATE', state: { ...state(6), phase: 'deliberating' } }), true);
  const refused = await waitFor(() => heard.find((message) => message.message?.messageId === 'with_a_refused_state'));
  assert.equal(refused.relayRevision, undefined, 'a response that names no stored revision bounds nothing');
});

// A relay that refuses one phone message answers that send with an ERROR. That one message settles as a refused ACK without the
// relay's words, and it is no room error: the phone never shows "Invalid attendee message".
test('attendee adapter settles a refused send as a refused ACK without the relay\'s words, and raises no room error', async (context) => {
  const server = http.createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const { p_request: relayRequest } = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    response.setHeader('content-type', 'application/json');
    if (relayRequest.action === 'connect') response.end(JSON.stringify({ events: [{ kind: 'READY', role: 'attendee' }], snapshotRevision: 1, personalRevision: 0, ackCursor: 0 }));
    else if (relayRequest.action === 'send') response.end(JSON.stringify({ events: [{ kind: 'ERROR', reason: 'Invalid attendee message' }] }));
    else response.end(JSON.stringify({ events: [], snapshotRevision: 1, personalRevision: 0, ackCursor: 0 }));
  });
  const port = await listen(server);
  process.env.VITE_SUPABASE_URL = `http://127.0.0.1:${port}`;
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test_key';
  const heard: any[] = [];
  const errors: Array<string | null> = [];
  let connected = false;
  const connection = connectProductionRoom({
    roomId: 'Room_A', role: 'attendee', credential: 'p'.repeat(36), deviceId: 'phone_1',
    onStatus: (status) => { if (status === 'connected') connected = true; }, onError: (reason) => errors.push(reason), onMessage: (message) => heard.push(message),
  });
  context.after(async () => { connection.close(); await new Promise<void>((resolve) => server.close(() => resolve())); });
  await waitFor(() => (connected ? true : undefined));
  const reaction = { version: 1, type: 'REACTION', roomId: 'Room_A', sessionId: 'run_1', deviceId: 'phone_1', messageId: 'reaction_1', reaction: 'knew-it', questionInstanceId: 'run_1:0:q1' };
  assert.equal(connection.send({ kind: 'CLIENT_MESSAGE', message: reaction }), true);
  const ack = await waitFor(() => heard.find((message) => message.kind === 'ACK' && message.messageId === 'reaction_1'));
  assert.deepEqual(ack, { kind: 'ACK', messageId: 'reaction_1', accepted: false }, 'refused, with no reason of the relay\'s');
  assert.deepEqual(errors.filter(Boolean), [], 'and no room error');
});
