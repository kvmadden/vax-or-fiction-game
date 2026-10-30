import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { manifestReachableFiles } from './manifest-reachable-files.mjs';
import { PRESENTER_CUE_LEAK_NEEDLES } from '../../src/phone/presenter-cue-map.ts';

const dist = path.resolve('dist');
assert.ok(fs.existsSync(dist), 'run this after `npm run build` so dist/ exists');

const assets = path.join(dist, 'assets');
const files = fs.readdirSync(assets).filter((name) => name.endsWith('.js'));
assert.ok(files.length > 0, 'production build must emit JS assets');

// TW-7. NIT-11 (round 3) replaced two dead literal-attribute markers with real substrings
// ('phone-join', 'phone-vote-container', 'phone-reveal'), fixing a classifier that always read
// zero audience files. But content-sniffing for those three strings is still a proxy for "does the
// phone load this file", and phones also load several chunks that carry none of the three: the
// entry chunk everyone loads, and shared chunks PhoneSuite.tsx imports (screen-fade, PhoneBackdrop,
// phone-live-copy) that are generic utility/chrome code, not the join/vote/reveal screens
// themselves. A cue leaked into any of those would ship in `isAudience: false` and never be
// compared against PRESENTER_CUE_LEAK_NEEDLES at all.
//
// vite.config.ts sets build.manifest: true when VOF_BUILD_MANIFEST=1 is set for the build, so
// dist/.vite/manifest.json records the real
// import graph Vite already computed: each entry's own built file plus its static `imports` (other
// entries are `dynamicImports`: OTHER routes reached only by a different code path than the one
// this run took, which the phone visiting /join never triggers). Walking PhoneSuite.tsx's own
// static imports, starting from the root entry every visitor loads regardless of route, gives the
// exact file set a phone loads, with no string-matching guesswork.
const manifestPath = path.join(dist, '.vite', 'manifest.json');
assert.ok(fs.existsSync(manifestPath), 'run this after `VOF_BUILD_MANIFEST=1 npm run build` so dist/.vite/manifest.json exists');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

assert.ok(manifest['src/phone/PhoneSuite.tsx'], 'the manifest must have an entry for src/phone/PhoneSuite.tsx (module id changed?)');
// The entry's own always-loaded shell (index.html -> main -> App.tsx's static deps). Deliberately
// never follows dynamicImports here: those are App.tsx's OTHER lazy routes (PresentationSuite,
// RemoteSuite, SoloSuite, Admin), each reached only by a URL branch a phone visiting /join never
// takes, so walking them from the entry would pull every route's chunks into "phone-reachable".
const entryFiles = manifestReachableFiles(manifest, ['index.html']);
// PhoneSuite.tsx is itself one of the entry's dynamicImports (that edge is deliberately not walked
// above), so it is seeded directly as its own start point, with followDynamic: true. That last part
// is the fix: PhoneSuite's own subtree can make further lazy imports of its OWN (a per-screen
// React.lazy(), say), and those must count as phone-reachable too, the same class of gap NIT-11
// (round 3) fixed for content-sniffing. skipKeys blocks the loop back to the entry: every dynamic
// chunk Vite builds (PhoneSuite included) lists 'index.html' in its OWN static imports, so without
// this a followDynamic walk from PhoneSuite would loop back through the entry and re-expand every
// SIBLING route (RemoteSuite among them, confirmed by running this against a real build). See
// tests/unit/manifest-reachable-files.test.mjs for the synthetic-manifest proof.
const phoneOwnFiles = manifestReachableFiles(manifest, ['src/phone/PhoneSuite.tsx'], { followDynamic: true, skipKeys: ['index.html'] });
const phoneFiles = new Set([...entryFiles, ...phoneOwnFiles]);
// Prove the classifier itself is not the reason this passes: it must actually resolve to more than
// just the entry chunk (PhoneSuite's own chunk plus at least one shared chunk it statically
// imports), not silently collapse to nothing because the manifest shape drifted.
assert.ok(phoneFiles.size >= 3, `expected the phone's reachable file set to include the entry, PhoneSuite's own chunk and at least one shared chunk; got ${[...phoneFiles].join(', ')}`);

const cueFiles = [];
const phoneHits = [];
for (const name of files) {
  const text = fs.readFileSync(path.join(assets, name), 'utf8');
  const needles = PRESENTER_CUE_LEAK_NEEDLES.filter((needle) => text.includes(needle));
  if (needles.length) cueFiles.push(name);
  if (phoneFiles.has(name) && needles.length) phoneHits.push({ name, needles });
}

const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
for (const needle of PRESENTER_CUE_LEAK_NEEDLES) {
  assert.equal(html.includes(needle), false, `index.html must not inline ${needle}`);
}

assert.equal(
  phoneHits.length,
  0,
  `a phone-reachable bundle leaked presenter keys: ${JSON.stringify(phoneHits)}`,
);
assert.ok(cueFiles.length >= 1, 'presenter cue strings must ship in a remote-only chunk');
console.log(`PASS presenter cues confined to ${cueFiles.join(', ')}; ${phoneFiles.size} phone-reachable file(s) scanned (${[...phoneFiles].join(', ')}), 0 leaked a presenter cue`);
