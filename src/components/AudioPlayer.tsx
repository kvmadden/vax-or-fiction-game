import React, { useEffect, useRef } from 'react';
import { canPlaySfx, BED_FADE_MS, useAudioStore } from '../engine/audio-store';
import {
  getAudioLifecycleDecision,
  isMajorityWrongReveal,
  reactionMomentKey,
  reactionSfxRole,
  rearmTimerCues,
  seedTimerCues,
  shouldPlayCountdownBed,
  shouldPlayEnterTransitionSfx,
  shouldPlayLockSfx,
  shouldPlayExplainTransitionSfx,
  shouldPlayReactionSfx,
  shouldPlayRevealSfx,
  slideAudioKind,
  STING_DUCK_LEVEL,
  stingDucksMusic,
  TIMER_TICK_WINDOW_MS,
} from '../engine/audio-lifecycle';
import { soundtrack, unlockWarmRoles, warmEarlyMusic } from '../engine/music-warm';
import { reactionsAreEnabled } from '../engine/reactions';
import { useGameStore } from '../store/game-store';

const SFX_DUCK_HOLD_MS = 640;
/** Survives AudioPlayer remount so a leftover reactionMoment cannot sting twice. */
let lastPlayedReactionAt: number | null = null;
/** Unlock bed warm runs once per page lifetime — not on every phase churn. */
let unlockBedsWarmed = false;

/**
 * A sting dips the music about 12 dB while it plays (VOF-86). Every other cue (phone reactions, the timer ticks and
 * five-second warning, the lock click) plays over the music and leaves it where it is.
 */
function playCue(role: string, volume = 0.85) {
  if (!canPlaySfx(role)) return;
  const store = useAudioStore.getState();
  // Fire duck + SFX together — awaiting duck would wait until bed recovers first.
  if (stingDucksMusic(role)) void store.duck(SFX_DUCK_HOLD_MS, STING_DUCK_LEVEL);
  void store.playSfx(role, { volume });
}

export interface AudioPlayerProps {
  /** Solo play (VOF-W7): scopes the direct-jump reveal sting to solo's own combined reveal. Room mount
   *  (PresentationSuite) never passes this, so its own reveal-sting behavior stays exactly as it was. */
  solo?: boolean;
  /**
   * No round is open (solo's topic picker), so no bed plays. The closing bed loops until the show ends (VOF-86), and
   * leaving a solo close for the topics keeps the game store on its closing phase, so without this the closing bed
   * would loop on under the topic list.
   */
  idle?: boolean;
}

export const AudioPlayer: React.FC<AudioPlayerProps> = ({ solo = false, idle = false }) => {
  const unlocked = useAudioStore((state) => state.unlocked);
  const unlock = useAudioStore((state) => state.unlock);
  const phase = useGameStore((state) => state.phase);
  const timerRunning = useGameStore((state) => state.timer.running);
  const timerRemainingMs = useGameStore((state) => state.timer.remainingMs);
  const timerDurationMs = useGameStore((state) => state.timer.durationMs);
  const votesLocked = useGameStore((state) => state.votesLocked);
  const slideType = useGameStore((state) => slideAudioKind(state.run?.[state.slideIndex]));
  const showdownStage = useGameStore((state) => state.showdown?.stage ?? null);
  const reactionMoment = useGameStore((state) => state.reactionMoment);
  const reactionsEnabled = useGameStore(reactionsAreEnabled);
  const roomStreak = useGameStore((state) => state.roomStats?.streak ?? 0);
  const majorityWrong = useGameStore((state) => isMajorityWrongReveal(state));
  const priorPhase = useRef<typeof phase | null>(null);
  const priorDecisionKey = useRef<string | null>(null);
  const priorForSfx = useRef<typeof phase | null>(null);
  const warnedFive = useRef(false);
  const lastPulseSec = useRef<number | null>(null);
  const lastStreakCue = useRef(0);
  const priorLockCue = useRef(false);
  const streakSeeded = useRef(false);
  const timerCuesSeeded = useRef(false);
  const priorTimerRunning = useRef(false);
  const priorSlideKind = useRef<string | null>(null);

  // App warms these beds at load (music-warm.ts). This is the safety net for a remount after destroy. Idempotent.
  useEffect(() => {
    warmEarlyMusic(solo ? 'solo' : 'host-show');
  }, [solo]);

  useEffect(() => {
    if (!unlocked) {
      priorDecisionKey.current = null;
      priorPhase.current = null;
      return;
    }
    // Let walk-in's first media fill claim bandwidth; then warm the rest once.
    if (!unlockBedsWarmed) {
      unlockBedsWarmed = true;
      setTimeout(() => {
        useAudioStore.getState().prefetchMusic([...unlockWarmRoles(solo)], soundtrack);
      }, 1600);
    }
    const wasPhase = priorPhase.current;
    const decision = idle ? null : getAudioLifecycleDecision({
      phase,
      timerRunning,
      timerRemainingMs,
      timerDurationMs,
      votesLocked,
      showdownStage,
      slideType,
      transition: wasPhase === phase ? null : phase,
    });
    priorPhase.current = phase;

    if (phase === 'revealed' && wasPhase === phase) return;

    const decisionKey = decision ? `${decision.role}:${decision.loop}` : 'stop';
    if (decisionKey === priorDecisionKey.current) return;
    priorDecisionKey.current = decisionKey;

    if (decision) {
      void useAudioStore.getState().transitionMusic(decision.role, soundtrack, {
        loop: decision.loop,
        fadeDurationMs: BED_FADE_MS,
      });
    } else {
      // The bed fades out under the reveal sting on its own level, then stops (VOF-86). The sting's duck works on a
      // separate stage, so it can no longer cancel this fade and hard-cut the bed.
      useAudioStore.getState().releaseMusic(BED_FADE_MS);
    }
  }, [idle, solo, phase, showdownStage, slideType, timerDurationMs, timerRemainingMs, timerRunning, unlocked, votesLocked]);

  useEffect(() => {
    const { play, nextLockCue } = shouldPlayLockSfx({
      unlocked,
      votesLocked,
      phase,
      wasLockCue: priorLockCue.current,
    });
    priorLockCue.current = nextLockCue;
    if (play) void playCue('answer-lock');
  }, [phase, unlocked, votesLocked]);

  useEffect(() => {
    const kind = slideType ?? null;
    if (!unlocked) {
      priorForSfx.current = phase;
      priorSlideKind.current = kind;
      return;
    }
    const prev = priorForSfx.current;
    const prevKind = priorSlideKind.current;
    priorForSfx.current = phase;
    priorSlideKind.current = kind;
    const phaseChanged = Boolean(prev && prev !== phase);
    const kindChanged = Boolean(prevKind && prevKind !== kind);
    if (!phaseChanged && !kindChanged) return;
    if (phaseChanged) {
      if (shouldPlayEnterTransitionSfx({ prevPhase: prev, phase, slideType: kind })) {
        void playCue('transition-1', 0.7);
      }
      // BACK from explanation re-enters revealed. Do not re-sting as a new reveal. Solo's own combined
      // reveal never renders 'revealed' on its own (REVEAL and ADVANCE batch into one render, VOF-W7), so
      // shouldPlayRevealSfx also catches solo's direct jump from a voting phase into 'explaining' -- a room
      // taking the same phase values never does, since `solo` is false there.
      if (shouldPlayRevealSfx({ prevPhase: prev, phase, solo })) void playCue(majorityWrong ? 'reveal-b' : 'reveal-a');
      if (shouldPlayExplainTransitionSfx({ prevPhase: prev, phase, solo })) void playCue('transition-2', 0.65);
    }
    // Lifecycle keys off slideType as well as phase, so embedded closing/showdown
    // cards must sting even when the store stays on entering.
    const enteredShowdown = (phaseChanged && phase === 'showdown') || (kindChanged && kind === 'showdown' && phase !== 'showdown');
    if (enteredShowdown) void playCue('transition-3', 0.7);
    const enteredClosing =
      (phaseChanged && (phase === 'closing' || phase === 'outro')) ||
      (kindChanged && (kind === 'closing' || kind === 'outro') && phase !== 'closing' && phase !== 'outro');
    if (enteredClosing) void playCue('myth-busted', 0.75);
  }, [majorityWrong, phase, slideType, solo, unlocked]);

  useEffect(() => {
    if (!reactionMoment) return;
    const at = Number(reactionMoment.firedAt ?? reactionMoment.at ?? 0);
    const { play, nextLastPlayedAt } = shouldPlayReactionSfx({
      unlocked,
      enabled: reactionsEnabled,
      firedAt: at,
      lastPlayedAt: lastPlayedReactionAt,
    });
    lastPlayedReactionAt = nextLastPlayedAt;
    if (!play) return;
    const role = reactionSfxRole(reactionMomentKey(reactionMoment));
    if (role) void playCue(role, 0.7);
  }, [reactionMoment, reactionsEnabled, unlocked]);

  // Streak milestones 3 and 5 → companion streak-lift (replaces oscillator-only chime for these).
  useEffect(() => {
    if (!unlocked) {
      streakSeeded.current = false;
      return;
    }
    if (!streakSeeded.current) {
      lastStreakCue.current = roomStreak;
      streakSeeded.current = true;
      return;
    }
    if ((roomStreak === 3 || roomStreak === 5) && roomStreak !== lastStreakCue.current) {
      lastStreakCue.current = roomStreak;
      void playCue('streak-lift', 0.8);
    }
    if (roomStreak < lastStreakCue.current) lastStreakCue.current = 0;
  }, [roomStreak, unlocked]);

  useEffect(() => {
    if (timerRunning && !priorTimerRunning.current) timerCuesSeeded.current = false;
    priorTimerRunning.current = Boolean(timerRunning);
    if (!unlocked || !timerRunning || votesLocked) {
      if (!unlocked) timerCuesSeeded.current = false;
      else {
        warnedFive.current = false;
        lastPulseSec.current = null;
      }
      return;
    }
    if (!timerCuesSeeded.current) {
      const seeded = seedTimerCues(timerRemainingMs);
      warnedFive.current = seeded.warnedFive;
      lastPulseSec.current = seeded.pulseSec;
      timerCuesSeeded.current = true;
      return;
    }
    if (typeof timerRemainingMs !== 'number') return;
    const rearmed = rearmTimerCues(timerRemainingMs, {
      warnedFive: warnedFive.current,
      pulseSec: lastPulseSec.current,
    });
    warnedFive.current = rearmed.warnedFive;
    lastPulseSec.current = rearmed.pulseSec;
    if (timerRemainingMs <= 5_000 && !warnedFive.current) {
      warnedFive.current = true;
      void playCue('five-second-warning', 0.7);
    }
    // Musical countdown owns the last seconds of a long clock. Ticks only
    // accompany the deliberation bed (30s room timer stays on deliberate).
    if (shouldPlayCountdownBed({ timerRunning, timerRemainingMs, timerDurationMs })) {
      lastPulseSec.current = Math.ceil(timerRemainingMs / 1000);
      return;
    }
    if (timerRemainingMs <= TIMER_TICK_WINDOW_MS && timerRemainingMs > 0) {
      const sec = Math.ceil(timerRemainingMs / 1000);
      if (lastPulseSec.current !== null && sec < lastPulseSec.current) {
        void playCue('timer-pulse', 0.4);
      }
      lastPulseSec.current = sec;
    }
  }, [timerDurationMs, timerRemainingMs, timerRunning, unlocked, votesLocked]);

  useEffect(() => {
    if (unlocked) return;
    const handleInteraction = () => { unlock(); };
    const events = ['click', 'touchstart', 'keydown'];
    events.forEach((event) => document.addEventListener(event, handleInteraction, { once: true }));
    return () => events.forEach((event) => document.removeEventListener(event, handleInteraction));
  }, [unlocked, unlock]);

  useEffect(() => () => {
    // Keep the singleton context and mute flag. Destroying here made HUD unmute
    // look live after a remount while beds could not start.
    useAudioStore.getState().stopMusic();
  }, []);

  return null;
};
