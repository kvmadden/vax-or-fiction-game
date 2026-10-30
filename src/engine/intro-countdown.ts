import { isQuestionSlide } from "./kinds";
import { UNREVEALED_PHASES } from "./state-machine";
import type { GamePhase } from "../data/types";

/**
 * The 3-2-1 into question 1 (VOF-88). The host's first advance on the instructions beat starts it, a
 * second advance during it skips straight in, Back cancels it, and the stage lands question 1 when the
 * count runs out. The store holds only the moment it started, so everything here is a pure read of that
 * stamp against the clock.
 */
export const INTRO_COUNTDOWN_STEP_MS = 900;
export const INTRO_COUNTDOWN_NUMBERS = [3, 2, 1] as const;
export const INTRO_COUNTDOWN_MS = INTRO_COUNTDOWN_STEP_MS * INTRO_COUNTDOWN_NUMBERS.length;
/**
 * A stamp this old no longer counts. A countdown left behind by some other move off the beat can then
 * never show again, finish on its own or turn an ordinary press into a skip.
 */
export const INTRO_COUNTDOWN_STALE_MS = INTRO_COUNTDOWN_MS + 1500;
/**
 * Once the count lands question 1 on its own, a skip press that arrives a moment late (the remote's relay
 * adds latency) is dropped instead of locking the question the room has barely seen.
 */
export const INTRO_LANDING_GRACE_MS = 700;

interface CountdownState {
  phase: GamePhase | string;
  slideIndex: number;
  run?: ReadonlyArray<unknown> | null;
}

function isInstructionsSlide(slide: unknown): boolean {
  if (!slide || typeof slide !== "object") return false;
  const { id, type } = slide as { id?: unknown; type?: unknown };
  return id === "instructions" || type === "instructions";
}

/** The instructions beat with a question next: the one hand-off the countdown belongs to. */
export function isIntroCountdownBeat(state: CountdownState): boolean {
  if (!UNREVEALED_PHASES.has(state.phase as GamePhase)) return false;
  const run = Array.isArray(state.run) ? state.run : [];
  return isInstructionsSlide(run[state.slideIndex]) && isQuestionSlide(run[state.slideIndex + 1]);
}

export function isIntroCountdownRunning(startedAt: number | null | undefined, now: number): boolean {
  if (typeof startedAt !== "number" || !Number.isFinite(startedAt)) return false;
  const elapsed = now - startedAt;
  return elapsed >= 0 && elapsed < INTRO_COUNTDOWN_STALE_MS;
}

/** True while `stamp` is no more than `windowMs` old. */
export function isWithin(stamp: number | null | undefined, now: number, windowMs: number): boolean {
  if (typeof stamp !== "number" || !Number.isFinite(stamp)) return false;
  const elapsed = now - stamp;
  return elapsed >= 0 && elapsed < windowMs;
}

/** The number on stage, or null once the count has run out. */
export function introCountdownNumber(startedAt: number, now: number): number | null {
  const step = Math.floor(Math.max(0, now - startedAt) / INTRO_COUNTDOWN_STEP_MS);
  return INTRO_COUNTDOWN_NUMBERS[step] ?? null;
}
