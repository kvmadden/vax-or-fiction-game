import { GameState, GamePhase } from "../data/types";
import { isQuestionSlide } from "./kinds";
import { shouldShowIntervalLeaderboard } from "./leaderboard";

export const UNREVEALED_PHASES = new Set<GamePhase>(["entering", "deliberating", "timedOut", "locked"]);

/**
 * Phases where the host is still assembling the game. Setup has a button for every choice here, so no
 * presenter key or clicker press may move the host off it. advance() and back() return null, the store
 * reveals only a question on stage, and the keyboard map drops S. Anything that needs to know whether the
 * host is in setup asks isSetupPhase.
 */
const SETUP_PHASES = new Set<string>(["deckPicker", "formatPicker", "modePicker", "preFlight"]);

export function isSetupPhase(phase: string | null | undefined): boolean {
  return phase != null && SETUP_PHASES.has(phase);
}

export type StateTransition = Partial<GameState> & { direction?: "forward" | "backward" };

export function advance(state: GameState): StateTransition | null {
  if (SETUP_PHASES.has(state.phase)) return null;
  if (state.phase === "lobby") return { phase: "entering", slideIndex: 0, direction: "forward" };
  if (state.phase === "revealed" && isQuestionSlide(state.run?.[state.slideIndex])) {
    return { phase: "explaining", direction: "forward" };
  }
  if (state.phase === "explaining" && shouldShowIntervalLeaderboard(state)) {
    return { phase: "leaderboard", direction: "forward" };
  }
  if (UNREVEALED_PHASES.has(state.phase)) {
    const currentSlide = state.run?.[state.slideIndex];
    const isStatic = currentSlide && (
      !isQuestionSlide(currentSlide) ||
      ["title", "halftime", "focus", "fork", "showdown", "closing"].includes(currentSlide.type)
    );
    if (!isStatic) {
      return { phase: "revealed" };
    }
  }

  if (!Array.isArray(state.run) || state.run.length === 0) return null;
  if (state.slideIndex >= state.run.length - 1) return { phase: "closing", direction: "forward" };

  return { slideIndex: state.slideIndex + 1, phase: "entering", direction: "forward" };
}

function phaseForDestinationSlide(
  slide: { type?: string; id?: string } | null | undefined,
  fallback: GamePhase,
): GamePhase {
  if (!slide) return fallback;
  if (isQuestionSlide(slide)) {
    return fallback === "closing" || fallback === "showdown" || fallback === "leaderboard"
      ? "entering"
      : fallback;
  }
  const type = String(slide.type ?? slide.id ?? "").toLowerCase();
  if (type === "closing" || type === "outro") return "closing";
  if (type === "showdown") return "showdown";
  if (type === "fork") return "fork";
  return "entering";
}

export function back(state: GameState): StateTransition | null {
  if (state.phase === "leaderboard") {
    const currentSlide = state.run?.[state.slideIndex];
    return { phase: isQuestionSlide(currentSlide) ? "entering" : "explaining", direction: "backward" };
  }
  if (state.phase === "explaining") return { phase: "revealed", direction: "backward" };
  if (state.phase === "lobby") {
    return { phase: "preFlight", direction: "backward" };
  }
  if (SETUP_PHASES.has(state.phase)) return null;

  if (state.slideIndex < 0) return null;

  // Reveals are one-way (2026-09-25): Back never un-reveals the question on screen in
  // place. A settled, revealed question falls through to the ordinary slide transition below,
  // moving to the previous slide like any other Back. If that previous slide was itself already
  // settled, the store's BACK handler re-arms it (rearmQuestion) so it opens showing its revealed
  // state instead of resetting to a blank question.
  if (state.slideIndex === 0) return { phase: "lobby", direction: "backward" };

  const slideIndex = state.slideIndex - 1;
  return {
    slideIndex,
    phase: phaseForDestinationSlide(state.run?.[slideIndex], state.phase),
    direction: "backward",
  };
}
