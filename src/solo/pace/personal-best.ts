// Best pace (2026-09-27, v2 keys 9.6): a personal best per topic and round size, kept in localStorage. Every read
// and write is wrapped so a blocked or unavailable localStorage (private browsing, a full quota, a locked-down
// phone) never breaks the round -- Best just plays with nothing to beat yet, same as a first run.

export interface PersonalBest {
  score: number;
  correct: number;
  total: number;
  savedAt: number;
}

/**
 * A score over a whole topic and a score over a short, growing one do not mean the same thing (9.6), so v2 keys by
 * round size as well as topic. `V1_KEY_PREFIX` is the key this replaces, from before a round always played the
 * whole topic -- `writePersonalBest` removes it the first time it writes a v2 best for that topic, as the spec says.
 */
const KEY_PREFIX = 'vof-solo-best:v2:';
const V1_KEY_PREFIX = 'vof-solo-best:';

function isPersonalBest(value: unknown): value is PersonalBest {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return Number.isFinite(candidate.score) && Number.isFinite(candidate.correct) && Number.isFinite(candidate.total) && Number.isFinite(candidate.savedAt);
}

/** The best round played on a topic at this round size so far, or null if storage is empty, blocked, or holds
 *  something unreadable. */
export function readPersonalBest(topicId: string, roundSize: number): PersonalBest | null {
  try {
    const raw = localStorage.getItem(KEY_PREFIX + topicId + ':' + roundSize);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    return isPersonalBest(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Saves a round as the new best for this topic and round size. Returns whether it actually saved, so the recap can
 *  say so honestly. Also clears the old, round-size-blind v1 key for this topic, the first time a v2 best lands. */
export function writePersonalBest(topicId: string, roundSize: number, best: PersonalBest): boolean {
  try {
    localStorage.setItem(KEY_PREFIX + topicId + ':' + roundSize, JSON.stringify(best));
  } catch {
    return false;
  }
  try { localStorage.removeItem(V1_KEY_PREFIX + topicId); } catch { /* best effort: the write itself already landed */ }
  return true;
}

export type BestOutcome = 'new-best' | 'close' | 'keep-going' | 'first-run';

export interface BestComparison {
  outcome: BestOutcome;
  best: PersonalBest;
  /** Whether this round's score should become the new stored best -- decided purely from the comparison
   *  itself, before anything is written. */
  shouldSave: boolean;
  /** Whether this round's score was actually written. Optimistically equal to shouldSave (storage usually
   *  works), and a caller that performs the write separately (SoloSuite, so a blocked write can correct the
   *  recap without recomputing the whole comparison) should overwrite this with the real outcome. */
  saved: boolean;
}

/**
 * The pure half of Best: how a just-played round compares to the stored target, with no read or write of its
 * own. "Close" is within a tenth of the best (or a floor of 50 points on a small best), so a near-miss still
 * reads as a near-miss and not as "try again from nothing."
 */
export function evaluateBestRound(
  previous: PersonalBest | null,
  round: { score: number; correct: number; total: number },
  playedAt: number = Date.now(),
): BestComparison {
  const played: PersonalBest = { score: round.score, correct: round.correct, total: round.total, savedAt: playedAt };
  if (!previous) return { outcome: 'first-run', best: played, shouldSave: true, saved: true };
  if (round.score > previous.score) return { outcome: 'new-best', best: played, shouldSave: true, saved: true };
  const closeMargin = Math.max(50, Math.round(previous.score * 0.1));
  const outcome: BestOutcome = round.score >= previous.score - closeMargin ? 'close' : 'keep-going';
  return { outcome, best: previous, shouldSave: false, saved: false };
}

/**
 * Reads the stored best, compares a round against it, and saves it if it should. A convenience for a one-shot
 * caller outside render (tests, anything that is not SoloSuite, which computes the comparison during render
 * from bestTarget and calls writePersonalBest from its own effect instead, so a blocked write can correct just
 * the recap's saved flag without recomputing everything else).
 */
export function comparePersonalBest(topicId: string, roundSize: number, round: { score: number; correct: number; total: number }): BestComparison {
  const compared = evaluateBestRound(readPersonalBest(topicId, roundSize), round);
  if (!compared.shouldSave) return compared;
  return { ...compared, saved: writePersonalBest(topicId, roundSize, compared.best) };
}
