import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  presentationVenueStorageKey,
  readPresentationVenue,
  writePresentationVenue,
} from '../../src/presentation/venue-preference';

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
  };
}

test('presentation venue restores an In the room choice for the same room', () => {
  const storage = memoryStorage();

  assert.equal(readPresentationVenue('room-1', storage), 'teams');
  writePresentationVenue('room-1', 'room', storage);

  assert.equal(readPresentationVenue('room-1', storage), 'room');
  assert.equal(readPresentationVenue('room-2', storage), 'teams');
});

test('presentation venue ignores invalid persisted values and keeps the Teams default', () => {
  const storage = memoryStorage();
  storage.setItem(presentationVenueStorageKey('room-1'), 'not-a-venue');

  assert.equal(readPresentationVenue('room-1', storage), 'teams');
});

test('the host suite keeps the persisted venue on first paint instead of returning null', () => {
  const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../src/presentation/PresentationSuite.tsx'), 'utf8');
  assert.doesNotMatch(src, /if \(!venueIsSynchronized\) return null/);
  assert.match(src, /Persisted venue is the first-paint source of truth/);
});
