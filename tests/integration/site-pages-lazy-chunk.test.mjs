// VOF-45: the About/Disclaimer/Privacy/Terms/Credits pages must each ship as their own
// lazy chunk, never inline in the game's main entry bundle. Same manifest approach
// remote-cue-isolation.test.mjs already uses (dist/.vite/manifest.json, built with
// VOF_BUILD_MANIFEST=1, which npm run check's build step already sets).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { manifestReachableFiles } from './manifest-reachable-files.mjs';

const dist = path.resolve('dist');
assert.ok(fs.existsSync(dist), 'run this after `npm run build` so dist/ exists');

const manifestPath = path.join(dist, '.vite', 'manifest.json');
assert.ok(fs.existsSync(manifestPath), 'run this after `VOF_BUILD_MANIFEST=1 npm run build` so dist/.vite/manifest.json exists');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

const SITE_PAGE_MODULES = [
  'src/screens/site/About.tsx',
  'src/screens/site/Disclaimer.tsx',
  'src/screens/site/Privacy.tsx',
  'src/screens/site/Terms.tsx',
  'src/screens/site/Credits.tsx',
];

// The entry's always-loaded shell: index.html -> main.tsx -> App.tsx's static imports. This
// deliberately never follows dynamicImports, the same reasoning remote-cue-isolation.test.mjs
// documents: those are App.tsx's OTHER lazy routes, each reached only by a URL branch a given
// visit never takes.
const entryFiles = manifestReachableFiles(manifest, ['index.html']);

for (const moduleId of SITE_PAGE_MODULES) {
  const entry = manifest[moduleId];
  assert.ok(entry, `the manifest must have an entry for ${moduleId} (module id changed? file moved?)`);
  const basename = path.basename(entry.file);
  assert.ok(!entryFiles.has(basename), `${moduleId}'s built file (${basename}) leaked into the entry's static, always-loaded bundle. It must stay a dynamic import so the game bundle does not grow for it`);
}

// Control: prove this check can actually catch a page that leaked into the static entry bundle,
// not just that these five happen to pass. index.html's own built file is the one thing every
// visitor always loads, so the same "must be excluded from entryFiles" assertion applied to it
// (inverted: it MUST be present) has to hold, or entryFiles is not really seeing the static bundle.
assert.ok(manifest['index.html']?.file, 'fixture assumption: the manifest indexes index.html');
const entryBasename = path.basename(manifest['index.html'].file);
assert.ok(entryFiles.has(entryBasename), `control: the entry's own bundle (${entryBasename}) is genuinely part of entryFiles, so this check can tell "in the static bundle" from "not" apart`);
for (const moduleId of SITE_PAGE_MODULES) {
  assert.notEqual(path.basename(manifest[moduleId].file), entryBasename, `${moduleId} must not literally BE the entry bundle`);
}

console.log(`PASS all ${SITE_PAGE_MODULES.length} site pages are their own lazy chunks, excluded from the static entry bundle`);
