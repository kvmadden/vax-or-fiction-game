import { isQuestionSlide } from "../engine/kinds";
import { isSetupPhase } from "../engine/state-machine";

export const REQUEST_FULLSCREEN = "REQUEST_FULLSCREEN";
export const EXIT_FULLSCREEN = "EXIT_FULLSCREEN";
export const TOGGLE_AUDIO = "TOGGLE_AUDIO";
export const ADD_TIME = "ADD_TIME";
export const ADVANCE = "ADVANCE";
export const BACK = "BACK";
export const CLOSE_HELP = "CLOSE_HELP";
export const HUD_HIDE = "HUD_HIDE";
export const HUD_SHOW = "HUD_SHOW";
export const LOCK_VOTES = "LOCK_VOTES";
export const OPEN_HELP = "OPEN_HELP";
export const PARK = "PARK";
export const REQUEST_RESTART_RUN = "REQUEST_RESTART_RUN";
export const CONFIRM_RESTART_RUN = "CONFIRM_RESTART_RUN";
export const CANCEL_RESTART_RUN = "CANCEL_RESTART_RUN";
export const RESTART_TIMER = "RESTART_TIMER";
export const REVEAL = "REVEAL";
export const SKIP = "SKIP";
export const TOGGLE_DISCUSSION = "TOGGLE_DISCUSSION";
export const TOGGLE_PAUSE = "TOGGLE_PAUSE";
export const TOGGLE_TIMER = "TOGGLE_TIMER";

export const NAVIGATION_DEBOUNCE_MS = 300;

export type KeyboardAction =
  | { type: typeof ADVANCE }
  | { type: typeof BACK }
  | { type: typeof REVEAL }
  | { type: typeof LOCK_VOTES }
  | { type: typeof RESTART_TIMER }
  | { type: typeof TOGGLE_PAUSE }
  | { type: typeof ADD_TIME }
  | { type: typeof TOGGLE_TIMER }
  | { type: typeof TOGGLE_DISCUSSION }
  | { type: typeof SKIP }
  | { type: typeof PARK }
  | { type: typeof OPEN_HELP; returnFocusId: string }
  | { type: typeof CLOSE_HELP }
  | { type: typeof HUD_SHOW; restore: true }
  | { type: typeof HUD_HIDE; releaseFocus: true; suppress: true }
  | { type: typeof REQUEST_RESTART_RUN }
  | { type: typeof CONFIRM_RESTART_RUN }
  | { type: typeof CANCEL_RESTART_RUN }
  | { type: typeof REQUEST_FULLSCREEN }
  | { type: typeof EXIT_FULLSCREEN }
  | { type: typeof TOGGLE_AUDIO };

export interface KeyboardEventLike {
  key: string;
  repeat?: boolean;
  shiftKey?: boolean;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  target?: any;
}

export interface KeyboardStateLike {
  phase?: string | null;
  modeId?: string | null;
  restartRunConfirmationOpen?: boolean;
  fullscreenActive?: boolean;
  help?: {
    open?: boolean;
    returnFocusId?: string | null;
  } | null;
  hud?: {
    visible?: boolean;
    pinnedByFocus?: boolean;
    suppressed?: boolean;
  } | null;
  /** SlideErrorBoundary is showing, so Space must skip rather than advance. */
  slideError?: boolean;
  /** PresenterPairing (aria-modal, its own Tab trap) is mounted. NIT-9: ? must not also open
   * the keyboard help sheet underneath it, which sits at a lower z-index and traps Tab itself. */
  pairingOpen?: boolean;
  [key: string]: any;
}

export function shouldThrottleNavigation(
  lastDispatchTime: number,
  now: number = Date.now(),
  debounceMs: number = NAVIGATION_DEBOUNCE_MS,
): boolean {
  return now - lastDispatchTime < debounceMs;
}

function hasUnsupportedModifier(event: KeyboardEventLike): boolean {
  return event.metaKey === true || event.ctrlKey === true || event.altKey === true;
}

function returnFocusId(event: KeyboardEventLike): string {
  const id = event.target?.id;
  return typeof id === "string" && id !== "" ? id : "presentation-stage";
}

/** Presenter tools that stay live on setup. Show-running keys are idle (VOF-46 / VOF-47). */
const SETUP_ALLOWED_ACTIONS = new Set<KeyboardAction["type"]>([
  TOGGLE_AUDIO,
  REQUEST_FULLSCREEN,
  EXIT_FULLSCREEN,
  HUD_SHOW,
  HUD_HIDE,
  OPEN_HELP,
  CLOSE_HELP,
  TOGGLE_DISCUSSION,
]);

/** Keys that scroll a page when the presenter map is idle (setup, lobby, end screens). */
export const PRESENTER_SCROLL_KEYS = [
  " ",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "PageUp",
  "PageDown",
  "Home",
  "End",
] as const;

/** Enter/S/K only operate a question on stage (VOF-46). A missing phase or run keeps the on-stage mapping. */
export function enterRevealsHere(state: { phase?: string | null; run?: unknown[]; slideIndex?: number } | string | null | undefined): boolean {
  const phase = typeof state === "object" && state !== null ? state.phase : state;
  if (phase == null) return true;
  if (isSetupPhase(phase)) return false;
  if (phase === "lobby" || phase === "closing" || phase === "outro" || phase === "showdown" || phase === "leaderboard") return false;
  if (typeof state === "object" && state !== null && Array.isArray(state.run) && typeof state.slideIndex === "number") {
    return isQuestionSlide(state.run[state.slideIndex]);
  }
  return true;
}

function eventTargetTag(event: KeyboardEventLike): string {
  return event.target?.tagName?.toLowerCase?.() ?? "";
}

function eventTargetIsField(event: KeyboardEventLike): boolean {
  const targetTag = eventTargetTag(event);
  return (
    targetTag === "input" ||
    targetTag === "textarea" ||
    targetTag === "select" ||
    Boolean(event.target?.isContentEditable)
  );
}

function eventTargetIsButton(event: KeyboardEventLike): boolean {
  const targetTag = eventTargetTag(event);
  return (
    targetTag === "button" ||
    Boolean(
      typeof event.target?.closest === "function" &&
        event.target.closest("button, [role='button'], [role='switch']"),
    )
  );
}

/**
 * Keep Space and arrows from scrolling the ready sheet, lobby, or projected stage
 * when those keys are idle. Leave fields and focused buttons alone so they still type
 * and activate.
 */
export function shouldPreventPresenterKeyDefault(event: KeyboardEventLike): boolean {
  if (!PRESENTER_SCROLL_KEYS.includes(event.key as (typeof PRESENTER_SCROLL_KEYS)[number])) {
    return false;
  }
  if (eventTargetIsField(event)) return false;
  if (eventTargetIsButton(event) && (event.key === " " || event.key === "Enter")) return false;
  return true;
}

export function mapKeyboardEvent(
  event: KeyboardEventLike,
  state: KeyboardStateLike,
): KeyboardAction | null {
  if (eventTargetIsField(event)) return null;
  if (eventTargetIsButton(event) && (event.key === " " || event.key === "Enter")) return null;
  if (event.repeat === true || hasUnsupportedModifier(event)) return null;

  if (state.restartRunConfirmationOpen === true) {
    return event.key === "Escape" ? { type: CANCEL_RESTART_RUN } : null;
  }

  if (state.help?.open) {
    return event.key === "Escape" || event.key === "?" ? { type: CLOSE_HELP } : null;
  }

  if (event.shiftKey === true) {
    if (event.key.toLowerCase() === "r") {
      return isSetupPhase(state.phase) ? null : { type: REQUEST_RESTART_RUN };
    }
    if (event.key !== "?" && event.key !== "+" && event.key.toLowerCase() !== "m") {
      return null;
    }
  }

  let action: KeyboardAction | null;
  switch (event.key) {
    case "PageDown":
    case "ArrowRight":
      action = { type: ADVANCE };
      break;
    case " ":
      action = state.slideError === true ? { type: SKIP } : { type: ADVANCE };
      break;
    case "PageUp":
    case "ArrowLeft":
      action = { type: BACK };
      break;
    case "Enter":
      action = enterRevealsHere(state) ? { type: REVEAL } : null;
      break;
    case "l":
    case "L":
      action = enterRevealsHere(state) ? { type: LOCK_VOTES } : null;
      break;
    case "r":
    case "R":
      action = enterRevealsHere(state) ? { type: RESTART_TIMER } : null;
      break;
    case "p":
    case "P":
      action = { type: TOGGLE_PAUSE };
      break;
    case "+":
    case "=":
      action = enterRevealsHere(state) ? { type: ADD_TIME } : null;
      break;
    case "t":
    case "T":
      action = state.modeId && enterRevealsHere(state) ? { type: TOGGLE_TIMER } : null;
      break;
    case "d":
    case "D":
      action = { type: TOGGLE_DISCUSSION };
      break;
    case "s":
    case "S":
      // The error screen's Skip button still dispatches SKIP itself.
      action = enterRevealsHere(state) ? { type: SKIP } : null;
      break;
    case "k":
    case "K":
      action = enterRevealsHere(state) ? { type: PARK } : null;
      break;
    case "m":
    case "M":
      action = { type: TOGGLE_AUDIO };
      break;
    case "f":
    case "F":
      action = state.fullscreenActive === true
        ? { type: EXIT_FULLSCREEN }
        : { type: REQUEST_FULLSCREEN };
      break;
    case "Escape":
      action = state.help?.open
        ? { type: CLOSE_HELP }
        : state.fullscreenActive
          ? { type: EXIT_FULLSCREEN }
          : null;
      break;
    case "h":
    case "H":
      action = state.hud?.visible
        ? { type: HUD_HIDE, releaseFocus: true, suppress: true }
        : { type: HUD_SHOW, restore: true };
      break;
    case "?":
      action = state.help?.open
        ? { type: CLOSE_HELP }
        : state.pairingOpen === true
          ? null
          : { type: OPEN_HELP, returnFocusId: returnFocusId(event) };
      break;
    default:
      action = null;
  }

  if (action && isSetupPhase(state.phase) && !SETUP_ALLOWED_ACTIONS.has(action.type)) {
    return null;
  }
  return action;
}

export const handleKeyboardEvent = mapKeyboardEvent;
