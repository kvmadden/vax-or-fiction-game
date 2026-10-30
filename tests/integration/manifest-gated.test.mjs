import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

// MANIFEST (round 7). vite.config.ts used to set build.manifest true unconditionally, so every
// production build shipped dist/.vite/manifest.json (16 source module paths, src/screens/Admin.tsx
// included) for no runtime reason. That manifest is real and useful for
// remote-cue-isolation.test.mjs, which walks it to find the phone's actual reachable chunk set, so
// npm run check's build step now sets VOF_BUILD_MANIFEST=1 for exactly that one build
// (package.json scripts.check) and vite.config.ts gates `manifest` on it. This proves the other
// half: a plain `npm run build`, the one command anyone actually deploying this app runs, ships no
// manifest at all.
const { VOF_BUILD_MANIFEST: _unused, ...env } = process.env;

let output = '';
try {
  output = execFileSync('npm', ['run', 'build'], { cwd: process.cwd(), env, encoding: 'utf8', stdio: 'pipe' });
} catch (error) {
  const detail = `${error.stdout ?? ''}${error.stderr ?? ''}`;
  throw new Error(`a plain \`npm run build\` (no VOF_BUILD_MANIFEST) failed:\n${detail.slice(-3000)}`);
}

const manifestPath = path.resolve('dist/.vite/manifest.json');
assert.equal(fs.existsSync(manifestPath), false,
  `a plain \`npm run build\` must not produce ${manifestPath} (build.manifest must stay gated off VOF_BUILD_MANIFEST); build output tail:\n${output.slice(-1000)}`);

console.log('PASS a plain `npm run build` produced no dist/.vite/manifest.json');
