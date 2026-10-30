import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { connectProductionRoom } from '../../src/network/production-room';
import { startHostLiveLink } from '../../src/network/host-live-link';
import { createHostLookStore } from '../../src/looks/host-look';
import { roomLookKeys } from '../../src/network/room-look';
import { useGameStore } from '../../src/store/game-store';
import type { RoomConnection } from '../../src/network/room-socket';
import { startRelayPostgres } from './relay-postgres.mjs';

// The production relay's real SQL in a local Postgres, the real host live link and store, and real phone clients. Over that relay
// the host hears of a phone's vote only on its next exchange, about once a second, so a vote can reach the relay before the host
// locks and still reach the host after. The 2026-10-05 live walk on vaxorfiction.com lost every vote that way when the host locked
// within half a second of the taps: the relay held them, then the host refused them with "Voting is closed".

type Exchange = { request: any; response: any; startedAt: number; endedAt: number };
type Heard = { at: number; message: any };

let relay: Awaited<ReturnType<typeof startRelayPostgres>>;
let server: { url: string; close(): Promise<void> };
const exchanges: Exchange[] = [];

before(async () => {
  relay = await startRelayPostgres();
  server = await relay.serve({ onExchange: (entry: Exchange) => exchanges.push(entry) });
  process.env.VITE_SUPABASE_URL = server.url;
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test_key';
});

after(async () => {
  await server?.close();
  await relay?.stop();
});

function waitFor<T>(read: () => T | undefined | null | false, label: string, timeout = 8000): Promise<T> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const check = () => {
      const value = read();
      if (value !== undefined && value !== null && value !== false) resolve(value as T);
      else if (Date.now() - started > timeout) reject(new Error(`Timed out waiting for ${label}`));
      else setTimeout(check, 5);
    };
    check();
  });
}

const question = { id: 'race-q', type: 'question', kind: 'binary', statement: 'A synthetic statement for the relay race.', answer: true, reveal: 'Synthetic.', takeaway: 'Synthetic.' };

function startRoom(roomId: string) {
  useGameStore.setState(useGameStore.getInitialState(), true);
  useGameStore.setState({ offlineMode: false, interactionMode: 'polling', phase: 'lobby', votesLocked: false, run: [question] as never, slideIndex: -1 });
  const picks = createHostLookStore({ search: '', storage: null });
  const errors: Array<string | null> = [];
  const link = startHostLiveLink({
    roomId, credential: `host_${roomId}`.padEnd(36, 'h'), enabled: true,
    store: { getState: useGameStore.getState, subscribe: (listener) => useGameStore.subscribe(listener) },
    connect: connectProductionRoom, onStatus: () => {}, onError: (reason) => errors.push(reason),
    roomLook: { keys: () => roomLookKeys(picks.getState()), subscribe: (listener) => picks.subscribe(listener) },
  });
  return { link, errors };
}

function joinPhone(roomId: string, name: string) {
  const deviceId = `phone_${name}`;
  const heard: Heard[] = [];
  const errors: Array<string | null> = [];
  const connection: RoomConnection = connectProductionRoom({
    roomId, role: 'attendee', credential: `cred_${roomId}_${name}`.padEnd(36, 'p'), deviceId,
    onStatus: () => {}, onError: (reason) => errors.push(reason), onMessage: (message) => heard.push({ at: Date.now(), message }),
  });
  let sequence = 0;
  const latestRoom = () => [...heard].reverse().find((entry) => entry.message.kind === 'ROOM_STATE')?.message.state;
  const send = (type: string, fields: Record<string, unknown>) => {
    const messageId = `${name}_${type.toLowerCase()}_${sequence += 1}`;
    const state = latestRoom();
    assert.ok(state, `${name} has a room state to answer`);
    assert.ok(connection.send({ kind: 'CLIENT_MESSAGE', message: { version: 1, type, roomId, sessionId: state.sessionId, deviceId, messageId, ...fields } }), `${name} queued its ${type}`);
    return messageId;
  };
  const ack = (messageId: string) => waitFor(() => heard.find((entry) => entry.message.kind === 'ACK' && entry.message.messageId === messageId), `${name}'s ACK for ${messageId}`);
  const vote = (choice: string, extra: Record<string, unknown> = {}) => send('VOTE', { choice, conviction: 'fairly-sure', questionInstanceId: latestRoom()?.questionData?.questionInstanceId, ...extra });
  return { deviceId, heard, errors, connection, latestRoom, send, ack, vote };
}

const isHost = (entry: Exchange) => entry.request.role === 'host';
const carries = (entry: Exchange, messageId: string) => (entry.response.events ?? []).some((event: any) => event.kind === 'CLIENT_MESSAGE' && event.message?.messageId === messageId);
const relayAnswered = (deviceId: string, messageId: string) => exchanges.find((entry) => entry.request.role === 'attendee' && entry.request.deviceId === deviceId && entry.request.message?.message?.messageId === messageId);
const voters = () => useGameStore.getState().pollVoters[question.id] ?? {};

async function openQuestionWithPhones(roomId: string, names: string[]) {
  const room = startRoom(roomId);
  const phones = names.map((name) => joinPhone(roomId, name));
  await Promise.all(phones.map((phone) => waitFor(() => phone.latestRoom(), `${phone.deviceId}'s first room state`)));
  for (const phone of phones) {
    const hello = phone.send('HELLO', { nickname: phone.deviceId.replace('phone_', '') });
    assert.equal((await phone.ack(hello)).message.accepted, true, `${phone.deviceId} joined`);
  }
  useGameStore.getState().dispatch({ type: 'ADVANCE' });
  assert.equal(useGameStore.getState().phase, 'entering', 'the host is on the question with its vote open');
  await Promise.all(phones.map((phone) => waitFor(() => phone.latestRoom()?.questionData && phone.latestRoom()?.votesLocked === false, `${phone.deviceId} sees the open question`)));
  return { room, phones };
}

test('a vote the relay took before the host locked counts, though the host hears of it after its own lock', { timeout: 60_000 }, async (context) => {
  const { room, phones } = await openQuestionWithPhones('Race_A', ['early', 'racer1', 'racer2', 'racer3', 'late']);
  context.after(() => { for (const phone of phones) phone.connection.close(); room.link.close(); });
  const [early, racer1, racer2, racer3, late] = phones;

  // The formerly working case: a vote that reaches the host while the vote is open counts, as it always has.
  const earlyVote = early.vote('true');
  assert.equal((await early.ack(earlyVote)).message.accepted, true, 'an open vote is taken');
  assert.equal(voters()[early.deviceId]?.choice, 'true');

  // The race, in the production order: right after an idle host poll (so its next exchange is about a second away), a vote
  // reaches the relay, and the host locks before that next exchange. On a loaded machine the relay's answer can come so late
  // that the host hears of the vote before its lock. That vote counts as any open one does, the vote opens again, and the
  // next phone races, up to three times.
  const voted = [early.deviceId];
  let raced: { racer: typeof early; vote: string; ack: Heard; delivery: Exchange; lockedAt: number } | null = null;
  for (const racer of [racer1, racer2, racer3]) {
    const settledAt = Date.now();
    await waitFor(() => exchanges.find((entry) => isHost(entry) && entry.request.action === 'poll' && entry.startedAt > settledAt), 'an idle host poll to finish');
    const vote = racer.vote('false');
    await waitFor(() => relayAnswered(racer.deviceId, vote), 'the relay to take the racing vote');
    const lockedAt = Date.now();
    useGameStore.getState().dispatch({ type: 'LOCK_VOTES' });
    assert.equal(useGameStore.getState().votesLocked, true, 'the host has locked');
    const ack = await racer.ack(vote);
    const delivery = exchanges.find((entry) => isHost(entry) && carries(entry, vote))!;
    voted.push(racer.deviceId);
    if (delivery.startedAt >= lockedAt) {
      raced = { racer, vote, ack, delivery, lockedAt };
      break;
    }
    assert.equal(ack.message.accepted, true, 'a vote the host heard of before its lock counts as always');
    const reopenedAt = Date.now();
    useGameStore.setState({ votesLocked: false });
    await waitFor(() => exchanges.find((entry) => isHost(entry) && entry.startedAt >= reopenedAt && entry.request.message?.kind === 'ROOM_STATE'
      && entry.request.message.state.votesLocked === false && entry.response.snapshotRevision === entry.request.message.state.revision), 'the relay to hold the open vote again');
  }
  assert.ok(raced, 'the race happened in one of three tries: the host heard of a vote only after its own lock');
  const { racer, ack: racerAck, delivery, lockedAt } = raced;
  assert.equal(racerAck.message.accepted, true, `the vote the relay took before the lock counts (the host said: ${racerAck.message.reason ?? 'yes'})`);
  assert.equal(voters()[racer.deviceId]?.choice, 'false', 'and the host has it in the count');
  await waitFor(() => racer.heard.find((entry) => entry.message.kind === 'ATTENDEE_STATE' && entry.message.state?.vote?.choice === 'false'), 'the racing phone to see its vote as taken');
  // Which exchange brought it in: the one that stored the lock (bound one under the lock), or a later one.
  context.diagnostic(`racing vote delivered by a host ${delivery.request.action}${delivery.request.message?.kind === 'ROOM_STATE' ? ` that stored revision ${delivery.request.message.state.revision} (locked: ${delivery.request.message.state.votesLocked})` : ''}`);

  // The lock still means something: once the relay holds the locked state, a vote that reaches it after is refused.
  await waitFor(() => exchanges.find((entry) => isHost(entry) && entry.startedAt >= lockedAt && entry.request.message?.kind === 'ROOM_STATE'
    && entry.request.message.state.votesLocked === true && entry.response.snapshotRevision === entry.request.message.state.revision), 'the relay to hold the racing try\'s lock');
  const lateVote = late.vote('true');
  const lateAck = await late.ack(lateVote);
  assert.equal(lateAck.message.accepted, false, 'a vote the relay took after the lock is refused');
  assert.equal(lateAck.message.reason, 'Voting is closed');
  assert.equal(voters()[late.deviceId], undefined, 'and is not counted');
  assert.deepEqual(Object.keys(voters()).sort(), voted.sort(), 'the count is every vote the relay took while the vote was open');
  assert.deepEqual(room.errors.filter(Boolean), [], 'the host showed no error');
});

test('a phone message the relay refuses settles at once as a refused ACK, so nothing is left waiting on it', { timeout: 60_000 }, async (context) => {
  const { room, phones: [phone] } = await openQuestionWithPhones('Refused_A', ['refused']);
  context.after(() => { phone.connection.close(); room.link.close(); });

  // The relay refuses a message its own check does not pass (today it refuses every reaction this way, because the phone sends
  // the question's instance with it). No host ever sees such a message, so no host ACK will ever come for it.
  const sentAt = Date.now();
  const refused = phone.vote('true', { conviction: 'not-a-conviction' });
  const answer = await waitFor(() => relayAnswered(phone.deviceId, refused), 'the relay to answer the refused message');
  assert.deepEqual(answer.response.events, [{ kind: 'ERROR', reason: 'Invalid attendee message' }], 'the relay refused it');
  const ack = await phone.ack(refused);
  assert.equal(ack.message.accepted, false);
  assert.equal(ack.message.reason, undefined, "the relay's own words never travel on to the phone");
  assert.ok(!phone.errors.includes('Invalid attendee message'), 'and the phone hears no room error for the one message refused');
  assert.ok(ack.at - sentAt < 1500, `the phone hears the refusal with the relay's answer, not after a timeout (${ack.at - sentAt} ms)`);

  // And the phone's next vote goes through as usual.
  const next = phone.vote('true');
  assert.equal((await phone.ack(next)).message.accepted, true, 'the next vote is taken');
});
