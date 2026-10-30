import assert from 'node:assert/strict';
import test from 'node:test';
import { readPhoneReaction, readShowdownPick, writePhoneReaction, writeShowdownPick } from '../../src/phone/phone-memory';

test('phone memory round-trips a reaction and a showdown pick in sessionStorage', () => {
  const memory = new Map<string, string>();
  const previous = (globalThis as { sessionStorage?: Storage }).sessionStorage;
  (globalThis as { sessionStorage: Storage }).sessionStorage = {
    getItem: (key) => memory.get(key) ?? null,
    setItem: (key, value) => { memory.set(key, String(value)); },
    removeItem: (key) => { memory.delete(key); },
    clear: () => { memory.clear(); },
    key: () => null,
    get length() { return memory.size; },
  } as Storage;
  try {
    writePhoneReaction('q-1:0', 'knew-it');
    writeShowdownPick('run:showdown', 'F-1');
    assert.equal(readPhoneReaction('q-1:0'), 'knew-it');
    assert.equal(readShowdownPick('run:showdown'), 'F-1');
    assert.equal(readPhoneReaction(''), null);
    assert.equal(readShowdownPick(null), null);
  } finally {
    if (previous === undefined) delete (globalThis as { sessionStorage?: Storage }).sessionStorage;
    else (globalThis as { sessionStorage: Storage }).sessionStorage = previous;
  }
});
