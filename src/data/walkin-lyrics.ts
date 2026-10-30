/**
 * Approved AABB lyric master. Byte-for-byte the `approvedLyrics` block in
 * src/review/music-auditions.json (from lyrics-aabb-approved-02.txt).
 * Do not invent or rewrite these lines. A unit test pins them to that packet.
 *
 * Smile Take 3 (the 60s walk-in the room hears) is Chorus / Verse / Chorus.
 * The sung verse is V1 couplet + V2 couplet, then the chorus returns.
 */

export const WALKIN_VERSE_1 = [
  "You've heard the rumors, had your doubts.",
  "Now's the time to hash them out.",
  "You've got a hunch, so make your play.",
  "Check the guidance, what's it say?",
] as const;

export const WALKIN_VERSE_2 = [
  "Bring what you know, then test your view.",
  "We get sharper when we do.",
  "Every answer helps us learn.",
  "Use it well when you return.",
] as const;

export const WALKIN_CHORUS = [
  "Question's up, now take your shot.",
  "Make your call with what you've got.",
  "What's your best prediction?",
  'Vax or Fiction?',
] as const;

/** Chorus, sung verse couplets, chorus — 60s Smile shape, approved words only. */
export const WALKIN_LOOP_LINES: readonly string[] = Object.freeze([
  ...WALKIN_CHORUS,
  WALKIN_VERSE_1[0],
  WALKIN_VERSE_1[1],
  WALKIN_VERSE_2[0],
  WALKIN_VERSE_2[1],
  ...WALKIN_CHORUS,
]);

/**
 * Vocal onsets on Smile Take 3 (`walkin.mp3` / `title-lobby.mp3`), seconds.
 * Intro (~0 to 8.5 s) holds the last line so the first sung word is not early.
 *
 * Measured, not judged by eye: the vocal was separated from the mix (demucs htdemucs) and each line's first word was
 * forced-aligned on it (MMS_FA), then checked against the stem's own energy onset. Lines 7 and 8 were already within
 * 80 ms of the singing and keep their values. The rest were 92 to 723 ms off and moved to the aligned onset. The
 * scroll leads each cue by 0.3 s itself, so a cue is the onset and nothing earlier. Readings and tools:
 * tests/fixtures/walkin-vocal-onsets.json, docs/audio/lyric-cue-check/, tests/unit/walkin-cues-on-the-singing.test.ts.
 */
export const WALKIN_LINE_STARTS = [
  8.54, 12.87, 17.15, 20.35,
  26.01, 30.53, 34.5, 37.1,
  42.84, 47.16, 51.46, 54.64,
] as const;

export const WALKIN_LOOP_SECONDS = 60;

/** Smile · Take 3 bytes — must match public/assets/audio/manifest.json walkin.sha256. */
export const WALKIN_AUDIO_SHA256 =
  '1aa368aee215d1397b2d370b385003b886bdb3b6a97611ff5262001488d8ab71' as const;

/** Cue packet for the djkmad-style lyric scroll (identity-checked against the playing bed). */
export const WALKIN_LYRIC_DATA = Object.freeze({
  audioSha256: WALKIN_AUDIO_SHA256,
  lines: Object.freeze(
    WALKIN_LINE_STARTS.map((time, index) => ({
      time,
      text: WALKIN_LOOP_LINES[index]!,
    })),
  ),
});

/** @deprecated Even 5s grid; Smile does not land on it. Kept for older callers. */
export const WALKIN_LINE_MS = 5_000;

/**
 * Map Smile `currentTime` onto the approved loop using sung cue times.
 * `loopSeconds` is the media duration for wrap only — never a stretch factor.
 */
export function walkinLineIndex(
  elapsedSeconds: number,
  lineCount = WALKIN_LOOP_LINES.length,
  loopSeconds?: number,
): number {
  const cues: readonly number[] = WALKIN_LINE_STARTS;
  const first = cues[0];
  if (first === undefined) return 0;
  const count = lineCount > 0 ? Math.min(lineCount, cues.length) : cues.length;
  if (count <= 0) return 0;
  const period =
    typeof loopSeconds === 'number' && Number.isFinite(loopSeconds) && loopSeconds > 0
      ? loopSeconds
      : WALKIN_LOOP_SECONDS;
  // Skip modulo while the playhead is inside one loop. `8.54 % 60` is slightly
  // under 8.54, which would keep the intro line up through the first vocal cue.
  let t = elapsedSeconds;
  if (!Number.isFinite(t)) return 0;
  if (t < 0 || t >= period) t = ((t % period) + period) % period;
  if (t < first) return count - 1;
  let index = 0;
  for (let i = 1; i < count; i += 1) {
    const start = cues[i];
    if (start === undefined) break;
    if (t >= start) index = i;
    else break;
  }
  return index;
}

/**
 * The line the pane rests on while sound is off (VOF-87): the chorus's first line, the same one the reduced-motion
 * view shows (WALKIN_LOOP_LINES[0]).
 */
export const WALKIN_REST_INDEX = 0;

/** Single chorus line for the join phone when there is room. */
export const WALKIN_JOIN_LINE = "What's your best prediction?";
