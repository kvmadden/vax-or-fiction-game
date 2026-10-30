import assert from 'node:assert/strict';
import test from 'node:test';
import { FONT_GATE_TIMEOUT_MS, settleFonts } from '../../src/screens/questions/use-fonts-ready.ts';

// STAGE-SPEC pass 4c-1b (warning item, font gate). `document.fonts.ready` settles once every
// already-requested weight has loaded, not once every weight a caller is about to measure with
// has loaded, so a font nothing has drawn with yet can still be missing right after `ready`
// resolves. `settleFonts` requests each font spec explicitly and races the whole thing against a
// timeout, so a font that never loads (a network failure, a font host down) cannot hang a caller
// forever. These tests stub a minimal `document.fonts` rather than pulling in a full DOM: only
// `.ready` and `.load()` are read.

function withStubDocument<T>(fonts: { ready?: Promise<unknown>; load: (spec: string) => Promise<unknown> }, run: () => Promise<T>): Promise<T> {
  const original = (globalThis as { document?: unknown }).document;
  (globalThis as { document?: unknown }).document = { fonts };
  return run().finally(() => {
    (globalThis as { document?: unknown }).document = original;
  });
}

test('settleFonts: resolves once every requested spec has loaded, well under the timeout', async () => {
  const requested: string[] = [];
  const fonts = {
    ready: Promise.resolve(),
    load: (spec: string) => { requested.push(spec); return Promise.resolve([]); },
  };
  await withStubDocument(fonts, async () => {
    const start = Date.now();
    await settleFonts(['600 44px "IBM Plex Sans"', '600 32px "IBM Plex Sans"'], 1500);
    assert.ok(Date.now() - start < 200, 'must not wait for the timeout when every spec settles quickly');
  });
  assert.deepEqual(requested, ['600 44px "IBM Plex Sans"', '600 32px "IBM Plex Sans"'], 'every spec must actually be requested with document.fonts.load, not merely awaited via .ready');
});

test('settleFonts: a spec whose own load() rejects does not stop the others from settling it', async () => {
  const fonts = {
    ready: Promise.resolve(),
    load: (spec: string) => (spec.includes('broken') ? Promise.reject(new Error('network')) : Promise.resolve([])),
  };
  await withStubDocument(fonts, async () => {
    // Must resolve, not reject and not hang, even though one spec's own load() rejects.
    await settleFonts(['600 44px broken-font', '600 32px good-font'], 1500);
  });
});

test('settleFonts: a font that never settles still resolves after the timeout, not before, not never', async () => {
  const fonts = {
    ready: new Promise<void>(() => {}), // never settles
    load: () => new Promise<unknown[]>(() => {}), // never settles
  };
  await withStubDocument(fonts, async () => {
    const start = Date.now();
    await settleFonts(['600 44px "IBM Plex Sans"'], 60);
    const elapsed = Date.now() - start;
    assert.ok(elapsed >= 55, `must wait out the timeout before giving up, waited ${elapsed}ms`);
    assert.ok(elapsed < 500, `must not wait dramatically past the timeout, waited ${elapsed}ms`);
  });
});

test('FONT_GATE_TIMEOUT_MS is pinned at about 1.5 seconds', () => {
  assert.equal(FONT_GATE_TIMEOUT_MS, 1500);
});

test('settleFonts: no document (SSR) resolves immediately with no error', async () => {
  const original = (globalThis as { document?: unknown }).document;
  delete (globalThis as { document?: unknown }).document;
  try {
    const start = Date.now();
    await settleFonts(['600 44px "IBM Plex Sans"']);
    assert.ok(Date.now() - start < 50);
  } finally {
    (globalThis as { document?: unknown }).document = original;
  }
});
