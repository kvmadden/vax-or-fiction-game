import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();

const REQUIRED = [
  'walkin', 'title-lobby', 'menu-soft', 'menu-soft-loop',
  'deliberate', 'deliberation-loop', 'fork-choice', 'fork-choice-loop',
  'showdown', 'showdown-loop', 'countdown', 'countdown-bed',
  'closing', 'closing-loop', 'closing-tag', 'reveal', 'reveal-a', 'reveal-b',
  'ui-tap', 'answer-lock', 'timer-pulse', 'five-second-warning',
  'reaction-wait-really', 'reaction-knew-it', 'reaction-we-do-this',
  'transition-1', 'transition-2', 'transition-3', 'myth-busted', 'streak-lift',
];

test('the public audio manifest contains the companion pack roles with matching local identities', async () => {
  const manifest = JSON.parse(await readFile(path.join(root, 'public/assets/audio/manifest.json'), 'utf8'));
  const tracks = manifest.decks['vax-or-fiction'];

  assert.deepEqual(Object.keys(tracks).sort(), [...REQUIRED].sort());
  assert.equal(tracks.walkin.vocals, true, 'lyrics stay on title/lobby walk-in');
  assert.equal(tracks['title-lobby'].vocals, true);
  assert.equal(tracks.deliberate.vocals, false);
  assert.equal(tracks.reveal.neutralReveal, true, 'reveal cue must not encode a true/false outcome');
  assert.equal(manifest.selectedSong.id, 'DHLgluGM6ZyqBd4KL2Er'); // Smile · Take 3
  assert.deepEqual(manifest.policy.allowedVocalRoles, ['walkin', 'title-lobby']);
  assert.equal(tracks.walkin.sha256, '1aa368aee215d1397b2d370b385003b886bdb3b6a97611ff5262001488d8ab71');
  assert.equal(tracks.walkin.sha256, tracks['title-lobby'].sha256);

  for (const [role, track] of Object.entries(tracks) as Array<[string, { path: string; bytes: number; sha256: string }]>) {
    const file = path.join(root, 'public', track.path);
    const bytes = await readFile(file);
    const metadata = await stat(file);
    assert.equal(metadata.size, track.bytes, `${role} byte count must match the active manifest`);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), track.sha256, `${role} hash must match the active manifest`);
  }
});
