// The twelve walk-in lyric cues (WALKIN_LINE_STARTS) are where each line lights. The scroll already leads the cue by
// 0.3 s, so a cue belongs on the sung onset itself. tests/fixtures/walkin-vocal-onsets.json holds those onsets, measured
// on the real walkin.mp3 by separating the vocal (demucs htdemucs) and forcing the approved lyric onto it (MMS_FA),
// with the stem's own energy onset as a second reading (tools in docs/audio/lyric-cue-check/). A cue that drifts from
// the singing by more than 80 ms fails here, so a re-cut of the walk-in has to re-measure before it ships.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { WALKIN_LINE_STARTS, WALKIN_LOOP_LINES } from '../../src/data/walkin-lyrics';

const root = dirname(fileURLToPath(import.meta.url));
const measured = JSON.parse(readFileSync(join(root, '../fixtures/walkin-vocal-onsets.json'), 'utf8')) as {
  lines: Array<{ line: number; text: string; alignedStart: number; energyOnset: number }>;
};
const TOLERANCE_S = 0.08;

test('the measurement covers the same twelve lines the scroll shows', () => {
  assert.equal(measured.lines.length, WALKIN_LINE_STARTS.length);
  measured.lines.forEach((entry, index) => assert.equal(entry.text, WALKIN_LOOP_LINES[index], `line ${entry.line}`));
});

test('the two onset readings agree, so the measurement is not one method\'s artifact', () => {
  for (const entry of measured.lines) {
    assert.ok(Math.abs(entry.alignedStart - entry.energyOnset) <= 0.08, `line ${entry.line}: aligned ${entry.alignedStart} against energy ${entry.energyOnset}`);
  }
});

test('every walk-in cue sits within 80 ms of the sung onset of its line', () => {
  const off = measured.lines
    .map((entry) => ({ line: entry.line, cue: WALKIN_LINE_STARTS[entry.line - 1]!, onset: entry.alignedStart, offMs: Math.round((WALKIN_LINE_STARTS[entry.line - 1]! - entry.alignedStart) * 1000) }))
    .filter((row) => Math.abs(row.offMs) > TOLERANCE_S * 1000);
  assert.deepEqual(off, [], 'cue minus onset, in ms, for each line that is off the singing');
});
