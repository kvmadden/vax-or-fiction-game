// The admin archive must never ship an admin email address in the client bundle: the database checks a fixed
// auth user id instead (supabase/migrations/20260927160000_vof_recap_privacy_lockdown.sql). This scans the built JS.
//
// Run this after `npm run build` (or `VOF_BUILD_MANIFEST=1 npm run build`, as check's own build
// step already does), matching tests/integration/remote-cue-isolation.test.mjs and
// manifest-gated.test.mjs, which read the same already-built dist/ rather than building their own
// copy.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const dist = path.resolve('dist');
assert.ok(fs.existsSync(dist), 'run this after `npm run build` so dist/ exists');

const assets = path.join(dist, 'assets');
const files = fs.readdirSync(assets).filter((name) => name.endsWith('.js'));
assert.ok(files.length > 0, 'production build must emit JS assets');

const EMAIL_LIKE = /[a-z0-9._%+-]+@[a-z0-9.-]*gmail\.com/gi;

const offenders = [];
for (const file of files) {
  const contents = fs.readFileSync(path.join(assets, file), 'utf8');
  const matches = contents.match(EMAIL_LIKE);
  if (matches) offenders.push({ file, matches: [...new Set(matches)] });
}

assert.deepEqual(
  offenders,
  [],
  `no built JS asset may carry a gmail address (admin identity lives only in the migration SQL, never the client bundle): ${JSON.stringify(offenders)}`,
);

console.log(`PASS no gmail address in any of ${files.length} built JS assets`);
