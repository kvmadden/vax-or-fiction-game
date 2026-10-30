// Phones follow the host's look and topic pattern switch (VOF-93 and VOF-94), through two optional keys of the room state. The owner
// approved the additive migration that lets the production relay list them (2026-10-02), so the host sends them by default and the
// release applies the migration first. A phone that gets no keys falls back to Today with patterns on, and a host whose relay refuses
// its first state with the keys takes them off and goes on with plain states, so a room never stalls.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { createHostLookStore } from '../../src/looks/host-look';
import { lookFlag, resolvePhoneLook } from '../../src/looks/look';
import { patternFlag, resolvePhonePatterns } from '../../src/looks/patterns/pattern-setting';
import { validatePublicRoomState } from '../../src/network/guards';
import { projectGameState } from '../../src/network/game-projection';
import { startHostLiveLink } from '../../src/network/host-live-link';
import { ROOM_STATE_REFUSED, readRoomLook, roomLookKeys, type RoomLookSource } from '../../src/network/room-look';
import { useGameStore } from '../../src/store/game-store';
import type { RoomSocketOptions } from '../../src/network/room-socket';

const repoRoot = resolve(import.meta.dirname, '../..');
const read = (file: string) => readFileSync(resolve(repoRoot, file), 'utf8');
/** Every .ts, .tsx and .mjs file under a folder. */
function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : /\.(ts|tsx|mjs)$/.test(entry.name) ? [path] : [];
  });
}

test('the host sends the look and the switch by default, and a plain projection is as valid as ever', async () => {
  assert.deepEqual(roomLookKeys({ look: 'studio', patterns: false }), { look: 'studio', patterns: false }, 'exactly the two keys');
  assert.deepEqual(roomLookKeys({ look: 'today', patterns: true }), { look: 'today', patterns: true });
  const retired = sourceFiles(resolve(repoRoot, 'src')).concat(sourceFiles(resolve(repoRoot, 'server'))).concat([resolve(repoRoot, 'vite.config.ts')])
    .filter((file) => /VITE_ROOM_LOOK|ROOM_CARRIES_LOOK/.test(readFileSync(file, 'utf8')));
  assert.deepEqual(retired, [], 'there is no build switch anywhere: sending is the real path');
  // A host with no source of its own reads its real store, which wears Today with patterns on until the host picks otherwise.
  const host = liveLinkFixture(undefined);
  const sent = host.messages.filter((message) => message.kind === 'ROOM_STATE').map((message) => message.state);
  assert.ok(sent.length > 0, 'control: the host publishes');
  assert.ok(sent.every((state) => state.look === 'today' && state.patterns === true), 'and every state carries both keys');
  assert.equal(validatePublicRoomState(sent.at(-1), 'TEST'), true);
  host.link.close();
  // A projection built the way solo builds it carries no look key, so no existing shape changes.
  useGameStore.setState(useGameStore.getInitialState(), true);
  const state = projectGameState(useGameStore.getState(), 'ROOM', 1).roomState as unknown as Record<string, unknown>;
  assert.equal('look' in state, false);
  assert.equal('patterns' in state, false);
});

test('a phone reads the look and the switch when the room carries them, and falls back to Today with patterns on when it does not', () => {
  assert.deepEqual(readRoomLook(undefined), { look: null, patterns: null });
  assert.deepEqual(readRoomLook(null), { look: null, patterns: null });
  assert.deepEqual(readRoomLook({}), { look: null, patterns: null }, 'a room state from a host that does not know the keys');
  assert.deepEqual(readRoomLook({ look: 'casefile', patterns: false }), { look: 'casefile', patterns: false });
  assert.deepEqual(readRoomLook({ look: 'seventies' }), { look: 'seventies', patterns: null });
  assert.deepEqual(readRoomLook({ look: 'noir' }), { look: null, patterns: null }, 'a look this build does not know falls back, the same as a room that names none');
  assert.deepEqual(readRoomLook({ look: 7, patterns: 'no' }), { look: null, patterns: null }, 'and a value of the wrong type is ignored, never thrown on');

  assert.equal(resolvePhoneLook({ flag: null, room: null }), 'today');
  assert.equal(resolvePhoneLook({ flag: null, room: 'studio' }), 'studio', 'the room decides when the page names none');
  assert.equal(resolvePhoneLook({ flag: lookFlag('?look=casefile'), room: 'studio' }), 'casefile', 'the testing flag still wins on a phone');
  assert.equal(resolvePhoneLook({ flag: null }), 'today', 'the call the first build made still works');
  assert.equal(resolvePhonePatterns({ flag: patternFlag('?pattern=on'), room: false }), true, 'the flag wins over the room for patterns too');
  assert.equal(resolvePhonePatterns({ flag: null, room: false }), false);
  assert.equal(resolvePhonePatterns({ flag: null, room: null }), true);

  const phone = read('src/phone/PhoneSuite.tsx');
  assert.match(phone, /readRoomLook\(link\.roomState\)/, 'the room phone reads the keys from the room state it already has');
  assert.doesNotMatch(phone.slice(phone.indexOf('export const PhoneScreens'), phone.indexOf('export const PhoneSuite')), /readRoomLook/, 'in the suite and not in the shared screens, since solo shares those and has no host');
});

test('the room state guard takes the two optional keys and nothing else, and a state without them is as valid as ever', () => {
  useGameStore.setState(useGameStore.getInitialState(), true);
  const base = projectGameState(useGameStore.getState(), 'ROOM', 1).roomState;
  assert.equal(validatePublicRoomState(base, 'ROOM'), true, 'the old shape');
  assert.equal(validatePublicRoomState({ ...base, look: 'studio', patterns: false }, 'ROOM'), true);
  assert.equal(validatePublicRoomState({ ...base, look: 'Studio' }, 'ROOM'), false);
  assert.equal(validatePublicRoomState({ ...base, patterns: 'off' }, 'ROOM'), false);
  assert.equal(validatePublicRoomState({ ...base, theme: 'dark' }, 'ROOM'), false, 'still strict about every other key');
});

function liveLinkFixture(roomLook: RoomLookSource | undefined) {
  useGameStore.setState(useGameStore.getInitialState(), true);
  useGameStore.setState({ offlineMode: false, interactionMode: 'polling', phase: 'entering', votesLocked: false,
    run: [{ id: 'synthetic', type: 'question', kind: 'binary', statement: 'Synthetic', answer: true }], slideIndex: 0 });
  let options!: RoomSocketOptions;
  const messages: any[] = [];
  const errors: Array<string | null> = [];
  const link = startHostLiveLink({ roomId: 'TEST', credential: 'synthetic-credential-12345678', enabled: true, ...(roomLook ? { roomLook } : {}),
    store: { getState: useGameStore.getState, subscribe: (listener) => useGameStore.subscribe(listener) },
    connect(config) { options = config; return { send(message) { messages.push(message); return true; }, retry() {}, close() {} }; },
    onStatus() {}, onError(reason) { errors.push(reason); },
  });
  options.onMessage({ kind: 'READY' });
  return { link, messages, errors, get options() { return options; } };
}

const roomStates = (messages: any[]) => messages.filter((message) => message.kind === 'ROOM_STATE').map((message) => message.state);

test('the host adds the keys to the room state it publishes, and publishes again when the pick changes', async () => {
  const store = createHostLookStore({ search: '?look=casefile&pattern=off', storage: null });
  let watchers = 0;
  const source: RoomLookSource = {
    keys: () => roomLookKeys(store.getState()),
    subscribe: (listener) => { watchers += 1; const stop = store.subscribe(listener); return () => { watchers -= 1; stop(); }; },
  };
  const on = liveLinkFixture(source);
  assert.equal(watchers, 1, 'the host watches the pick');
  const first = roomStates(on.messages);
  assert.ok(first.length > 0 && first.every((state) => state.look === 'casefile' && state.patterns === false), 'the keys carry the host pick');
  assert.equal(validatePublicRoomState(first.at(-1), 'TEST'), true, 'and the state still passes the phone guard');
  const sent = first.length;
  store.getState().pick('studio');
  await new Promise((resolve) => setTimeout(resolve, 60));
  const after = roomStates(on.messages);
  assert.ok(after.length > sent, 'a new look publishes a new state');
  assert.equal(after.at(-1).look, 'studio');
  assert.ok(after.at(-1).revision > first.at(-1).revision, 'with a higher revision, so a phone takes it');
  store.getState().setPatterns(true);
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.equal(roomStates(on.messages).at(-1).patterns, true, 'and so does the switch');
  on.link.close();
  assert.equal(watchers, 0, 'closing the link stops watching');
});

test('a relay that refuses the first state with the keys gets plain states from then on, with no error shown, and a reconnect tries the keys again', async () => {
  const store = createHostLookStore({ search: '?look=seventies', storage: null });
  const source: RoomLookSource = { keys: () => roomLookKeys(store.getState()), subscribe: (listener) => store.subscribe(listener) };
  const room = liveLinkFixture(source);
  const wait = () => new Promise((resolve) => setTimeout(resolve, 60));
  const before = roomStates(room.messages);
  assert.ok(before.length > 0 && before.every((state) => state.look === 'seventies'), 'the first state carries the keys');

  // The production relay before its migration answers that state the way valid_room_state makes it.
  room.options.onError(ROOM_STATE_REFUSED);
  await wait();
  const plain = roomStates(room.messages).at(-1);
  assert.ok(roomStates(room.messages).length > before.length, 'the host publishes again at once');
  assert.equal('look' in plain, false, 'without the look');
  assert.equal('patterns' in plain, false, 'and without the switch');
  assert.ok(plain.revision > before.at(-1).revision, 'a state a phone takes');
  assert.equal(validatePublicRoomState(plain, 'TEST'), true, 'and one the old guards take');
  assert.deepEqual(room.errors.filter(Boolean), [], 'no error shows for the one refusal the keys caused');

  store.getState().pick('studio');
  await wait();
  assert.equal('look' in roomStates(room.messages).at(-1), false, 'a pick made after that stays off the wire, so a room that works never stalls on it');

  // A refusal after that is a real one and shows.
  room.options.onError(ROOM_STATE_REFUSED);
  assert.deepEqual(room.errors.filter(Boolean), [ROOM_STATE_REFUSED], 'a second refusal reaches the host');

  // The relay is migrated and the host reconnects: the keys ride again.
  room.options.onMessage({ kind: 'READY' });
  await wait();
  const reconnected = roomStates(room.messages).at(-1);
  assert.equal(reconnected.look, 'studio', 'the reconnect carries the keys again');
  room.link.close();
});

test('a refusal that no state with keys could have caused, and every other error, still shows', async () => {
  // A host with no keys to send, so nothing the relay refuses can be down to them.
  const none: RoomLookSource = { keys: () => ({}), subscribe: () => () => {} };
  const quiet = liveLinkFixture(none);
  quiet.options.onError(ROOM_STATE_REFUSED);
  assert.deepEqual(quiet.errors.filter(Boolean), [ROOM_STATE_REFUSED], 'a refusal with no keys on the wire is not swallowed');
  quiet.link.close();

  const store = createHostLookStore({ search: '', storage: null });
  const busy = liveLinkFixture({ keys: () => roomLookKeys(store.getState()), subscribe: (listener) => store.subscribe(listener) });
  busy.options.onError('Host message rate exceeded');
  busy.options.onError('Relay request timed out');
  assert.deepEqual(busy.errors.filter(Boolean), ['Host message rate exceeded', 'Relay request timed out'], 'other errors are not taken for a refused key');
  assert.ok(roomStates(busy.messages).length > 0 && roomStates(busy.messages).every((state) => 'look' in state), 'and the keys stay on');
  busy.link.close();
});

test('the refusal the host answers is the exact reason the production relay gives', () => {
  for (const file of ['supabase/migrations/20260913170036_vax_or_fiction_production_relay.sql', 'supabase/migrations/20260926140000_vax_or_fiction_production_relay_anonymous_room_budget.sql']) {
    const sql = read(file);
    const call = sql.indexOf("vof_relay.valid_room_state(v_message->'state'");
    assert.ok(call > 0, `${file} validates the host's room state`);
    assert.ok(sql.slice(call, call + 220).includes(`error_response('${ROOM_STATE_REFUSED}')`), `${file} answers a refused state with '${ROOM_STATE_REFUSED}'`);
  }
});

test('the client side of the keys is one small module with two callers, and the module a phone loads never touches the host store', () => {
  const importers = sourceFiles(resolve(repoRoot, 'src')).filter((file) => /from\s+['"][^'"]*room-look['"]/.test(readFileSync(file, 'utf8')))
    .map((file) => file.slice(repoRoot.length + 1));
  assert.deepEqual(importers.sort(), ['src/network/host-live-link.ts', 'src/phone/PhoneSuite.tsx'], 'the host and the room phone are the only callers anywhere in the app');
  assert.doesNotMatch(read('src/network/room-look.ts'), /host-look|hostLookStore|localStorage/, 'and the module the phone loads never touches the host store or the device memory');
  const guards = read('src/network/guards.ts');
  assert.match(guards, /ROOM_LOOK_KEYS/, 'the guard names the two optional keys in one place');
});
