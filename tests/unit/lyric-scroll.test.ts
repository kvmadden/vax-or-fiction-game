import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getActiveLyricIndex,
  LYRIC_ANCHOR,
  LYRIC_LEAD_SECONDS,
  LYRIC_LERP,
  lyricLineAt,
  lyricScrollStep,
  lyricScrollTarget,
  lyricTier,
  validateLyricData,
} from '../../src/ui/lyric-scroll';
import { WALKIN_LINE_STARTS, WALKIN_LYRIC_DATA, WALKIN_REST_INDEX, walkinLineIndex } from '../../src/data/walkin-lyrics';

const HASH = 'a'.repeat(64);
const lyrics = {
  audioSha256: HASH,
  lines: [
    { time: 1, endTime: 3, text: 'Synthetic first line' },
    { time: 5, text: 'Vax or Fiction' },
    { time: 9, endTime: 11, text: '<script>synthetic text</script>' },
  ],
};
const copy = () => structuredClone(lyrics);

test('validation accepts exact-duration cues and retains literal title and markup-like text', () => {
  assert.equal(validateLyricData(lyrics, 11), true);
  assert.equal(lyrics.lines[1]!.text, 'Vax or Fiction');
});

test('validation rejects malformed timing, identity and text rather than coercing it', () => {
  const invalid: unknown[] = [null, {}, { ...copy(), audioSha256: 'take-1' }, { ...copy(), lines: [] }];
  for (const change of [
    (d: typeof lyrics) => { d.lines[0]!.time = -1; },
    (d: typeof lyrics) => { d.lines[0]!.time = NaN; },
    (d: typeof lyrics) => { (d.lines[0] as { time: unknown }).time = '1'; },
    (d: typeof lyrics) => { d.lines[0]!.endTime = 0.5; },
    (d: typeof lyrics) => { d.lines[0]!.endTime = Infinity; },
    (d: typeof lyrics) => { d.lines[1]!.time = 1; },
    (d: typeof lyrics) => { d.lines[1]!.time = 0; },
    (d: typeof lyrics) => { (d.lines[1] as { text: unknown }).text = 12; },
    (d: typeof lyrics) => { d.lines[1]!.text = '  '; },
  ]) {
    const data = copy();
    change(data);
    invalid.push(data);
  }
  for (const data of invalid) assert.equal(validateLyricData(data, 12), false);
  assert.equal(validateLyricData(lyrics, 10), false, 'last end cannot exceed audio duration');
  assert.equal(validateLyricData(lyrics, NaN), false);
});

test('active lyric follows actual cue boundaries, gaps, backward seek and loop wrap', () => {
  for (const [time, expected] of [[0, -1], [0.9, -1], [1, 0], [2.99, 0], [3, -1], [4.9, -1], [5, 1], [8.9, 1], [9, 2], [11, -1], [1.5, 0], [0, -1], [NaN, -1]] as const) {
    assert.equal(getActiveLyricIndex(lyrics.lines, time), expected, `media time ${time}`);
  }
});

test('Smile walk-in lyric packet validates against the approved loop', () => {
  assert.equal(validateLyricData(WALKIN_LYRIC_DATA, 60), true);
  assert.equal(validateLyricData(WALKIN_LYRIC_DATA, 81), true);
  assert.equal(getActiveLyricIndex(WALKIN_LYRIC_DATA.lines, 0), -1);
  assert.equal(getActiveLyricIndex(WALKIN_LYRIC_DATA.lines, WALKIN_LINE_STARTS[0]), 0);
  assert.equal(getActiveLyricIndex(WALKIN_LYRIC_DATA.lines, WALKIN_LINE_STARTS[11]), 11);
});

test('a walk-in line lights 0.3 s ahead of its sung onset, as the DJ KMad scroll leads it', () => {
  const track = { audioSha256: WALKIN_LYRIC_DATA.audioSha256, lineCount: WALKIN_LYRIC_DATA.lines.length, restIndex: WALKIN_REST_INDEX };
  const at = (currentTime: number, overrides: Partial<Parameters<typeof lyricLineAt>[0]> = {}) => lyricLineAt(
    { role: 'walkin', trackSha256: track.audioSha256, currentTime, duration: 60.024, paused: false, status: 'playing', muted: false, ...overrides },
    track,
    true,
    walkinLineIndex,
  ).index;
  for (const [index, onset] of WALKIN_LINE_STARTS.entries()) {
    const previous = index === 0 ? WALKIN_LINE_STARTS.length - 1 : index - 1;
    assert.equal(at(onset - LYRIC_LEAD_SECONDS - 0.01), previous, `line ${index + 1} is not lit before its lead`);
    assert.equal(at(onset - LYRIC_LEAD_SECONDS + 0.001), index, `line ${index + 1} lights 0.3 s ahead of its onset`);
  }
  // Past 59.7 s the lead reaches into the next loop's intro hold, which is the last line again.
  assert.equal(at(59.9), WALKIN_LINE_STARTS.length - 1);
  // Nothing is lit for another track, another role, or a bed parked at 0 that has not started.
  assert.equal(at(20, { role: 'menu-soft' }), -1);
  assert.equal(at(20, { trackSha256: 'b'.repeat(64) }), -1);
  assert.equal(lyricLineAt({ role: 'walkin', trackSha256: track.audioSha256, currentTime: 0, duration: 60.024, paused: true, status: 'paused', muted: false }, track, false, walkinLineIndex).index, -1);
});

test('while sound is off the pane rests on the chorus line, and follows the song again once it is on (VOF-87)', () => {
  const track = { audioSha256: WALKIN_LYRIC_DATA.audioSha256, lineCount: WALKIN_LYRIC_DATA.lines.length, restIndex: WALKIN_REST_INDEX };
  const playback = { role: 'walkin', trackSha256: track.audioSha256, currentTime: 30, duration: 60.024, paused: false, status: 'playing', muted: true };
  assert.equal(WALKIN_REST_INDEX, 0, "the chorus's first line, as the reduced-motion view shows");
  for (const currentTime of [0, 8, 13, 30, 55, 59.9]) {
    assert.equal(lyricLineAt({ ...playback, currentTime }, track, true, walkinLineIndex).index, 0, `muted at ${currentTime} s`);
  }
  // A Teams lobby before sound was ever unlocked has no bed at all, and still rests on the line.
  assert.equal(lyricLineAt({ ...playback, role: null, trackSha256: null, status: 'idle', paused: true, currentTime: 0 }, track, false, walkinLineIndex).index, 0);
  assert.equal(lyricLineAt({ ...playback, muted: false }, track, true, walkinLineIndex).index, walkinLineIndex(30.3), 'sound on: the song\'s own line');
});

test('the four DJ KMad tiers, and idle while no line is lit', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6].map((index) => lyricTier(index, 3)), ['far', 'near-2', 'near', 'active', 'near', 'near-2', 'far']);
  assert.equal(lyricTier(2, -1), 'idle');
});

test('the lit line settles 35% down the pane, and the first and last lines rest at the ends', () => {
  const pane = { height: 140, scrollHeight: 600 };
  assert.equal(lyricScrollTarget({ offsetTop: 300, height: 40 }, pane), 300 - 140 * LYRIC_ANCHOR + 20);
  assert.equal(lyricScrollTarget({ offsetTop: 0, height: 40 }, pane), 0, 'the first line cannot scroll above the top');
  assert.equal(lyricScrollTarget({ offsetTop: 580, height: 40 }, pane), 460, 'the last line rests at the bottom');
});

test('each frame eases 7% of the way and snaps within half a pixel', () => {
  assert.deepEqual(lyricScrollStep(0, 100), { next: 100 * LYRIC_LERP, settled: false });
  assert.deepEqual(lyricScrollStep(99.7, 100), { next: 100, settled: true });
});

test('the ease settles when it keeps its own fraction, and stalls if it reads a rounded scroll offset back', () => {
  const run = (readBack: (value: number) => number) => {
    let position = 0;
    for (let frame = 1; frame <= 600; frame += 1) {
      const move = lyricScrollStep(position, 100);
      position = readBack(move.next);
      if (move.settled) return frame;
    }
    return null;
  };
  assert.ok((run((value) => value) ?? Infinity) < 120, 'its own fraction settles within two seconds');
  // Browsers keep an element's scroll offset in whole pixels. A read-back value stops a few pixels short for good.
  assert.equal(run((value) => Math.round(value)), null, 'reading the rounded offset back never settles');
});
