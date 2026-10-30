import { isTerminalSlide, QUESTION_KINDS } from './kinds';
import { isSetupPhase } from './state-machine';
import { useAudioStore } from './audio-store';

/** Soft UI confirmation for setup/options/deck/mode picks. Mute + reduced-motion aware via playSfx. */
export function tapUi() {
  void useAudioStore.getState().playSfx('ui-tap', { volume: 0.55 });
}

/** Presenter primary controls (reveal / advance / lock). */
export function tapPrimary() {
  void useAudioStore.getState().playSfx('ui-tap', { volume: 0.7 });
}

/** Answer chip / phone vote confirmation. */
export function tapAnswer() {
  void useAudioStore.getState().playSfx('ui-tap', { volume: 0.65 });
}

/**
 * HUD Next must not fire ui-tap when AudioPlayer already owns a phase sting:
 * leave-lobby (non-title) → transition-1, explaining → transition-2, showdown enter → transition-3,
 * closing/outro → myth-busted. Title Next is silent because the walk-in fade owns that beat.
 * Lock and Reveal never tap; those are answer-lock / reveal-a|b.
 * Open live questions (entering or deliberating) settle to reveal on ADVANCE — offline in one
 * tick — so AudioPlayer owns answer-lock + reveal and ui-tap must stay off.
 */
export function shouldTapPrimaryOnAdvance(
  phase: string | null | undefined,
  extras?: { votesLocked?: boolean; offlineMode?: boolean; slideType?: string | null },
): boolean {
  const current = String(phase ?? '');
  if (isSetupPhase(current)) return false;
  if (current === 'lobby' || current === 'revealed' || current === 'showdown' || current === 'closing' || current === 'outro') return false;
  const kind = String(extras?.slideType ?? '').toLowerCase();
  // Title keeps Smile. The walk-in fade onto instructions owns that beat, so skip ui-tap.
  if (current === 'title' || kind === 'title') return false;
  const openVotes = extras?.votesLocked === false;
  const liveQuestion = (QUESTION_KINDS as readonly string[]).includes(kind);
  // Open deliberating always settles via answer-lock / reveal. Entering on a live
  // question does too (offline skips the lock beat and reveals in the same ADVANCE).
  if (openVotes && (current === 'deliberating' || (current === 'entering' && liveQuestion))) {
    return false;
  }
  return true;
}

/** SKIP off the last live question enters showdown or closing; those stings already own the beat. */
export function skipEntersFinale(run: readonly unknown[] | undefined, slideIndex: number | undefined): boolean {
  if (!Array.isArray(run) || typeof slideIndex !== 'number' || slideIndex < 0) return false;
  if (slideIndex >= run.length - 1) return true;
  return isTerminalSlide(run[slideIndex + 1]);
}

export function shouldTapPrimaryOnSkip(run: readonly unknown[] | undefined, slideIndex: number | undefined): boolean {
  return !skipEntersFinale(run, slideIndex);
}

/** Keyboard path must match HUD clicks: same action, same cue, never a stacked lock/reveal tap. */
export function cuePresenterKeyboardAction(
  actionType: string,
  extras?: {
    phase?: string | null;
    votesLocked?: boolean;
    offlineMode?: boolean;
    slideType?: string | null;
    run?: readonly unknown[];
    slideIndex?: number;
  },
): void {
  switch (actionType) {
    case 'ADVANCE':
      if (shouldTapPrimaryOnAdvance(extras?.phase, extras)) tapPrimary();
      return;
    case 'BACK':
      tapPrimary();
      return;
    case 'SKIP':
      if (shouldTapPrimaryOnSkip(extras?.run, extras?.slideIndex)) tapPrimary();
      return;
    case 'PARK':
    case 'TOGGLE_TIMER':
    case 'TOGGLE_PAUSE':
    case 'ADD_TIME':
    case 'RESTART_TIMER':
    case 'OPEN_HELP':
    case 'CLOSE_HELP':
    case 'HUD_SHOW':
    case 'HUD_HIDE':
    case 'REQUEST_FULLSCREEN':
    case 'EXIT_FULLSCREEN':
    case 'REQUEST_RESTART_RUN':
      tapUi();
      return;
    case 'LOCK_VOTES':
    case 'REVEAL':
    case 'TOGGLE_AUDIO':
    case 'CONFIRM_RESTART_RUN':
    case 'CANCEL_RESTART_RUN':
    case 'TOGGLE_DISCUSSION':
      return;
    default:
      return;
  }
}
