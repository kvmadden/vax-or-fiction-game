import { useEffect } from 'react';
import { create } from 'zustand';

/**
 * Landing-page walk-in music (VOF-W9). Fully separate from the show's engine
 * (src/engine/audio-store.ts): its own element, its own state, its own preference.
 * It never reads or writes vrc_audio_muted, and toggling it here must never change
 * what a room or a solo run hears.
 */

// Must match the manifest's walkin/title-lobby path (public/assets/audio/manifest.json)
// and src/components/AudioPlayer.tsx's soundtrack.walkin.path. Smile, Take 3.
export const LANDING_WALKIN_PATH = '/assets/audio/vax-or-fiction/walkin.mp3';

const FADE_MS = 900;
const TARGET_LEVEL = 0.5;
const FADE_STEP_MS = 40;

interface LandingMusicState {
  /** True once a tap has started playback (or asked it to start). Off on every load, always. */
  playing: boolean;
}

interface LandingMusicActions {
  toggle: () => void;
  stop: () => void;
  /** Immediate, no fade. For leaving the page, a fade is wasted motion on the way out. */
  hardStop: () => void;
}

let element: HTMLAudioElement | null = null;
let fadeHandle: ReturnType<typeof setInterval> | null = null;
let audioCtx: AudioContext | null = null;
let gainNode: GainNode | null = null;
let sourceNode: MediaElementAudioSourceNode | null = null;

/**
 * Bumped on every start and on every hardStop, never on a plain stop (the stop belongs to
 * the attempt it interrupts). A start's own .then/.catch and its fade close over the attempt
 * number they were issued under, so a stray callback from an abandoned attempt can never act
 * on a newer one, and a start clears any fade left running by the attempt before it.
 */
let attempt = 0;

function clearFade() {
  if (fadeHandle !== null) {
    clearInterval(fadeHandle);
    fadeHandle = null;
  }
}

interface NavigatorWithAudioSession extends Navigator {
  audioSession?: { type: string };
}

/**
 * Routing through Web Audio (the GainNode above) puts this track under the iPhone's silent
 * switch unless the session is explicitly marked playback. Feature-detected, and only ever
 * called from inside the tap that starts playback below, never on load or on an unrelated
 * gesture, so this never asks for a playback session before the user has actually asked for one.
 */
function applyPlaybackAudioSession() {
  if (typeof navigator === 'undefined') return;
  const nav = navigator as NavigatorWithAudioSession;
  if (!nav.audioSession) return;
  try {
    nav.audioSession.type = 'playback';
  } catch {
    /* ignore */
  }
}

function getAudioContextClass(): typeof AudioContext | null {
  if (typeof window === 'undefined') return null;
  return (
    window.AudioContext ||
    (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext ||
    null
  );
}

/**
 * iOS Safari silently ignores HTMLMediaElement.volume: the setter takes it, but the getter
 * keeps returning 1 no matter what was assigned, and the actual output never changes. That is
 * the bug the review caught, the fade never happened, playback stayed at full volume, and the
 * button read "off" for up to 900ms while sound kept playing. A GainNode wired through Web
 * Audio is the standard fix, the same one the show engine uses (src/engine/audio-store.ts).
 * Created lazily, on the tap, so no AudioContext exists before a real user gesture.
 */
function ensureGain(audio: HTMLAudioElement): GainNode | null {
  if (gainNode) {
    // A screen lock or an incoming call can suspend the context between taps. Only resuming it
    // at creation left a later tap's play() succeeding in silence while the button read on.
    if (audioCtx && audioCtx.state !== 'running') {
      void audioCtx.resume().catch(() => {});
    }
    return gainNode;
  }
  const AudioContextClass = getAudioContextClass();
  if (!AudioContextClass) return null;
  try {
    audioCtx = audioCtx ?? new AudioContextClass();
    if (audioCtx.state === 'suspended') void audioCtx.resume().catch(() => {});
    const gain = audioCtx.createGain();
    gain.gain.value = 0;
    gain.connect(audioCtx.destination);
    sourceNode = audioCtx.createMediaElementSource(audio);
    sourceNode.connect(gain);
    gainNode = gain;
    return gain;
  } catch {
    gainNode = null;
    return null;
  }
}

/** Probes whether audio.volume actually holds, for the rare runtime with no Web Audio at all. */
function canSetElementVolume(audio: HTMLAudioElement): boolean {
  try {
    const probe = 0.42;
    const original = audio.volume;
    audio.volume = probe;
    const works = Math.abs(audio.volume - probe) < 0.01;
    audio.volume = original;
    return works;
  } catch {
    return false;
  }
}

type FadeTarget =
  | { kind: 'gain'; node: GainNode }
  | { kind: 'volume'; audio: HTMLAudioElement }
  | { kind: 'none' };

/**
 * GainNode when Web Audio is available (real browsers, including iOS). A plain volume fade
 * only when that is genuinely impossible but element.volume still measurably works. Otherwise
 * 'none': nothing here can make a fade truthful, so start and stop below skip it outright
 * rather than show a button state the sound does not match.
 */
function resolveFadeTarget(audio: HTMLAudioElement): FadeTarget {
  const gain = ensureGain(audio);
  if (gain) return { kind: 'gain', node: gain };
  if (canSetElementVolume(audio)) return { kind: 'volume', audio };
  return { kind: 'none' };
}

function readLevel(target: FadeTarget): number {
  if (target.kind === 'gain') return target.node.gain.value;
  if (target.kind === 'volume') return target.audio.volume;
  return 1;
}

function writeLevel(target: FadeTarget, value: number) {
  if (target.kind === 'gain') target.node.gain.value = value;
  else if (target.kind === 'volume') target.audio.volume = value;
}

function fadeTo(target: FadeTarget, to: number, durationMs: number, isCurrent: () => boolean, onDone?: () => void) {
  clearFade();
  if (target.kind === 'none') {
    onDone?.();
    return;
  }
  const from = readLevel(target);
  const steps = Math.max(1, Math.round(durationMs / FADE_STEP_MS));
  let step = 0;
  fadeHandle = setInterval(() => {
    if (!isCurrent()) {
      clearFade();
      return;
    }
    step += 1;
    const t = Math.min(1, step / steps);
    writeLevel(target, from + (to - from) * t);
    if (t >= 1) {
      clearFade();
      onDone?.();
    }
  }, FADE_STEP_MS);
}

/** Lazy, the element (and so the first byte of the track) is created on the first tap, not on load. */
function getElement(): HTMLAudioElement {
  if (!element) {
    element = new Audio(LANDING_WALKIN_PATH);
    element.loop = true;
  }
  return element;
}

/** Test-only reset so unit and integration suites do not carry a module-level element across cases. */
export function resetLandingMusicForTests() {
  useLandingMusicStore.getState().hardStop();
  element = null;
  if (audioCtx) {
    try {
      void audioCtx.close?.();
    } catch {
      /* ignore */
    }
  }
  audioCtx = null;
  gainNode = null;
  sourceNode = null;
}

export const useLandingMusicStore = create<LandingMusicState & LandingMusicActions>((set, get) => ({
  playing: false,

  toggle: () => {
    if (get().playing) {
      get().stop();
      return;
    }
    // A stop's fade may still be ticking down from an on/off tap inside the last 900ms.
    // Clearing it here, before this attempt takes over, is what keeps that old fade from
    // pausing the new playback out from under this tap.
    clearFade();
    applyPlaybackAudioSession();
    const myAttempt = ++attempt;
    const audio = getElement();
    const target = resolveFadeTarget(audio);
    writeLevel(target, 0);
    set({ playing: true });
    const settle = () => {
      if (myAttempt !== attempt || !get().playing) return;
      fadeTo(target, TARGET_LEVEL, FADE_MS, () => myAttempt === attempt);
    };
    const playPromise = audio.play();
    if (playPromise && typeof playPromise.then === 'function') {
      playPromise
        .then(settle)
        .catch(() => {
          // Autoplay/gesture rejection: fall silent, quietly. Browser rules, not a bug.
          if (myAttempt !== attempt) return;
          set({ playing: false });
        });
    } else {
      settle();
    }
  },

  stop: () => {
    const stopAttempt = attempt;
    if (!get().playing) {
      clearFade();
      if (element) {
        try {
          element.pause();
        } catch {
          /* ignore */
        }
      }
      return;
    }
    set({ playing: false });
    const audio = element;
    if (!audio) return;
    const target = resolveFadeTarget(audio);
    if (target.kind === 'none') {
      // Nothing here can fade truthfully, so pause immediately. The button already reads
      // off the moment this runs, and sound must stop with it, not up to 900ms later.
      audio.pause();
      return;
    }
    fadeTo(
      target,
      0,
      FADE_MS,
      () => stopAttempt === attempt,
      () => {
        if (stopAttempt === attempt) audio.pause();
      },
    );
  },

  hardStop: () => {
    // Orphans any in-flight play()/fade from the attempt this interrupts, so a late .then or
    // .catch from it can never resurrect this element after the page is on its way out.
    attempt += 1;
    clearFade();
    if (get().playing) set({ playing: false });
    if (element) {
      try {
        element.pause();
      } catch {
        /* ignore */
      }
    }
  },
}));

/**
 * The one lifecycle a mounted toggle needs, shared so the real Entry screen and the DEV-only
 * unmount-proof harness (src/review/LandingMusicLifecycleHarness.tsx) run the exact same code.
 * A full navigation off the entry screen tears this down on its own, but a plain footer link,
 * the back button restoring the page from bfcache, or a future in-page unmount all need the
 * explicit stop below, on pagehide and on unmount alike.
 */
export function useLandingMusicLifecycle() {
  const hardStop = useLandingMusicStore((state) => state.hardStop);
  useEffect(() => {
    window.addEventListener('pagehide', hardStop);
    return () => {
      window.removeEventListener('pagehide', hardStop);
      hardStop();
    };
  }, [hardStop]);
}
