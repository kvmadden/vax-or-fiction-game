import type { GamePhase } from '../data/types';
import { canonicalReaction } from './reactions';
import { isSetupPhase, UNREVEALED_PHASES } from './state-machine';

export type ActiveAudioRole =
  | 'walkin'
  | 'menu-soft'
  | 'deliberate'
  | 'fork-choice'
  | 'countdown'
  | 'reveal'
  | 'showdown'
  | 'closing';

export interface AudioLifecycleInput {
  phase: GamePhase | string;
  timerRunning: boolean;
  timerRemainingMs?: number;
  /** Authored duration so a 20s Teams clock is not treated as a 30s final stretch. */
  timerDurationMs?: number;
  votesLocked?: boolean;
  showdownStage?: 'lineup' | 'duel' | 'result' | null;
  transition?: GamePhase | string | null;
  /** Current slide type/id so title/instructions never inherit a leftover question bed. */
  slideType?: string | null;
}

export interface AudioLifecycleDecision {
  role: ActiveAudioRole;
  loop: boolean;
}

/**
 * Musical countdown.mp3 is a long bed, not a tick. Room Curated 15 is a 30s
 * clock, so a 30s window would replace the question bed for the entire vote.
 * Only the last 10s of a *longer* authored clock may take that bed.
 */
export const FINAL_COUNTDOWN_WINDOW_MS = 10_000;
/** Clocks at or under 30s (room Curated 15, Teams 20s) stay on deliberate. */
export const COUNTDOWN_BED_MIN_DURATION_MS = 30_000;
/** Timer-pulse SFX window. Matches the short final stretch, not the whole 30s. */
export const TIMER_TICK_WINDOW_MS = 10_000;

/**
 * VOF-86: only these stings dip the music. Phone reactions, the timer ticks and five-second warning, the lock click
 * and taps play over the music and never dip it.
 */
export const DUCKING_STINGS: ReadonlySet<string> = new Set([
  'reveal-a',
  'reveal-b',
  'transition-1',
  'transition-2',
  'transition-3',
  'streak-lift',
  'myth-busted',
]);

/** How far a sting dips the music: about 12 dB (VOF-86), applied once, on the duck stage. */
export const STING_DUCK_LEVEL = 0.25;

export function stingDucksMusic(role: string): boolean {
  return DUCKING_STINGS.has(String(role));
}

/**
 * Musical countdown owns the last seconds only when the authored clock is
 * meaningfully longer than that window. Missing duration must not imply a
 * long clock: that made a 30s room timer play countdown.mp3 the whole vote.
 */
export function shouldPlayCountdownBed(input: {
  timerRunning: boolean;
  timerRemainingMs?: number;
  timerDurationMs?: number;
}): boolean {
  if (!input.timerRunning) return false;
  if (typeof input.timerRemainingMs !== 'number' || input.timerRemainingMs <= 0) return false;
  if (input.timerRemainingMs > FINAL_COUNTDOWN_WINDOW_MS) return false;
  if (typeof input.timerDurationMs !== 'number' || !Number.isFinite(input.timerDurationMs)) return false;
  if (input.timerDurationMs <= COUNTDOWN_BED_MIN_DURATION_MS) return false;
  if (input.timerDurationMs <= FINAL_COUNTDOWN_WINDOW_MS) return false;
  return true;
}

/** Lobby and the title card keep Smile. Instructions and Q1 must not. */
export function isWalkinSurface(phase: GamePhase | string, slideType?: string | null): boolean {
  const kind = String(slideType ?? '').toLowerCase();
  const current = String(phase ?? '');
  return current === 'lobby' || current === 'title' || kind === 'title';
}

/**
 * transition-1 is the leave-lobby sting for a non-walk-in destination.
 * Lobby → title keeps Smile, so a whoosh on top of the vocal would stack.
 */
export function shouldPlayEnterTransitionSfx(input: {
  prevPhase: GamePhase | string | null;
  phase: GamePhase | string;
  slideType?: string | null;
}): boolean {
  const prev = String(input.prevPhase ?? '');
  const next = String(input.phase ?? '');
  if (!prev || prev === next) return false;
  if (next !== 'entering') return false;
  if (prev !== 'lobby' && prev !== 'preFlight') return false;
  return !isWalkinSurface(next, input.slideType);
}

/**
 * Maps presenter-visible state to one active media role. Returning null is an
 * explicit stop. Lyrics only on walkin (title/lobby).
 *
 * Soft bed stays on under lock / timedOut / explaining so the room never goes
 * dead-silent between SFX. Revealed stays silent (reveal sting owns that beat).
 * Showdown result stays silent until closing. The closing bed loops until the
 * host ends the show (VOF-86), so the room is never silent after its first pass.
 *
 * Quiet bed: entering / leaderboard / focus use menu-soft between questions.
 * Lyrics stay on walkin only (lobby + title card). A leftover deliberating phase
 * under a static slide must not restart countdown or the question bed.
 */
export function getAudioLifecycleDecision(input: AudioLifecycleInput): AudioLifecycleDecision | null {
  const { phase, timerRunning, timerRemainingMs, timerDurationMs, votesLocked, showdownStage, slideType } = input;
  const kind = String(slideType ?? '').toLowerCase();

  if (isSetupPhase(phase)) return { role: 'menu-soft', loop: true };
  if (isWalkinSurface(phase, kind)) return { role: 'walkin', loop: true };
  if (phase === 'instructions' || kind === 'instructions') return { role: 'menu-soft', loop: true };
  if (phase === 'showdown' || kind === 'showdown') {
    return showdownStage === 'result' ? null : { role: 'showdown', loop: true };
  }
  if (phase === 'closing' || phase === 'outro' || kind === 'closing' || kind === 'outro') {
    return { role: 'closing', loop: true };
  }
  if (kind === 'focus' || kind === 'halftime') return { role: 'menu-soft', loop: true };
  if (phase === 'fork' || kind === 'fork') return { role: 'fork-choice', loop: true };
  if (phase === 'entering' || phase === 'leaderboard') return { role: 'menu-soft', loop: true };

  if (phase === 'revealed') {
    // Reveal-a (default) / reveal-b (majority wrong) SFX own this beat. A second
    // reveal bed under the sting stacked in the room.
    return null;
  }

  // Keep a quiet bed under lock / explain so the host never hits dead air mid-show.
  if (phase === 'locked' || phase === 'timedOut' || phase === 'explaining') {
    return { role: 'menu-soft', loop: true };
  }

  if (phase !== 'deliberating') return null;

  // Votes locked (or clock spent) while phase still says deliberating: soft bed, not silence.
  if (votesLocked || timerRemainingMs === 0) return { role: 'menu-soft', loop: true };

  if (shouldPlayCountdownBed({ timerRunning, timerRemainingMs, timerDurationMs })) {
    return { role: 'countdown', loop: false };
  }

  return { role: 'deliberate', loop: true };
}

/**
 * Lock SFX follows votesLocked / timedOut, not store phase === 'locked'.
 * LOCK_VOTES and TIME_EXPIRED close the vote while the host phase stays deliberating.
 * When ADVANCE settles straight to revealed (offline open-question), reveal-a|b owns
 * the beat — do not stack answer-lock on the same tick.
 */
export function shouldPlayLockSfx(input: {
  unlocked: boolean;
  votesLocked?: boolean;
  phase: GamePhase | string;
  wasLockCue: boolean;
}): { play: boolean; nextLockCue: boolean } {
  const phase = String(input.phase ?? '');
  const revealOwns = phase === 'revealed' || phase === 'explaining';
  const lockCueOn =
    Boolean(input.votesLocked) || phase === 'locked' || phase === 'timedOut' || revealOwns;
  return {
    play: Boolean(input.unlocked) && lockCueOn && !input.wasLockCue && !revealOwns,
    nextLockCue: lockCueOn,
  };
}

export function reactionMomentKey(moment: {
  reaction?: string;
  type?: string;
  icon?: string;
} | null | undefined): string {
  return String(moment?.reaction || moment?.type || moment?.icon || '');
}

export function reactionSfxRole(key: string): string | null {
  const canonical = canonicalReaction(key);
  if (/wait/i.test(canonical)) return 'reaction-wait-really';
  if (/knew/i.test(canonical)) return 'reaction-knew-it';
  if (/we.?do|do.?this/i.test(canonical)) return 'reaction-we-do-this';
  return null;
}

/** How long a persisted or remounted reactionMoment may still cue a sting. */
export const REACTION_SFX_FRESHNESS_MS = 2_500;

/**
 * Play only a live, enabled tap. Unmute, remount, and host reload must not
 * dump a leftover reactionMoment as a second companion sting.
 */
export function shouldPlayReactionSfx(input: {
  unlocked: boolean;
  enabled: boolean;
  firedAt: number;
  lastPlayedAt: number | null;
  now?: number;
  freshnessMs?: number;
}): { play: boolean; nextLastPlayedAt: number | null } {
  const firedAt = Number(input.firedAt);
  if (!Number.isFinite(firedAt) || firedAt <= 0) {
    return { play: false, nextLastPlayedAt: input.lastPlayedAt };
  }
  if (input.lastPlayedAt === firedAt) {
    return { play: false, nextLastPlayedAt: input.lastPlayedAt };
  }
  const now = input.now ?? Date.now();
  const freshnessMs = input.freshnessMs ?? REACTION_SFX_FRESHNESS_MS;
  if (!input.unlocked || !input.enabled || now - firedAt > freshnessMs) {
    return { play: false, nextLastPlayedAt: firedAt };
  }
  return { play: true, nextLastPlayedAt: firedAt };
}

/** On unlock, treat the current clock as already seen so unmute does not dump leftover pulses. */
export function seedTimerCues(remainingMs?: number): { warnedFive: boolean; pulseSec: number | null } {
  if (typeof remainingMs !== 'number') return { warnedFive: false, pulseSec: null };
  return {
    warnedFive: remainingMs <= 5_000,
    pulseSec: remainingMs <= TIMER_TICK_WINDOW_MS && remainingMs > 0 ? Math.ceil(remainingMs / 1000) : null,
  };
}

/**
 * RESTART_TIMER and ADD_TIME can jump remainingMs up while the clock stays running.
 * Clear spent warning/pulse refs so the new pass still fires companion cues.
 */
export function rearmTimerCues(
  remainingMs: number,
  current: { warnedFive: boolean; pulseSec: number | null },
): { warnedFive: boolean; pulseSec: number | null } {
  return {
    warnedFive: remainingMs > 5_000 ? false : current.warnedFive,
    pulseSec: remainingMs > TIMER_TICK_WINDOW_MS ? null : current.pulseSec,
  };
}

/** Same resolution ScreenRouter uses, plus a leftover halftime flag. */
export function slideAudioKind(slide: {
  type?: string;
  kind?: string;
  id?: string;
  halftime?: unknown;
} | null | undefined): string | null {
  if (!slide) return null;
  if (slide.halftime === true) return 'halftime';
  const raw = String(slide.type || slide.kind || slide.id || '').toLowerCase();
  return raw || null;
}

/**
 * Reveal-a / reveal-b owns the beat exactly once, whichever way a phase reaches it. A room walks
 * 'revealed' as its own screen (BACK re-entering it from 'explaining' must not re-sting). Solo settles
 * REVEAL and ADVANCE together in one render (VOF-W7), so it never renders 'revealed' on its own -- the
 * first paint after a vote is a direct jump from a voting phase straight into 'explaining'. `solo` scopes
 * that direct-jump case to solo only, so a room taking the same phase values never takes it.
 */
export function shouldPlayRevealSfx(input: {
  prevPhase: GamePhase | string | null;
  phase: GamePhase | string;
  solo?: boolean;
}): boolean {
  const prev = input.prevPhase;
  if (!prev || prev === input.phase) return false;
  if (input.phase === 'revealed') return prev !== 'explaining';
  if (input.solo && input.phase === 'explaining') return UNREVEALED_PHASES.has(prev as GamePhase);
  return false;
}

/**
 * transition-2 owns entering 'explaining' the normal way, from 'revealed'. Solo's own direct jump from a
 * voting phase into 'explaining' already got its beat from shouldPlayRevealSfx above, on the same render, so
 * this skips it there -- a room taking any other route into 'explaining' still gets transition-2.
 */
export function shouldPlayExplainTransitionSfx(input: {
  prevPhase: GamePhase | string | null;
  phase: GamePhase | string;
  solo?: boolean;
}): boolean {
  if (input.phase !== 'explaining') return false;
  const prev = input.prevPhase;
  if (input.solo && prev && UNREVEALED_PHASES.has(prev as GamePhase)) return false;
  return true;
}

/** Reveal-b is the companion sting for a room that mostly missed. Keys off question id. */
export function isMajorityWrongReveal(state: {
  run?: Array<{ id?: string; questionId?: string }> | null;
  slideIndex?: number;
  roomStats?: { questions?: Record<string, { majorityWrong?: boolean }> } | null;
}): boolean {
  const slide = state.run?.[state.slideIndex ?? -1];
  const qid = String(slide?.id ?? slide?.questionId ?? '');
  return Boolean(qid && state.roomStats?.questions?.[qid]?.majorityWrong);
}
