/**
 * Passive lobby lyrics, adapted from the DJ KMad / djkmad.com track-page scroller
 * and the vax-or-fiction-music lyric-scroll port. Owns no audio or network.
 */

/**
 * The DJ KMad scroll's own numbers (generated-music assets/track.js, the lyric engine the dadof3 site shares). A line
 * lights this far ahead of its sung onset, so the eye lands on it as the singer does.
 */
export const LYRIC_LEAD_SECONDS = 0.3;
/** Where the lit line settles, as a share of the pane's height from the top. */
export const LYRIC_ANCHOR = 0.35;
/** How much of the remaining distance the pane scrolls each frame. */
export const LYRIC_LERP = 0.07;
/** Within this many pixels the pane snaps to its target and stops. */
export const LYRIC_SNAP_PX = 0.5;

/** The DJ KMad tiers: the lit line, one line off, two lines off, and the rest. Idle means no line is lit. */
export type LyricTier = 'active' | 'near' | 'near-2' | 'far' | 'idle';

export function lyricTier(index: number, activeIndex: number): LyricTier {
  if (activeIndex < 0) return 'idle';
  const distance = Math.abs(index - activeIndex);
  if (distance === 0) return 'active';
  if (distance === 1) return 'near';
  if (distance === 2) return 'near-2';
  return 'far';
}

/**
 * The scroll position that sets a line's centre at the anchor, kept inside the pane's own range. The first and last
 * lines cannot reach the anchor, so they rest at the top and the bottom.
 */
export function lyricScrollTarget(line: { offsetTop: number; height: number }, pane: { height: number; scrollHeight: number }): number {
  const max = Math.max(0, pane.scrollHeight - pane.height);
  return Math.max(0, Math.min(line.offsetTop - pane.height * LYRIC_ANCHOR + line.height / 2, max));
}

/**
 * One frame of the ease toward the target: the next scroll position, and whether the pane has arrived. The caller
 * keeps `current` as its own fraction and never reads it back from the pane, since browsers round scroll offsets to
 * whole pixels, and a read-back position stalls a few pixels short of the target and never settles.
 */
export function lyricScrollStep(current: number, target: number): { next: number; settled: boolean } {
  const distance = target - current;
  if (Math.abs(distance) < LYRIC_SNAP_PX) return { next: target, settled: true };
  return { next: current + distance * LYRIC_LERP, settled: false };
}

/** What the lyric scroll needs from the playing bed (getMusicPlaybackSnapshot's own shape). */
export interface LyricPlayback {
  role: string | null;
  trackSha256: string | null;
  currentTime: number;
  duration: number;
  paused: boolean;
  status: string;
  muted: boolean;
}

/**
 * The line to light for a playback moment, or -1 when no line should be lit: the playhead moved on by the lead, then
 * mapped onto the cues by `lineAt` (the walk-in's own mapper, with its intro hold and loop wrap). `begun` starts false
 * and turns true once the bed has played, so a bed parked at 0 before its first play lights nothing. While sound is
 * off the pane rests on `restIndex` (VOF-87): lines stepping to music nobody hears looked like a broken karaoke
 * screen, so the pane holds its line and picks the song up the moment sound comes on.
 */
export function lyricLineAt(
  playback: LyricPlayback,
  track: { audioSha256: string; lineCount: number; restIndex: number },
  begun: boolean,
  lineAt: (seconds: number, lineCount: number, loopSeconds?: number) => number,
): { index: number; begun: boolean } {
  if (playback.muted) return { index: track.restIndex, begun };
  const matches = playback.role === 'walkin' && playback.trackSha256 === track.audioSha256;
  const hasTime = Number.isFinite(playback.currentTime)
    && playback.currentTime >= 0
    && Number.isFinite(playback.duration)
    && playback.duration > 0;
  const usable = ['playing', 'fading', 'paused'].includes(playback.status);
  if (!matches || !hasTime || !usable) return { index: -1, begun: false };
  const started = begun || !playback.paused || playback.currentTime > 0;
  if (!started) return { index: -1, begun: false };
  return {
    index: lineAt(playback.currentTime + LYRIC_LEAD_SECONDS, track.lineCount, playback.duration > 0 ? playback.duration : undefined),
    begun: true,
  };
}

export interface LyricLine {
  time: number;
  text: string;
  endTime?: number;
}

export interface LyricData {
  audioSha256: string;
  lines: LyricLine[];
}

export function validateLyricData(data: unknown, duration = Infinity): data is LyricData {
  if (!data || typeof data !== 'object') return false;
  const candidate = data as LyricData;
  if (typeof candidate.audioSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(candidate.audioSha256)) return false;
  if (!(duration > 0) || (!Number.isFinite(duration) && duration !== Infinity)) return false;
  if (!Array.isArray(candidate.lines) || candidate.lines.length === 0) return false;
  return candidate.lines.every((line, index, lines) => {
    if (!line || !Number.isFinite(line.time) || line.time < 0 || line.time >= duration) return false;
    if (index > 0 && line.time <= lines[index - 1]!.time) return false;
    if (typeof line.text !== 'string' || !line.text.trim()) return false;
    if (line.endTime !== undefined && (
      !Number.isFinite(line.endTime)
      || line.endTime <= line.time
      || line.endTime > duration
      || (lines[index + 1] && line.endTime > lines[index + 1]!.time)
    )) return false;
    return true;
  });
}

/** Start-inclusive, end-exclusive cue lookup; no inferred vocal lead. */
export function getActiveLyricIndex(lines: readonly LyricLine[], currentTime: number): number {
  if (!Number.isFinite(currentTime) || currentTime < 0) return -1;
  let index = -1;
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i]!.time > currentTime) break;
    index = i;
  }
  if (index >= 0 && lines[index]!.endTime !== undefined && currentTime >= lines[index]!.endTime!) return -1;
  return index;
}
