import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import { WebSocket } from 'ws';
import { attachRoomRelay } from '../../server/room-relay.mjs';

const credential = (seed) => `${seed}`.repeat(36).slice(0, 36);

async function withRelay(run, options) {
  const server = http.createServer((_request, response) => response.end('Vax or Fiction room relay'));
  const relay = attachRoomRelay(server, options);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try { await run(`ws://127.0.0.1:${port}`); }
  finally {
    await relay.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

function openClient(base, roomId, registration) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`${base}/api/rooms/${roomId}/ws`, { headers: { origin: base.replace('ws:', 'http:') } });
    const messages = [];
    const claimed = new Set();
    const waiters = [];
    socket.on('open', () => socket.send(JSON.stringify({ kind: 'CONNECT', version: 1, roomId, ...registration })));
    socket.on('message', (raw) => {
      const message = JSON.parse(raw.toString());
      messages.push(message);
      const index = waiters.findIndex(({ predicate }) => predicate(message));
      if (index >= 0) {
        claimed.add(message);
        waiters.splice(index, 1)[0].resolve(message);
      }
      if (message.kind === 'READY') resolve({ socket, messages, next: (predicate, timeout = 1500) => new Promise((resolveNext, rejectNext) => {
        const existing = messages.find((candidate) => !claimed.has(candidate) && predicate(candidate));
        if (existing) { claimed.add(existing); resolveNext(existing); return; }
        const waiter = { predicate, resolve: resolveNext };
        waiters.push(waiter);
        setTimeout(() => {
          const position = waiters.indexOf(waiter);
          if (position >= 0) waiters.splice(position, 1);
          rejectNext(new Error('Timed out waiting for relay message'));
        }, timeout).unref();
      }) });
    });
    socket.on('error', reject);
    setTimeout(() => reject(new Error('Timed out opening relay client')), 1500).unref();
  });
}

// JOIN-RACE follow-up: the production relay (vof_relay_exchange) requires a room ROW to
// already exist before an attendee can do anything ("select ... from vof_relay.rooms ...
// if not found then return vof_relay.error_response('Host is unavailable')"). Room rows are
// only ever inserted by a host's own 'connect' action. This dev relay instead creates its
// in-memory room object for the FIRST socket to touch a room id, host or attendee, so a
// phone that connects before any host ever has can still get READY and occupy a device
// slot in a room that, in production, could not be joined at all.
test('an attendee cannot join before any host has ever connected, matching the production relay', async () => {
  await withRelay(async (base) => {
    const socket = new WebSocket(`${base}/api/rooms/Room_Hostless/ws`, { headers: { origin: base.replace('ws:', 'http:') } });
    const outcome = new Promise((resolve, reject) => {
      socket.on('message', (raw) => {
        const message = JSON.parse(raw.toString());
        if (message.kind === 'ERROR' || message.kind === 'READY') resolve(message);
      });
      socket.on('close', (code) => resolve({ kind: 'CLOSE', code }));
      socket.on('error', reject);
      setTimeout(() => reject(new Error('Timed out waiting for a response')), 1500).unref();
    });
    const closed = new Promise((resolve) => socket.on('close', (code) => resolve(code)));
    await new Promise((resolve) => socket.on('open', resolve));
    socket.send(JSON.stringify({ kind: 'CONNECT', version: 1, roomId: 'Room_Hostless', role: 'attendee', credential: credential('a'), deviceId: 'device_hostless' }));
    const result = await outcome;
    assert.equal(result.kind, 'ERROR', 'an attendee must not get READY in a room no host has ever claimed');
    assert.match(result.reason ?? '', /host is unavailable/i);
    assert.equal(await closed, 1000, 'a rejected hostless attendee gets a normal closure, not a policy-violation code');
    socket.close();
  });
});

test('real sockets isolate rooms, replay current public/personal state, and deduplicate acknowledged input', async () => {
  await withRelay(async (base) => {
    const hostA = await openClient(base, 'Room_A', { role: 'host', credential: credential('h') });
    const phoneA = await openClient(base, 'Room_A', { role: 'attendee', credential: credential('a'), deviceId: 'device_A' });
    // A phone can only join a room whose host has already connected (JOIN-RACE follow-up), so
    // Room_B needs its own host before phoneB can prove state isolation from Room_A.
    const hostB = await openClient(base, 'Room_B', { role: 'host', credential: credential('hb') });
    const phoneB = await openClient(base, 'Room_B', { role: 'attendee', credential: credential('b'), deviceId: 'device_B' });
    const state = {
      version: 1, roomId: 'Room_A', sessionId: 'run_A', revision: 2, phase: 'lobby', slideIndex: 0, slideCount: 1,
      question: null, questionData: null, reveal: null, votesLocked: true, timerSeconds: 0, timerDurationSeconds: 0,
      timerRunning: false, participants: 0, teamScores: null, leaderboard: [], showdown: null, hostConnected: true,
    };
    hostA.socket.send(JSON.stringify({ kind: 'ROOM_STATE', state }));
    assert.deepEqual((await phoneA.next((message) => message.kind === 'ROOM_STATE')).state, state);
    await assert.rejects(phoneB.next((message) => message.kind === 'ROOM_STATE', 80), /Timed out/);

    const hello = { version: 1, type: 'HELLO', roomId: 'Room_A', sessionId: 'run_A', deviceId: 'device_A', messageId: 'hello_A', nickname: 'Ada', team: 'NAVY' };
    phoneA.socket.send(JSON.stringify({ kind: 'CLIENT_MESSAGE', message: hello }));
    assert.deepEqual((await hostA.next((message) => message.kind === 'CLIENT_MESSAGE')).message, hello);
    hostA.socket.send(JSON.stringify({ kind: 'DIRECT', deviceId: 'device_A', message: { kind: 'ACK', messageId: 'hello_A', accepted: true } }));
    await phoneA.next((message) => message.kind === 'ACK' && message.messageId === 'hello_A');
    const personal = { kind: 'ATTENDEE_STATE', state: {
      sessionId: 'run_A', registered: true, nickname: 'Ada', team: 'NAVY', vote: null, result: null,
      score: 0, correct: 0, answered: 0, accuracy: null, bestStreak: 0, rank: null, totalParticipants: 1, commitments: [],
    } };
    hostA.socket.send(JSON.stringify({ kind: 'DIRECT', deviceId: 'device_A', message: personal }));
    await phoneA.next((message) => message.kind === 'ATTENDEE_STATE');

    const hostCount = hostA.messages.filter((message) => message.kind === 'CLIENT_MESSAGE').length;
    phoneA.socket.send(JSON.stringify({ kind: 'CLIENT_MESSAGE', message: hello }));
    await phoneA.next((message) => message.kind === 'ACK' && message.messageId === 'hello_A');
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.equal(hostA.messages.filter((message) => message.kind === 'CLIENT_MESSAGE').length, hostCount);

    phoneA.socket.close();
    const rejoined = await openClient(base, 'Room_A', { role: 'attendee', credential: credential('a'), deviceId: 'device_A' });
    assert.equal((await rejoined.next((message) => message.kind === 'ROOM_STATE')).state.revision, 2);
    assert.equal((await rejoined.next((message) => message.kind === 'ATTENDEE_STATE')).state.nickname, 'Ada');
    for (const client of [hostA, hostB, phoneB, rejoined]) client.socket.close();
  });
});

test('relay rejects host spoofing, device takeover, malformed envelopes, and rate overflow while allowing adjacent valid traffic', async () => {
  await withRelay(async (base) => {
    const host = await openClient(base, 'Room_C', { role: 'host', credential: credential('h') });
    const phone = await openClient(base, 'Room_C', { role: 'attendee', credential: credential('a'), deviceId: 'device_C' });

    host.socket.send(JSON.stringify({ kind: 'ROOM_STATE', state: {
      version: 1, roomId: 'Room_C', sessionId: 'run_C', revision: 1, phase: 'deliberating', hostConnected: true,
      questionData: { id: 'q1', questionInstanceId: 'run_C:0:q1', kind: 'binary', statement: 'Synthetic', number: 1, total: 1, options: [], answer: true },
    } }));
    assert.match((await host.next((message) => message.kind === 'ERROR')).reason, /host message/i);
    assert.equal(phone.messages.some((message) => message.kind === 'ROOM_STATE'), false, 'answer-bearing nested state is not relayed');

    host.socket.send(JSON.stringify({ kind: 'ROOM_STATE', state: {
      version: 1, roomId: 'Room_C', sessionId: 'run_C', revision: 1, phase: 'deliberating', slideIndex: 0, slideCount: 1,
      question: 'q1', questionData: {
        id: 'q1', questionInstanceId: 'run_C:0:q1', kind: 'estimate', statement: 'Synthetic', number: 1, total: 1,
        options: [{ token: 'a', label: '0-9', text: '0-9', min: 0, max: 9 }], unit: { answer: 'private' },
      },
      reveal: null, votesLocked: false, timerSeconds: 30, timerDurationSeconds: 45, timerRunning: true,
      participants: 1, teamScores: null, leaderboard: [], showdown: null, hostConnected: true,
    } }));
    assert.match((await host.next((message) => message.kind === 'ERROR')).reason, /host message/i);
    assert.equal(phone.messages.some((message) => message.kind === 'ROOM_STATE'), false, 'non-string nested unit data is not relayed');

    const intruder = new WebSocket(`${base}/api/rooms/Room_C/ws`, { headers: { origin: base.replace('ws:', 'http:') } });
    const denied = new Promise((resolve) => intruder.on('message', (raw) => { const message = JSON.parse(raw.toString()); if (message.kind === 'ERROR') resolve(message); }));
    await new Promise((resolve) => intruder.on('open', resolve));
    intruder.send(JSON.stringify({ kind: 'CONNECT', version: 1, roomId: 'Room_C', role: 'host', credential: credential('x') }));
    assert.match((await denied).reason, /owned/i);

    const valid = { kind: 'CLIENT_MESSAGE', message: { version: 1, type: 'HELLO', roomId: 'Room_C', sessionId: 'run_C', deviceId: 'device_C', messageId: 'valid_1', nickname: 'Ada' } };
    phone.socket.send(JSON.stringify(valid));
    await host.next((message) => message.kind === 'CLIENT_MESSAGE' && message.message.messageId === 'valid_1');
    phone.socket.send(JSON.stringify({ ...valid, message: { ...valid.message, deviceId: 'spoofed', messageId: 'spoof_1' } }));
    assert.match((await phone.next((message) => message.kind === 'ERROR')).reason, /attendee message/i);
    phone.socket.send(JSON.stringify({ ...valid, message: { ...valid.message, messageId: 'extra_1', unexpected: 'field' } }));
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.ok(phone.messages.filter((message) => message.kind === 'ERROR').length >= 2);
    phone.socket.close();
    host.socket.close();
  }, { maxMessagesPerSecond: 10 });
});

test('relay closes a client that exceeds the configured message-rate bound', async () => {
  await withRelay(async (base) => {
    const host = await openClient(base, 'Room_D', { role: 'host', credential: credential('hd') });
    const phone = await openClient(base, 'Room_D', { role: 'attendee', credential: credential('d'), deviceId: 'device_D' });
    const closed = new Promise((resolve) => phone.socket.on('close', (code) => resolve(code)));
    for (let index = 0; index < 3; index += 1) phone.socket.send('{"kind":"NOPE"}');
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(phone.socket.readyState, WebSocket.OPEN, 'the configured rate is permitted');
    phone.socket.send('{"kind":"NOPE"}');
    assert.equal(await closed, 1008);
    host.socket.close();
  }, { maxMessagesPerSecond: 3 });
});

test('relay rejects an oversized WebSocket payload', async () => {
  await withRelay(async (base) => {
    const host = await openClient(base, 'Room_E', { role: 'host', credential: credential('he') });
    const phone = await openClient(base, 'Room_E', { role: 'attendee', credential: credential('e'), deviceId: 'device_E' });
    const closed = new Promise((resolve) => phone.socket.on('close', (code) => resolve(code)));
    phone.socket.send('x'.repeat(129 * 1024));
    assert.equal(await closed, 1009);
    host.socket.close();
  });
});

test('a host reload tells every attendee the host is back (HOST_STATUS false then true)', async () => {
  await withRelay(async (base) => {
    const host = await openClient(base, 'Room_R', { role: 'host', credential: credential('h') });
    const phone = await openClient(base, 'Room_R', { role: 'attendee', credential: credential('a'), deviceId: 'device_R' });
    host.socket.close();
    assert.equal((await phone.next((message) => message.kind === 'HOST_STATUS')).connected, false);
    const reloaded = await openClient(base, 'Room_R', { role: 'host', credential: credential('h') });
    assert.equal((await phone.next((message) => message.kind === 'HOST_STATUS')).connected, true, 'host re-registration announces connected:true');
    // Awaited, not read from the array: this message reaches the reloaded host's socket, and nothing orders it
    // against the phone's HOST_STATUS above.
    await reloaded.next((message) => message.kind === 'ATTENDEE_CONNECTED' && message.deviceId === 'device_R');
    reloaded.socket.close();
    phone.socket.close();
  });
});

// NIT-7: this relay keeps its own plain-JS copy of the leaderboard entry shape (server/room-relay.mjs,
// not imported from src/network/guards.ts), so a wire field added on the TypeScript side alone is
// silently invisible here. A ROOM_STATE with a populated leaderboard, in exactly the four-field shape
// the production relay accepts, must reach the room.
// Caught for real, and the story reads backwards from what the shape of this comment used to imply
// (git history: 2242040, then b575c47): NIT-7's own follow-up widened this relay's copy to match
// src/network/guards.ts, adding joinedAt to both together, which hid the drift from every local test
// since the two copies agreed with each other. What actually broke was production: the unwidened
// vof_relay.valid_room_state SQL contract rejected every scored broadcast from the first vote
// onward, invisible locally the whole time. b575c47 walked the wire shape back to four fields and
// added the SQL-contract tests in tests/unit/game-network-projection.test.ts that read the live
// migration, so this class of drift now fails here instead of only in production.
test('a populated leaderboard entry still reaches the room, not just an empty one', async () => {
  await withRelay(async (base) => {
    const host = await openClient(base, 'Room_L', { role: 'host', credential: credential('h') });
    const phone = await openClient(base, 'Room_L', { role: 'attendee', credential: credential('a'), deviceId: 'device_L' });
    const state = {
      version: 1, roomId: 'Room_L', sessionId: 'run_L', revision: 3, phase: 'revealed', slideIndex: 1, slideCount: 2,
      question: 'q1', questionData: null, reveal: null, votesLocked: true, timerSeconds: 0, timerDurationSeconds: 30,
      timerRunning: false, participants: 1, teamScores: null,
      leaderboard: [{ name: 'Ada', score: 100, rank: 1, team: null }],
      showdown: null, hostConnected: true,
    };
    host.socket.send(JSON.stringify({ kind: 'ROOM_STATE', state }));
    assert.deepEqual((await phone.next((message) => message.kind === 'ROOM_STATE')).state, state);
    host.socket.close();
    phone.socket.close();
  });
});

// STREAK-PILL: this dev relay keeps its own plain-JS copy of src/network/guards.ts's attendee-state
// result shape, so streakBonus must be widened here in lockstep or the whole personal ATTENDEE_STATE
// (score, rank, accuracy, everything, not just this field) silently stops reaching the phone.
test('an attendee-state result carries an optional bounded streakBonus, and an out-of-bound value is rejected', async () => {
  await withRelay(async (base) => {
    const host = await openClient(base, 'Room_S', { role: 'host', credential: credential('hs') });
    const phone = await openClient(base, 'Room_S', { role: 'attendee', credential: credential('s'), deviceId: 'device_S' });
    const baseState = {
      sessionId: 'run_S', registered: true, nickname: 'Ada', team: 'NAVY',
      vote: null, result: { questionInstanceId: 'run_S:0:q1', choice: 'true', isCorrect: true, points: 150 },
      score: 150, correct: 1, answered: 1, accuracy: 100, bestStreak: 3, rank: 1, totalParticipants: 1, commitments: [],
    };
    host.socket.send(JSON.stringify({ kind: 'DIRECT', deviceId: 'device_S', message: {
      kind: 'ATTENDEE_STATE', state: { ...baseState, result: { ...baseState.result, streakBonus: 50 } },
    } }));
    assert.equal((await phone.next((message) => message.kind === 'ATTENDEE_STATE')).state.result.streakBonus, 50);

    host.socket.send(JSON.stringify({ kind: 'DIRECT', deviceId: 'device_S', message: {
      kind: 'ATTENDEE_STATE', state: { ...baseState, result: { ...baseState.result, streakBonus: 200 } },
    } }));
    assert.match((await host.next((message) => message.kind === 'ERROR')).reason, /host message/i, 'a streakBonus above scoring.ts\'s real maximum is rejected');

    host.socket.send(JSON.stringify({ kind: 'DIRECT', deviceId: 'device_S', message: { kind: 'ATTENDEE_STATE', state: baseState } }));
    assert.equal((await phone.next((message) => message.kind === 'ATTENDEE_STATE')).state.result.streakBonus, undefined, 'a result with no streakBonus at all still validates');
    host.socket.close();
    phone.socket.close();
  });
});
