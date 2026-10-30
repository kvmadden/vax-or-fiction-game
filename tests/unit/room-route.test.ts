import assert from 'node:assert/strict';
import test from 'node:test';
import { displayJoinHost, generateRoomCode, hasHostIntent, isManualRoomCode, joinInstruction, joinUrl, normalizeRoomCode, resolveAppRoute, resolveJoinOrigin, ROOM_CODE_ALPHABET, withHostRoom } from '../../src/network/room';

test('room routing preserves exact custom identity and selects one exclusive mode', () => {
  assert.deepEqual(resolveAppRoute(new URL('https://example.test/?room=Exact_Room-9&host=1')), { mode: 'host', roomId: 'Exact_Room-9' });
  assert.deepEqual(resolveAppRoute(new URL('https://example.test/?room=Exact_Room-9')), { mode: 'attendee', roomId: 'Exact_Room-9' }, 'bare ?room= is a phone join, not a second host');
  assert.deepEqual(resolveAppRoute(new URL('https://example.test/join?room=Exact_Room-9')), { mode: 'attendee', roomId: 'Exact_Room-9' });
  assert.deepEqual(resolveAppRoute(new URL('https://example.test/remote?room=Exact_Room-9')), { mode: 'remote', roomId: 'Exact_Room-9' });
  assert.deepEqual(
    resolveAppRoute(new URL('https://vaxorfiction.com/?remote=AB3D.REMOTEKEYREMOTEKEYREMOTE')),
    { mode: 'remote', roomId: 'AB3D' },
  );
});

test('join URL uses the actual configured origin and the short /join path', () => {
  assert.equal(joinUrl('http://192.0.2.20:4173', 'Exact_Room-9'), 'http://192.0.2.20:4173/join?room=Exact_Room-9');
  assert.deepEqual(resolveAppRoute(new URL(joinUrl('https://vaxorfiction.com', 'AB3D'))), { mode: 'attendee', roomId: 'AB3D' });
  assert.deepEqual(resolveAppRoute(new URL('https://vaxorfiction.com/?vote=1&room=AB3D')), { mode: 'attendee', roomId: 'AB3D' }, 'legacy query form stays valid');
});

test('the on-stage instruction is the bare host plus the code, never a path or query', () => {
  assert.deepEqual(joinInstruction('https://vaxorfiction.com', 'AB3D'), { host: 'vaxorfiction.com', code: 'AB3D' });
  assert.deepEqual(joinInstruction('http://127.0.0.1:5197', 'AB3D'), { host: '127.0.0.1:5197', code: 'AB3D' });
});

test('displayJoinHost title-cases production apex for on-stage typing while hrefs stay lowercase', () => {
  assert.equal(displayJoinHost('https://vaxorfiction.com'), 'VaxOrFiction.com');
  assert.equal(displayJoinHost('vaxorfiction.com'), 'VaxOrFiction.com');
  assert.equal(displayJoinHost('http://127.0.0.1:5197'), '127.0.0.1:5197');
  assert.equal(displayJoinHost('https://join.example.test'), 'join.example.test');
});

test('host room codes are 4 characters from the unambiguous alphabet', () => {
  assert.equal(ROOM_CODE_ALPHABET.length, 32);
  assert.doesNotMatch(ROOM_CODE_ALPHABET, /[IO01a-z]/);
  for (let index = 0; index < 200; index += 1) {
    const code = generateRoomCode();
    assert.match(code, /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$/, code);
  }
  const generated = resolveAppRoute(new URL('https://vaxorfiction.com/'));
  assert.equal(generated.mode, 'host');
  assert.match(generated.roomId, /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$/);
});

test('typed room codes are trimmed and accepted case-insensitively; custom identities keep their exact bytes', () => {
  assert.equal(normalizeRoomCode(' ab3d '), 'AB3D');
  assert.equal(normalizeRoomCode('Exact_Room-9'), 'Exact_Room-9');
  assert.deepEqual(resolveAppRoute(new URL('https://vaxorfiction.com/join?room=%20ab3d%20')), { mode: 'attendee', roomId: 'AB3D' });
  assert.deepEqual(resolveAppRoute(new URL('https://vaxorfiction.com/?room=ab3d')), { mode: 'attendee', roomId: 'AB3D' });
  assert.deepEqual(resolveAppRoute(new URL('https://vaxorfiction.com/?room=ab3d&host=1')), { mode: 'host', roomId: 'AB3D' });
  assert.deepEqual(resolveAppRoute(new URL('https://vaxorfiction.com/?room=ab3d&preset=curated15')), { mode: 'host', roomId: 'AB3D' });
  assert.deepEqual(resolveAppRoute(new URL('https://vaxorfiction.com/?room=ab3d&mode=curated15')), { mode: 'host', roomId: 'AB3D' });
  assert.deepEqual(resolveAppRoute(new URL('https://vaxorfiction.com/?room=ab3d'), { hostedInThisTab: true }), { mode: 'host', roomId: 'AB3D' });
});

test('one-click host URLs keep preset/mode and stamp host=1 plus a room', () => {
  const next = withHostRoom(new URL('https://vaxorfiction.com/?preset=curated15'), 'AB3D');
  assert.equal(next.searchParams.get('preset'), 'curated15');
  assert.equal(next.searchParams.get('host'), '1');
  assert.equal(next.searchParams.get('room'), 'AB3D');
  assert.equal(hasHostIntent(new URL('https://vaxorfiction.com/?preset=curated15')), true);
  assert.equal(hasHostIntent(new URL('https://vaxorfiction.com/?mode=curated15')), true);
  assert.equal(hasHostIntent(new URL('https://vaxorfiction.com/?room=AB3D')), false);
});

test('explicit public or LAN join base replaces a loopback display origin', () => {
  assert.equal(resolveJoinOrigin('http://127.0.0.1:5173', 'https://join.example.test'), 'https://join.example.test');
  assert.equal(resolveJoinOrigin('http://localhost:5173', 'http://192.168.1.20:5173/'), 'http://192.168.1.20:5173');
  assert.equal(
    joinUrl(resolveJoinOrigin('http://127.0.0.1:5173', 'https://join.example.test'), 'Exact_Room-9'),
    'https://join.example.test/join?room=Exact_Room-9',
  );
});

test('audience QR, copy-link, and joinInstruction use the join origin as given', () => {
  assert.equal(joinUrl('https://vaxorfiction.com', 'AB3D'), 'https://vaxorfiction.com/join?room=AB3D');
  assert.deepEqual(joinInstruction('https://vaxorfiction.com', 'AB3D'), { host: 'vaxorfiction.com', code: 'AB3D' });
  assert.deepEqual(joinInstruction('http://192.168.1.20:5173', 'AB3D'), { host: '192.168.1.20:5173', code: 'AB3D' });
});

test('invalid explicit join base preserves local development behavior', () => {
  assert.equal(resolveJoinOrigin('http://127.0.0.1:5173', 'not-a-url'), 'http://127.0.0.1:5173');
});

test('runtime join base follows the explicit window override convention', () => {
  const previousWindow = (globalThis as { window?: unknown }).window;
  (globalThis as { window?: unknown }).window = { __VOF_JOIN_BASE_URL__: 'https://share.example.test' };
  try {
    assert.equal(resolveJoinOrigin('http://localhost:5173'), 'https://share.example.test');
  } finally {
    if (previousWindow === undefined) delete (globalThis as { window?: unknown }).window;
    else (globalThis as { window?: unknown }).window = previousWindow;
  }
});

test('invalid and empty attendee room identities are never normalized into another room', () => {
  assert.throws(() => resolveAppRoute(new URL('https://example.test/join?room=bad%20room')), /Room IDs/);
  assert.deepEqual(resolveAppRoute(new URL('https://example.test/join')), { mode: 'attendee', roomId: '' });
});

test('manual room entry requires the generated four-character alphabet without narrowing custom links', () => {
  for (const code of ['ABCD', 'h7k2', '  9XYZ  ']) assert.equal(isManualRoomCode(code), true, code);
  for (const code of ['', 'ABC', 'ABCDE', 'AB01', 'ABIO', 'A_-B', 'Exact_Room-9']) assert.equal(isManualRoomCode(code), false, code);
  assert.equal(resolveAppRoute(new URL('https://example.test/join?room=Exact_Room-9')).roomId, 'Exact_Room-9');
});

test('solo play (VOF-44) comes from /play or ?solo=1, has no room, and never outranks a phone or remote link', () => {
  assert.deepEqual(resolveAppRoute(new URL('https://vaxorfiction.com/play')), { mode: 'solo', roomId: '' });
  assert.deepEqual(resolveAppRoute(new URL('https://vaxorfiction.com/?solo=1')), { mode: 'solo', roomId: '' });
  assert.deepEqual(resolveAppRoute(new URL('https://vaxorfiction.com/play?room=bad%20room')), { mode: 'solo', roomId: '' }, 'a room in a solo address is ignored, not validated');
  assert.deepEqual(resolveAppRoute(new URL('https://vaxorfiction.com/?solo=1&vote=1&room=AB3D')), { mode: 'attendee', roomId: 'AB3D' });
  assert.deepEqual(resolveAppRoute(new URL('https://vaxorfiction.com/play?remote=1')), { mode: 'remote', roomId: '' });
  assert.equal(resolveAppRoute(new URL('https://vaxorfiction.com/?solo=0')).mode, 'host');
});
