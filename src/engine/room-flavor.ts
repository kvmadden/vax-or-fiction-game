/**
 * Game night on every screen (VOF-88 picked the level, VOF-89 calls 15 and 16 settled the room
 * streak and the lines). The playful lines are UI copy only and never touch clinical text. The
 * rules here decide when the stage celebrates: only when the room is right, and the streak belongs
 * to the room, never to a player (phones keep their own).
 */

import type { Question } from "../data/types";
import { isRightChoice, validChoice } from "./kinds";

/** Lobby, in place of the hype line once a phone has joined. */
export const LOBBY_JOINED_LINE = "Phones keep landing. The room is filling up.";
/** Lobby, before anyone has joined. */
export const LOBBY_EMPTY_LINE = "Phones are warming up. Rumors welcome.";
/** A question arriving: the kicker line directly above the stem. */
export const ARRIVAL_KICKER = "Here comes one to argue about.";
/** Reveal, in the card's eyebrow slot above the verdict. */
export const REVEAL_ROOM_RIGHT_LINE = "Most of the room called it.";
export const REVEAL_ROOM_WRONG_LINE = "This one caught most of us.";

/** The room streak the big screen names, and the pill's own line. */
export const ROOM_STREAK_MIN = 3;
export function roomStreakLine(streak: number): string {
  return `${streak} in a row for the room.`;
}

/**
 * The room's own right rule, the same one the room streak uses (`computeNextStreak`, 60% or more of
 * the votes right). Below half is a room that was wrong. Between the two, or with no votes, the
 * stage says nothing about the room either way.
 */
export const ROOM_RIGHT_PCT = 60;
export type RoomOutcome = "right" | "wrong";

export function roomOutcome(question: Partial<Question> | null | undefined, votes: Record<string, number> | null | undefined): RoomOutcome | null {
  if (!votes || !question) return null;
  let total = 0;
  let right = 0;
  for (const [token, count] of Object.entries(votes)) {
    // The store's own rules for a vote (`validChoice`) and for a right voter (`evalAnswer`), so a token
    // the question does not offer is no vote, and an estimate inside its tolerance counts, exactly as
    // when the reducer settles the room streak.
    if (!Number.isFinite(count) || count <= 0 || !validChoice(question, token)) continue;
    total += count;
    if (isRightChoice(question, token)) right += count;
  }
  if (total === 0) return null;
  const pct = Math.round((right / total) * 100);
  if (pct >= ROOM_RIGHT_PCT) return "right";
  if (right * 2 < total) return "wrong";
  return null;
}

export function roomRevealLine(outcome: RoomOutcome | null): string | null {
  if (outcome === "right") return REVEAL_ROOM_RIGHT_LINE;
  if (outcome === "wrong") return REVEAL_ROOM_WRONG_LINE;
  return null;
}

interface SlideLike { id?: string }
interface QuestionStatLike { correctPct?: number }

/**
 * The room streak standing at `slideIndex`, counted the way the store counts it: every settled
 * question with 60% or more right extends it, a settled one below that ends it, and a question the
 * host skipped (never settled, so no stats) leaves it alone. Walking the run rather than reading the
 * store's running total keeps the number true when the host goes Back to an earlier reveal.
 * `currentRight` is the question on screen, decided from its own votes, so the stage agrees with
 * itself before and after the reducer has settled it.
 */
export function roomStreakAt(
  run: readonly SlideLike[] | null | undefined,
  slideIndex: number,
  stats: Record<string, QuestionStatLike> | null | undefined,
  currentRight: boolean,
): number {
  if (!currentRight) return 0;
  let streak = 1;
  if (!Array.isArray(run)) return streak;
  for (let i = Math.min(slideIndex, run.length) - 1; i >= 0; i -= 1) {
    // Only a question the reducer settled has stats, so the stats decide what counts, never the
    // slide's own shape (`kind` is optional on a question, and the store settles it all the same).
    const id = run[i]?.id;
    const stat = id ? stats?.[id] : undefined;
    if (!stat || !Number.isFinite(stat.correctPct)) continue;
    if ((stat.correctPct ?? 0) >= ROOM_RIGHT_PCT) streak += 1;
    else break;
  }
  return streak;
}

/**
 * Where a question sits in the run. The live slide when it is that question, otherwise the nearest
 * slide with its id, looking back first: a question leaving the stage re-renders after the slide
 * index has moved on, and its card must keep the streak it showed.
 */
export function questionIndexInRun(run: readonly SlideLike[] | null | undefined, slideIndex: number, questionId: string | null | undefined): number {
  if (!Array.isArray(run) || !questionId) return -1;
  if (run[slideIndex]?.id === questionId) return slideIndex;
  for (let i = Math.min(slideIndex, run.length) - 1; i >= 0; i -= 1) if (run[i]?.id === questionId) return i;
  for (let i = Math.max(0, slideIndex + 1); i < run.length; i += 1) if (run[i]?.id === questionId) return i;
  return -1;
}

/** The big screen shows the room streak pill only on a right reveal that reaches three running. */
export function showsRoomStreak(outcome: RoomOutcome | null, streak: number): boolean {
  return outcome === "right" && streak >= ROOM_STREAK_MIN;
}
