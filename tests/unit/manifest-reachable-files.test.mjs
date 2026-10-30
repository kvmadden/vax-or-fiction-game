import assert from 'node:assert/strict';
import test from 'node:test';
import { manifestReachableFiles } from '../integration/manifest-reachable-files.mjs';

// Mirrors the real dist/.vite/manifest.json shape (confirmed against a real `npm run build`, not
// guessed): 'index.html' is the one entry and directly lists every lazy ROUTE (PhoneSuite,
// PresentationSuite, and so on) as its own dynamicImports, with no separate chunk for App.tsx (its
// code is inlined into the entry). Crucially, EVERY dynamic-entry chunk Vite builds also lists
// 'index.html' back in its OWN static `imports` (so the browser loads the entry's JS/CSS before the
// lazy chunk runs), which is what makes a naive followDynamic walk from a lazy route loop back
// through the entry and pull in every sibling route too. PhoneSuite additionally statically imports
// a shared chunk and lazily imports its own per-screen chunk, standing in for a future React.lazy()
// inside the phone flow (there is none today, so remote-cue-isolation.test.mjs has nothing real to
// plant a leak into for this proof).
function fixtureManifest() {
  return {
    'index.html': {
      file: 'index-ABC.js',
      isEntry: true,
      dynamicImports: ['src/phone/PhoneSuite.tsx', 'src/phone/RemoteSuite.tsx', 'src/presentation/PresentationSuite.tsx'],
    },
    'src/phone/PhoneSuite.tsx': {
      file: 'PhoneSuite-JKL.js',
      isDynamicEntry: true,
      imports: ['index.html', 'src/phone/shared-chunk.ts'],
      dynamicImports: ['src/phone/screens/LazyPhoneScreen.tsx'],
    },
    'src/phone/shared-chunk.ts': { file: 'shared-chunk-MNO.js', imports: [] },
    'src/phone/screens/LazyPhoneScreen.tsx': { file: 'LazyPhoneScreen-PQR.js', imports: [] },
    'src/phone/RemoteSuite.tsx': {
      file: 'RemoteSuite-VWX.js',
      isDynamicEntry: true,
      imports: ['index.html', 'src/phone/presenter-only-chunk.ts'],
    },
    'src/phone/presenter-only-chunk.ts': { file: 'presenter-only-chunk-YZ1.js', imports: [] },
    'src/presentation/PresentationSuite.tsx': {
      file: 'PresentationSuite-STU.js',
      isDynamicEntry: true,
      imports: ['index.html'],
    },
  };
}

test('the entry traversal reaches only the always-loaded shell, no lazy route', () => {
  const files = manifestReachableFiles(fixtureManifest(), ['index.html']);
  assert.deepEqual([...files].sort(), ['index-ABC.js']);
  assert.equal(files.has('PhoneSuite-JKL.js'), false, 'a lazy route is not the always-loaded shell');
  assert.equal(files.has('RemoteSuite-VWX.js'), false, 'a sibling lazy route must stay excluded');
  assert.equal(files.has('PresentationSuite-STU.js'), false, 'a sibling lazy route must stay excluded');
});

test('NIT: seeding PhoneSuite.tsx without followDynamic misses its own nested lazy import (the bug)', () => {
  // This is the exact gap the NIT named: remote-cue-isolation.test.mjs used to seed PhoneSuite.tsx
  // as a start point but never walk dynamicImports at all, so a lazy import PhoneSuite made of its
  // OWN would silently not count as phone-reachable, and a leak inside it would never be checked.
  const files = manifestReachableFiles(fixtureManifest(), ['src/phone/PhoneSuite.tsx']);
  assert.equal(files.has('PhoneSuite-JKL.js'), true, 'PhoneSuite\'s own chunk is always reachable from itself');
  assert.equal(files.has('shared-chunk-MNO.js'), true, 'a static import is always followed');
  assert.equal(files.has('LazyPhoneScreen-PQR.js'), false,
    'without followDynamic, PhoneSuite\'s own nested lazy screen is missed (this is the bug NIT-round-7 fixes)');
});

test('a naive followDynamic from PhoneSuite.tsx loops back through the entry and leaks every sibling route', () => {
  // This is the regression the fix's skipKeys avoids: PhoneSuite.tsx's own `imports` names
  // 'index.html' (every dynamic chunk Vite builds does), so a plain followDynamic walk seeded there
  // reaches the entry again and, since followDynamic is still on, re-expands the entry's
  // dynamicImports too, pulling RemoteSuite's presenter-only chunk in as "phone-reachable". Running
  // the pre-skipKeys version of this fix against a real build reproduced exactly this: RemoteSuite's
  // own chunk (which legitimately carries the presenter cue strings) got flagged as phone-reachable.
  const files = manifestReachableFiles(fixtureManifest(), ['src/phone/PhoneSuite.tsx'], { followDynamic: true });
  assert.equal(files.has('LazyPhoneScreen-PQR.js'), true, 'the real fix target is still reached');
  assert.equal(files.has('RemoteSuite-VWX.js'), true, 'demonstrates the loop-back: a sibling route leaks in too');
  assert.equal(files.has('presenter-only-chunk-YZ1.js'), true, 'and everything that sibling route reaches, right along with it');
});

test('the fix: skipKeys breaks the loop back to the entry, so only PhoneSuite\'s own subtree is reached', () => {
  const files = manifestReachableFiles(fixtureManifest(), ['src/phone/PhoneSuite.tsx'], { followDynamic: true, skipKeys: ['index.html'] });
  assert.equal(files.has('PhoneSuite-JKL.js'), true);
  assert.equal(files.has('shared-chunk-MNO.js'), true);
  assert.equal(files.has('LazyPhoneScreen-PQR.js'), true,
    'a lazy import PhoneSuite makes of its own must still count as phone-reachable');
  assert.equal(files.has('RemoteSuite-VWX.js'), false, 'a sibling route must not leak in through the entry back-reference');
  assert.equal(files.has('presenter-only-chunk-YZ1.js'), false, 'nor anything only that sibling route reaches');
  assert.equal(files.has('PresentationSuite-STU.js'), false, 'nor any other sibling route');
});

test('remote-cue-isolation\'s own union (entry + PhoneSuite with followDynamic and skipKeys) matches what it actually scans', () => {
  const manifest = fixtureManifest();
  const entryFiles = manifestReachableFiles(manifest, ['index.html']);
  const phoneOwnFiles = manifestReachableFiles(manifest, ['src/phone/PhoneSuite.tsx'], { followDynamic: true, skipKeys: ['index.html'] });
  const phoneFiles = new Set([...entryFiles, ...phoneOwnFiles]);
  assert.deepEqual([...phoneFiles].sort(), [
    'LazyPhoneScreen-PQR.js', 'PhoneSuite-JKL.js', 'index-ABC.js', 'shared-chunk-MNO.js',
  ].sort());
  assert.equal(phoneFiles.has('RemoteSuite-VWX.js'), false, 'the presenter-only route never enters the union');
  assert.equal(phoneFiles.has('presenter-only-chunk-YZ1.js'), false, 'nor anything only it reaches');
});
