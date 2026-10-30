// VOF-43: no semicolons and no em-dashes in anything the game shows.
import test from 'node:test';
import assert from 'node:assert/strict';
import { BUNDLED_DECKS } from '../../src/data/decks/index.ts';
import { findBannedCopy } from '../../scripts/natural-copy.mjs';
import { SOLO_DECKS } from '../../src/data/decks/topics/index.ts';

test('no bundled deck shows a semicolon or an em-dash (VOF-43)', () => {
  let strings = 0;
  const count = (value: unknown): void => {
    if (typeof value === 'string') strings += 1;
    else if (Array.isArray(value)) value.forEach(count);
    else if (value && typeof value === 'object') Object.values(value).forEach(count);
  };
  for (const deck of BUNDLED_DECKS) count(deck);
  assert.ok(strings > 900, `the scan must see the deck text, it saw ${strings} strings`);
  const hits = BUNDLED_DECKS.flatMap((deck) => findBannedCopy(deck, deck.id));
  assert.deepEqual(hits.map((hit) => `${hit.path}: ${hit.text}`), []);
});

const allStrings = (value: unknown, out: string[] = []): string[] => {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) value.forEach((item) => allStrings(item, out));
  else if (value && typeof value === 'object') Object.values(value).forEach((item) => allStrings(item, out));
  return out;
};

test('no solo topic deck shows a semicolon or an em-dash (VOF-43, VOF-44)', async () => {
  const decks = await Promise.all(Object.values(SOLO_DECKS).map((load) => load()));
  assert.equal(decks.length, 13, 'every deck solo draws on loads');
  const strings = decks.flatMap((deck) => allStrings(deck)).length;
  assert.ok(strings > 3000, `the scan must see the topic text, it saw ${strings} strings`);
  const hits = decks.flatMap((deck) => findBannedCopy(deck, deck.id));
  assert.deepEqual(hits.map((hit) => `${hit.path}: ${hit.text}`), []);
});

