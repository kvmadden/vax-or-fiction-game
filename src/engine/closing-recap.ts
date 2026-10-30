import type { Question, RoomStatsState, SlideEntry } from '../data/types';
import { isQuestionSlide, questionKind } from './kinds';

/**
 * The closing recap the room ends on (2026-09-14 design critique, item 9): the show's own material instead of a
 * scoreboard. Pure and host-side; the stage renders it directly and the phone receives a public projection.
 *
 * - `split`: the revealed question the room got wrong most often (lowest correctPct with at least two votes and
 *   not 100%), "the one that split us most".
 * - `takeaways`: the authored takeaway lines of the revealed questions, most-missed first (run order breaks ties
 *   and stands in when nothing was voted on), capped at `limit`.
 * - `accuracy` exists only when real votes exist and the room is not Offline (VOF-22); a zero-vote run is a
 *   truthful no-response recap, never `0%`.
 */
export interface ClosingTakeaway {
  questionId: string;
  number: number;
  text: string;
  /** The takeaway's authored emphasis, present only when it has some. */
  emphasis?: string[];
  /** Room accuracy on that question when votes exist, else null. */
  correctPct: number | null;
}

export interface ClosingSplit {
  questionId: string;
  number: number;
  headline: string;
  /** The stem's authored emphasis when the headline is the stem (never a myth line), present only when it has some. */
  headlineEmphasis?: string[];
  correctPct: number;
  votes: number;
}

export interface ClosingRecap {
  hasAnswers: boolean;
  accuracy: number | null;
  answers: number;
  bestStreak: number;
  /** Revealed questions the recap could draw on (0 falls back to the run's order). */
  revealed: number;
  split: ClosingSplit | null;
  takeaways: ClosingTakeaway[];
}

export interface ClosingRecapOptions {
  offline?: boolean;
  limit?: number;
}

type QuestionStatsLike = NonNullable<RoomStatsState['questions']>[string] | undefined;

interface PlayedQuestion {
  question: Question;
  number: number;
  order: number;
  stats: QuestionStatsLike;
  votes: number;
  correctPct: number | null;
}

function votesOn(stats: QuestionStatsLike): number {
  if (!stats) return 0;
  const fromChoices = Object.values(stats.choices ?? {}).reduce<number>((sum, count) => sum + (Number.isFinite(Number(count)) ? Number(count) : 0), 0);
  if (fromChoices > 0) return fromChoices;
  return (Number(stats.trueCount) || 0) + (Number(stats.falseCount) || 0);
}

function clampPct(value: unknown): number | null {
  const pct = Number(value);
  return Number.isFinite(pct) ? Math.round(Math.min(100, Math.max(0, pct))) : null;
}

/** The line that names the question on the recap: the myth line for a myth-among-three, else the statement. */
export function recapHeadline(question: Question): string {
  if (questionKind(question) === 'myth-among-three' && Array.isArray(question.statements)) {
    const myth = question.statements[Number(question.mythIndex)];
    if (typeof myth === 'string' && myth.trim()) return myth.trim();
  }
  return String(question.statement || question.scenario || '').trim();
}

export function buildClosingRecap(
  run: readonly SlideEntry[] | null | undefined,
  roomStats: Partial<RoomStatsState> | null | undefined,
  options: ClosingRecapOptions = {},
): ClosingRecap {
  const limit = Math.max(0, Math.floor(options.limit ?? 3));
  const offline = Boolean(options.offline);
  const answers = Math.max(0, Math.floor(Number(roomStats?.votesTotal) || 0));
  const accuracy = clampPct(roomStats?.accuracy);
  const hasAnswers = !offline && answers > 0 && accuracy !== null;
  const bestStreak = Math.max(0, Math.floor(Number(roomStats?.bestStreak) || 0));
  const statsById = (roomStats?.questions ?? {}) as Record<string, QuestionStatsLike>;

  const played: PlayedQuestion[] = [];
  for (const slide of run ?? []) {
    if (!isQuestionSlide(slide)) continue;
    const question = slide as unknown as Question & { displayNumber?: number };
    const stats = statsById[question.id];
    const votes = hasAnswers ? votesOn(stats) : 0;
    played.push({
      question,
      number: Number.isInteger(question.displayNumber) ? Number(question.displayNumber) : played.length + 1,
      order: played.length,
      stats,
      votes,
      correctPct: votes > 0 ? clampPct(stats?.correctPct) : null,
    });
  }
  const revealed = played.filter((entry) => entry.stats !== undefined);
  const pool = revealed.length > 0 ? revealed : played;
  const ranked = [...pool].sort((a, b) => {
    const aKey = a.correctPct ?? Number.POSITIVE_INFINITY;
    const bKey = b.correctPct ?? Number.POSITIVE_INFINITY;
    if (aKey !== bKey) return aKey - bKey;
    return a.order - b.order;
  });

  const first = ranked[0];
  const split: ClosingSplit | null = first && first.correctPct !== null && first.votes >= 2 && first.correctPct < 100
    ? {
      questionId: first.question.id,
      number: first.number,
      headline: recapHeadline(first.question),
      ...(questionKind(first.question) !== 'myth-among-three' && first.question.emphasis?.length ? { headlineEmphasis: first.question.emphasis } : {}),
      correctPct: first.correctPct,
      votes: first.votes,
    }
    : null;

  const takeaways: ClosingTakeaway[] = ranked
    .filter((entry) => typeof entry.question.takeaway === 'string' && entry.question.takeaway.trim().length > 0)
    .slice(0, limit)
    .map((entry) => ({
      questionId: entry.question.id,
      number: entry.number,
      text: String(entry.question.takeaway).trim(),
      ...(entry.question.takeawayEmphasis?.length ? { emphasis: entry.question.takeawayEmphasis } : {}),
      correctPct: entry.correctPct,
    }));

  return { hasAnswers, accuracy: hasAnswers ? accuracy : null, answers, bestStreak, revealed: revealed.length, split, takeaways };
}
