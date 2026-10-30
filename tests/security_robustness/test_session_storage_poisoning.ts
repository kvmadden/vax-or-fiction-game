import assert from 'node:assert/strict';
import test from 'node:test';

const storeMap = new Map<string, string>();
Object.defineProperty(globalThis, 'sessionStorage', {
  configurable: true,
  value: {
    getItem: (key: string) => storeMap.get(key) ?? null,
    setItem: (key: string, value: string) => { storeMap.set(key, value); },
    removeItem: (key: string) => { storeMap.delete(key); },
    clear: () => { storeMap.clear(); },
  },
});

const { useGameStore } = await import('../../src/store/game-store');
const persistence = useGameStore.persist.getOptions();

test('the configured persistence adapter returns null for malformed serialized state', async () => {
  const malformed = [
    '{"state": {',
    'CORRUPTED_HEX_BYTE_STREAM\x00ÿ',
    '',
    'undefined',
  ];
  for (const value of malformed) {
    storeMap.set('vof-game-session', value);
    assert.equal(await persistence.storage?.getItem('vof-game-session'), null, JSON.stringify(value));
  }
  console.log(`coverage: ${malformed.length} malformed serialized persistence fixtures`);
});

test('the real merge clamps indices and rejects malformed run, format, participant, and ballot fields', () => {
  const merge = persistence.merge!;
  const current = useGameStore.getState();
  const lastIndex = current.run.length - 1;

  assert.equal((merge({ slideIndex: -999 }, current) as any).slideIndex, -1);
  assert.equal((merge({ slideIndex: 999_999 }, current) as any).slideIndex, lastIndex);
  // Hold filtering intentionally copies the safe run; recovery promises its contents,
  // not the same mutable array identity.
  assert.deepEqual((merge({ run: null }, current) as any).run, current.run);
  assert.deepEqual((merge({ run: 'not-an-array' }, current) as any).run, current.run);
  assert.equal((merge({ formatId: 8888 }, current) as any).formatId, current.formatId);

  const restored = merge({
    seenDevices: {
      good: { nickname: 'Good', team: 'NAVY', joinedAt: 1, score: 1, answered: 1, correct: 1, streak: 1, bestStreak: 1, realityGap: 0 },
      corrupt: 'not-a-device',
    },
    pollVoters: {
      q1: {
        good: { choice: 'true', conviction: 'certain', team: 'NAVY' },
        corrupt: { choice: null, conviction: {} },
      },
    },
  }, current) as any;
  assert.deepEqual(Object.keys(restored.seenDevices), ['good']);
  assert.deepEqual(Object.keys(restored.pollVoters.q1), ['good']);
  console.log('coverage: 5 structural recovery controls plus malformed nested participant and ballot entries');
});

test('a parsed __proto__ key does not mutate Object.prototype during persistence merge', () => {
  const merge = persistence.merge!;
  const current = useGameStore.getState();
  const poisoned = JSON.parse('{"pollVotes":{"__proto__":{"polluted":true}}}');
  merge(poisoned, current);
  assert.equal((Object.prototype as { polluted?: unknown }).polluted, undefined);
});
