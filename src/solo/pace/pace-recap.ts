// Solo pace round-end math (2026-09-27). Pure functions only: no store, no DOM, so every one of these is cheap to
// unit test and cannot drift from what the engine actually scored, because they replay the same score() the store
// calls in settleCurrentQuestion (src/store/game-store.ts).
import type { Question, QuestionKind } from '../../data/types';
import type { RuntimeMeta } from '../../data/bank/types';
import { score } from '../../engine/scoring';

/**
 * A deck question has no difficulty field of its own. Climb uses its settled bank level from the separate runtime
 * metadata map, then the kind-weighted base points from engine/scoring.ts (binary 100, estimate/myth-among-three
 * 150, which-patient 200, order 250) to break ties.
 */
const KIND_WEIGHT: Record<QuestionKind, number> = {
  binary: 100,
  estimate: 150,
  'myth-among-three': 150,
  'which-patient': 200,
  order: 250,
};

export function kindOf(question: Question | undefined): QuestionKind {
  return question?.kind ?? 'binary';
}

/**
 * Climb's shape: the round's own ids, reordered easiest-level-first, then lightest-kind-first, with ties kept in
 * their original dealt order. Never touches the pool's own sequence or its played bookkeeping, only the ids already
 * dealt for this one round move.
 */
export function orderForClimb(
  ids: readonly string[],
  questions: readonly Question[],
  meta: ReadonlyMap<string, RuntimeMeta | null> = new Map(),
): string[] {
  const byId = new Map(questions.map((question) => [question.id, question]));
  const difficultyWeight: Record<RuntimeMeta['difficulty'], number> = { easy: 0, medium: 1, hard: 2, expert: 3 };
  return ids
    .map((id, index) => ({ id, index, difficulty: meta.get(id)?.difficulty }))
    .sort((a, b) =>
      (difficultyWeight[a.difficulty ?? 'easy'] - difficultyWeight[b.difficulty ?? 'easy'])
      || KIND_WEIGHT[kindOf(byId.get(a.id))] - KIND_WEIGHT[kindOf(byId.get(b.id))]
      || a.index - b.index)
    .map((entry) => entry.id);
}

/** The index of Climb's climax: the last question of the round, worth double. */
export function climaxIndex(total: number): number {
  return total - 1;
}

/** The index of Climb's checkpoint: the first question past the halfway mark. */
export function checkpointIndex(total: number): number {
  return Math.floor(total / 2);
}

export interface PaceQuestionOutcome {
  id: string;
  kind: QuestionKind;
  isRight: boolean | null;
  takeaway?: string;
  /** The takeaway's authored emphasis, when it has some. */
  takeawayEmphasis?: string[];
}

export interface PaceRoundRecap {
  answered: number;
  correct: number;
  total: number;
  /** The pace-scaled score: for Climb, the climax question's points count twice. Everything else matches the
   *  store's own attendee.score, since it replays the same score() in the same order. */
  points: number;
  bestStreak: number;
  /** Takeaway lines for the missed cards, in the order played, unchanged clinical text. Carries each question's
   *  own id, since two different misses can share the same takeaway line and a list keyed on that text alone
   *  would collide. */
  missedTakeaways: { id: string; takeaway: string; takeawayEmphasis?: string[] }[];
  /** Climb only: whether the climax question was answered right, so the recap can say the double landed. */
  climaxHit: boolean | null;
}

/**
 * Replays a round's outcomes through the engine's own score(), question by question, exactly as
 * settleCurrentQuestion does. `climaxAt`, when given, doubles that one index's own points (Climb's climax) in the
 * pace-scaled total only -- the store's real attendee.score is never touched, so nothing here can pay out points
 * the wire contract (STREAK-PILL, src/network/guards.ts) was not built to carry.
 */
export function buildPaceRoundRecap(outcomes: readonly PaceQuestionOutcome[], climaxAt?: number): PaceRoundRecap {
  let streak = 0;
  let bestStreak = 0;
  let points = 0;
  let correct = 0;
  let answered = 0;
  const missedTakeaways: PaceRoundRecap['missedTakeaways'] = [];
  let climaxHit: boolean | null = null;
  outcomes.forEach((outcome, index) => {
    if (outcome.isRight === null) return;
    answered += 1;
    const result = score(outcome.isRight, outcome.kind, streak);
    streak = result.nextStreak;
    bestStreak = Math.max(bestStreak, streak);
    const isClimax = climaxAt !== undefined && index === climaxAt;
    if (isClimax) climaxHit = outcome.isRight;
    points += isClimax ? result.points * 2 : result.points;
    if (outcome.isRight) correct += 1;
    else if (outcome.takeaway) {
      missedTakeaways.push({
        id: outcome.id,
        takeaway: outcome.takeaway,
        ...(outcome.takeawayEmphasis?.length ? { takeawayEmphasis: outcome.takeawayEmphasis } : {}),
      });
    }
  });
  return { answered, correct, total: outcomes.length, points, bestStreak, missedTakeaways, climaxHit };
}
