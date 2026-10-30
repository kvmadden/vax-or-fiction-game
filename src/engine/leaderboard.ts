import { isQuestionSlide } from './kinds';

export const LEADERBOARD_LIMIT = 5;
export const LEADERBOARD_INTERVAL = 5;
/** Interval boards are a Curated 15 in-room beat. Other modes keep scores off-stage until closing. */
export const INTERVAL_LEADERBOARD_MODE_ID = 'curated15';

/**
 * The shared entry the wire projection, the showdown finalists and the Closing archive all build from.
 * B3 (VOF-12): it carries no device identity. A phone's device id is its persistent vrc_device_id, a
 * cross-show tracking id, and it stays on the host. W3: no joinedAt either, since nothing reads it.
 */
export interface LeaderboardEntry {
  nickname: string; // actually their first name
  score: number;
  bestStreak: number;
  hardQuestionPoints: number;
  realityGap: number;
  team: 'NAVY' | 'GOLD' | null;
}

export interface RankedLeaderboardEntry extends LeaderboardEntry {
  /** Competition rank: ties share a rank (1, 2, 2, 4). */
  rank: number;
}

/**
 * A row of the stage board only, rendered on the host and never serialized. MOT-VQA-09 keys each lane
 * by the devices record's own key, which stays put across any score or rank change and tells apart
 * two players who chose the same name. That key is the device id, so it rides this type alone (B3).
 */
export interface StageLeaderboardLane extends RankedLeaderboardEntry {
  laneKey: string;
}

export interface IntervalLeaderboardState {
  leaderboardEnabled?: boolean;
  modeId?: string | null;
  run?: readonly unknown[] | null;
  slideIndex?: number | null;
  interactionMode?: string | null;
  offlineMode?: boolean | null;
}

// Sort by score DESC, then bestStreak DESC, then hardQuestionPoints DESC, then name ASC.
export function computeLeaderboard(
  devices: Record<string, any>,
  limit: number = LEADERBOARD_LIMIT,
): LeaderboardEntry[] {
  return sortedDeviceEntries(devices, limit).map(([, entry]) => entry);
}

/** The stage board's ranked lanes, each keyed for React by its device record (host render only). */
export function computeStageLanes(
  devices: Record<string, any>,
  limit: number = LEADERBOARD_LIMIT,
): StageLeaderboardLane[] {
  return rankLeaderboard(sortedDeviceEntries(devices, limit).map(([laneKey, entry]) => ({ ...entry, laneKey })));
}

function sortedDeviceEntries(
  devices: Record<string, any>,
  limit: number,
): Array<[string, LeaderboardEntry]> {
  const cap = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : LEADERBOARD_LIMIT;
  return Object.entries(devices)
    .filter((entry): entry is [string, Record<string, any> & { nickname: string }] =>
      Boolean(entry[1])
      && typeof entry[1].nickname === 'string'
      && entry[1].nickname.trim().length > 0
      && Number(entry[1].answered) > 0
    )
    .sort(([, a], [, b]) => {
      const scoreA = typeof a.score === 'number' ? a.score : 0;
      const scoreB = typeof b.score === 'number' ? b.score : 0;
      if (scoreB !== scoreA) return scoreB - scoreA;
      const streakA = typeof a.bestStreak === 'number' ? a.bestStreak : 0;
      const streakB = typeof b.bestStreak === 'number' ? b.bestStreak : 0;
      if (streakB !== streakA) return streakB - streakA;
      const hardA = typeof a.hardQuestionPoints === 'number' ? a.hardQuestionPoints : 0;
      const hardB = typeof b.hardQuestionPoints === 'number' ? b.hardQuestionPoints : 0;
      if (hardB !== hardA) return hardB - hardA;
      return a.nickname.localeCompare(b.nickname);
    })
    .slice(0, cap)
    .map(([id, d]): [string, LeaderboardEntry] => {
      const team = typeof d.team === 'string' && ['NAVY', 'GOLD'].includes(d.team.toUpperCase()) ? d.team.toUpperCase() as 'NAVY' | 'GOLD' : null;
      return [id, {
        nickname: d.nickname,
        score: typeof d.score === 'number' ? d.score : 0,
        bestStreak: typeof d.bestStreak === 'number' ? d.bestStreak : 0,
        hardQuestionPoints: typeof d.hardQuestionPoints === 'number' ? d.hardQuestionPoints : 0,
        realityGap: typeof d.realityGap === 'number' ? d.realityGap : 0,
        team,
      }];
    });
}

/** Attach competition ranks so tied scores share a place. */
export function rankLeaderboard<T extends LeaderboardEntry>(entries: readonly T[]): Array<T & { rank: number }> {
  let previous: { score: number; bestStreak: number; hardQuestionPoints: number; rank: number } | null = null;
  return entries.map((entry, index) => {
    const isTie = Boolean(
      previous &&
      previous.score === entry.score &&
      previous.bestStreak === entry.bestStreak &&
      previous.hardQuestionPoints === entry.hardQuestionPoints
    );
    const rank = isTie && previous ? previous.rank : index + 1;
    previous = { score: entry.score, bestStreak: entry.bestStreak, hardQuestionPoints: entry.hardQuestionPoints, rank };
    return { ...entry, rank };
  });
}

export function questionDisplayNumber(slide: unknown): number | null {
  if (!isQuestionSlide(slide)) return null;
  const n = Number((slide as { displayNumber?: unknown }).displayNumber);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export function questionDisplayCount(slide: unknown): number | null {
  if (!isQuestionSlide(slide)) return null;
  const n = Number((slide as { displayCount?: unknown }).displayCount);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export function isIntervalLeaderboardMode(modeId: string | null | undefined): boolean {
  return modeId === 'curated15' || modeId === 'curated8';
}

export function leaderboardIntervalForCount(totalQuestions: number | null | undefined): number {
  return totalQuestions != null && totalQuestions <= 10 ? 4 : 5;
}

/**
 * Curated 15 and Curated 8 with scores on: the board after the interval
 * (Halftime at Q4 for <= 10 questions, or every 5 questions for > 10),
 * never after every question, and not after the last (closing carries the final Top 5).
 */
export function shouldShowIntervalLeaderboard(state: IntervalLeaderboardState): boolean {
  if (state.leaderboardEnabled !== true) return false;
  if (!isIntervalLeaderboardMode(state.modeId)) return false;
  // W5: hands-up rooms have no phone votes to rank, so the interval board never has anything
  // to show. This function used to skip straight to the interval math without checking that,
  // landing on a real "board is waiting" empty board mid-game in a hands-up room.
  if (state.interactionMode != null && state.interactionMode !== 'polling') return false;
  // Nit (premium-host-fix-3): offlineMode is the desync-resistant signal (B1's own flag,
  // phonesVote, keys off both venue and interactionMode), and interactionMode alone can carry a
  // stale "polling" value the same way Lobby.tsx's own desync could. Checked independently so a
  // desynced offline room never opens the board even if interactionMode has not caught up yet.
  if (state.offlineMode === true) return false;
  const slide = Array.isArray(state.run) && typeof state.slideIndex === 'number'
    ? state.run[state.slideIndex]
    : undefined;
  const n = questionDisplayNumber(slide);
  const total = questionDisplayCount(slide);
  const interval = leaderboardIntervalForCount(total);
  if (n == null || n % interval !== 0) return false;
  if (total != null && n === total) return false;
  return true;
}
