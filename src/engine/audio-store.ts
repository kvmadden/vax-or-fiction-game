import { create } from 'zustand';

export interface AudioManifestTrack {
  path: string;
  loop?: boolean;
  /** Exact SHA-256 of the shipped file bytes (lowercase hex). Used by lyric sync. */
  sha256?: string;
}

export interface AudioManifest {
  [deck: string]: {
    [role: string]: AudioManifestTrack | AudioManifestTrack[];
  } | AudioManifestTrack | AudioManifestTrack[];
}

/** Shared bed-play options. `fadeInMs` is the soft-attack half of a transition. */
export interface MusicPlayOptions {
  autoplay?: boolean;
  loop?: boolean;
  index?: number;
  deck?: string;
  basePath?: string;
  fadeInMs?: number;
  /**
   * Overlap the outgoing bed's soft release with this bed's soft attack.
   * Used by transitionMusic so role swaps do not dip through silence.
   */
  crossfade?: boolean;
}

export interface MusicTransitionOptions extends MusicPlayOptions {
  fadeDurationMs?: number;
}

interface AudioState {
  muted: boolean;
  unlocked: boolean;
  volume: number;
  status: 'idle' | 'playing' | 'fading' | 'paused' | 'error';
  error: Error | null;
  role: string | null;
  audioCtx: AudioContext | null;
}

interface AudioActions {
  setMuted: (muted: boolean, options?: { persist?: boolean; unlock?: boolean }) => void;
  toggleMute: () => void;
  setVolume: (vol: number) => void;
  unlock: () => void;
  destroy: () => void;
  playMusic: (role: string, manifest: AudioManifest, options?: MusicPlayOptions) => Promise<void>;
  playSfx: (role: string, options?: { deck?: string; basePath?: string; volume?: number }) => Promise<void>;
  playMusicForGeneration: (role: string, manifest: AudioManifest, options: MusicPlayOptions, generation: number) => Promise<void>;
  transitionMusic: (role: string, manifest: AudioManifest, options?: MusicTransitionOptions) => Promise<void>;
  stopMusic: () => void;
  pauseMusic: () => void;
  fadeTo: (targetVolume: number, durationMs?: number, options?: { preserveVolume?: boolean }) => Promise<number>;
  duck: (durationMs?: number, duckVolume?: number) => Promise<number>;
  /**
   * Fade the playing bed out on its own level and then release it. The reveal uses this (VOF-86): a sting's duck is a
   * separate stage, so it can no longer cut this fade short.
   */
  releaseMusic: (fadeMs?: number) => void;
  /** Warm the browser cache for upcoming beds so phase changes do not wait on a cold fetch. */
  prefetchMusic: (roles: string[], manifest: AudioManifest, options?: { basePath?: string }) => void;
}

let currentAudio: HTMLAudioElement | null = null;
let currentTrackSha256: string | null = null;
let audioCtx: AudioContext | null = null;
/** Master stage: the presenter's volume and mute. */
let gainNode: GainNode | null = null;
/** Duck stage (VOF-86): only stings dip the music, about 12 dB, and only here, never squared with another stage. */
let duckNode: GainNode | null = null;
/** Audio-clock time the current duck holds until, so a second sting extends the dip instead of popping it back up. */
let duckHoldUntil = 0;
let currentPlayPromise: Promise<void> | null = null;
let activeFade: { cancel: () => void } | null = null;
let activeDuck: { timerId: any; resolve: (vol: number) => void } | null = null;
let pendingAutoplay: { role: string; manifest: AudioManifest; options: any } | null = null;
let musicTransitionGeneration = 0;
let isDucking = false;
let preDuckVolume = 1.0;
const liveMusicElements = new Set<HTMLAudioElement>();
const playbackListeners = new Set<() => void>();
const prefetchedPaths = new Set<string>();
/** Beds warmed by prefetchMusic — playMusic reuses the element so first play is not a second loader. */
const warmedMusicBySrc = new Map<string, HTMLAudioElement>();
/** Pool key for a live/warmed element — release re-warms under this src, not audio.src (absolute). */
const musicPoolKeyByElement = new WeakMap<HTMLAudioElement, string>();
const bedListenerCleanups = new WeakMap<HTMLAudioElement, () => void>();
/**
 * A routed bed's own media source and level. A bed fades in and out on this level, never on the element, so the fade
 * runs on the audio clock (a busy or hidden tab cannot turn it into a cut) and works on iOS, which ignores element
 * volume.
 */
const bedSourceByElement = new WeakMap<HTMLAudioElement, MediaElementAudioSourceNode>();
const bedGainByElement = new WeakMap<HTMLAudioElement, GainNode>();
/** Beds waiting on the incoming bed. They keep playing until it really plays, then fade out under its attack. */
const outgoingBeds = new Set<HTMLAudioElement>();
/** Beds fading out, each released once its fade ends. */
const releasingBeds = new Set<HTMLAudioElement>();
/** How long outgoing beds wait for an incoming bed that cannot start (a stalled fetch) before fading anyway. */
const ATTACK_WAIT_LIMIT_MS = 3000;
/** How long the flow check polls a stalled bed. Time updates keep watching after that. */
const FLOW_POLL_LIMIT_MS = 5000;
/**
 * How long an outgoing bed holds its level after the incoming bed's playhead first moves. The playhead moves a little
 * before audio reaches the speakers, so a fade that started on that same instant could already be audibly down when
 * the new bed was first heard (audio trace, Teams title to instructions: 0.68 of its level against a 0.7 limit).
 */
const RELEASE_LEAD_MS = 120;
/** Margin after a scheduled fade ends before its element is released. */
const RELEASE_SETTLE_MS = 60;
/** The longest a release waits past that schedule for an audio clock that lags, before it lets the bed go anyway. */
const RELEASE_CLOCK_LAG_BOUND_MS = 2000;
/** Master changes (mute, volume) glide this fast instead of stepping, so they never click. */
const MASTER_GLIDE_MS = 25;
/** A sting's duck: down this fast, then back this slowly, both on the audio clock. */
const DUCK_ATTACK_MS = 90;
const DUCK_RELEASE_MS = 250;

function notifyPlaybackListeners() {
  for (const listener of [...playbackListeners]) {
    try { listener(); } catch { /* lyric UI must not break beds */ }
  }
}

function getAudioConstructor(): (typeof Audio) | undefined {
  if (typeof Audio !== 'undefined') return Audio;
  return (globalThis as typeof globalThis & { Audio?: typeof Audio }).Audio;
}

function warmMusicElement(src: string): HTMLAudioElement | null {
  if (!src) return null;
  const AudioCtor = getAudioConstructor();
  if (!AudioCtor) return null;
  try {
    const warmer = new AudioCtor();
    warmer.preload = 'auto';
    warmer.src = src;
    warmer.load();
    musicPoolKeyByElement.set(warmer, src);
    warmedMusicBySrc.set(src, warmer);
    prefetchedPaths.add(src);
    return warmer;
  } catch {
    return null;
  }
}

function takeWarmedMusic(src: string): HTMLAudioElement {
  const warmed = warmedMusicBySrc.get(src);
  if (warmed) {
    warmedMusicBySrc.delete(src);
    musicPoolKeyByElement.set(warmed, src);
    try {
      warmed.pause();
      if (Number.isFinite(warmed.currentTime) && warmed.currentTime !== 0) {
        warmed.currentTime = 0;
      }
    } catch { /* ignore */ }
    return warmed;
  }
  const AudioCtor = getAudioConstructor();
  const audio = AudioCtor ? new AudioCtor(src) : (null as unknown as HTMLAudioElement);
  if (!audio) throw new Error('Audio is not available');
  musicPoolKeyByElement.set(audio, src);
  return audio;
}

/**
 * Keep playback listeners informed of a bed's transport events. A loop wrap is left alone: every loop file wraps
 * sample exact in Chrome with no click, so the old dip at the seam (which landed up to 250 ms late) hid nothing.
 */
function attachBedListeners(audio: HTMLAudioElement) {
  bedListenerCleanups.get(audio)?.();
  const onTimeUpdate = () => notifyPlaybackListeners();
  const onPlay = () => notifyPlaybackListeners();
  const onPause = () => notifyPlaybackListeners();
  const onSeeked = () => notifyPlaybackListeners();
  const onLoaded = () => notifyPlaybackListeners();
  audio.addEventListener('timeupdate', onTimeUpdate);
  audio.addEventListener('play', onPlay);
  audio.addEventListener('pause', onPause);
  audio.addEventListener('seeked', onSeeked);
  audio.addEventListener('loadedmetadata', onLoaded);
  audio.addEventListener('durationchange', onLoaded);
  bedListenerCleanups.set(audio, () => {
    try {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('seeked', onSeeked);
      audio.removeEventListener('loadedmetadata', onLoaded);
      audio.removeEventListener('durationchange', onLoaded);
    } catch { /* test doubles may omit removeEventListener */ }
  });
}

/** Same duration as AudioPlayer bed swaps — unmute soft-attacks with the same half-transition. */
export const BED_FADE_MS = 720;

/** Abandon an in-flight unmute soft-attack (mute / stop / new unmute). */
let unmuteSoftAttackGeneration = 0;

function fadeElementVolume(audio: HTMLAudioElement, target: number, durationMs: number): Promise<void> {
  const clamped = Math.min(1, Math.max(0, target));
  if (durationMs <= 0) {
    try { audio.volume = clamped; } catch { /* ignore */ }
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const start = audio.volume;
    const startedAt = performance.now();
    let raf: number | null = null;
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      if (raf !== null && typeof cancelAnimationFrame === 'function') {
        try { cancelAnimationFrame(raf); } catch { /* ignore */ }
      }
      raf = null;
      try { audio.volume = clamped; } catch { /* ignore */ }
      resolve();
    };
    const tick = (now: number) => {
      if (settled) return;
      const progress = Math.min(1, (now - startedAt) / durationMs);
      try { audio.volume = start + (clamped - start) * progress; } catch { /* ignore */ }
      if (progress < 1) {
        if (typeof requestAnimationFrame === 'function') raf = requestAnimationFrame(tick);
        else finish();
      } else {
        finish();
      }
    };
    if (typeof requestAnimationFrame === 'function') raf = requestAnimationFrame(tick);
    setTimeout(finish, durationMs + 16);
  });
}

/** Unmute soft-attack only — must not cancel bed-swap / duck element ramps. */
function fadeElementVolumeWhile(
  audio: HTMLAudioElement,
  target: number,
  durationMs: number,
  stillLive: () => boolean,
): Promise<void> {
  const clamped = Math.min(1, Math.max(0, target));
  if (durationMs <= 0) {
    if (stillLive()) {
      try { audio.volume = clamped; } catch { /* ignore */ }
    }
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const start = audio.volume;
    const startedAt = performance.now();
    let raf: number | null = null;
    let settled = false;
    const finish = (applyTarget: boolean) => {
      if (settled) return;
      settled = true;
      if (raf !== null && typeof cancelAnimationFrame === 'function') {
        try { cancelAnimationFrame(raf); } catch { /* ignore */ }
      }
      raf = null;
      if (applyTarget && stillLive()) {
        try { audio.volume = clamped; } catch { /* ignore */ }
      }
      resolve();
    };
    const tick = (now: number) => {
      if (settled) return;
      if (!stillLive()) {
        finish(false);
        return;
      }
      const progress = Math.min(1, (now - startedAt) / durationMs);
      try { audio.volume = start + (clamped - start) * progress; } catch { /* ignore */ }
      if (progress < 1) {
        if (typeof requestAnimationFrame === 'function') raf = requestAnimationFrame(tick);
        else finish(true);
      } else {
        finish(true);
      }
    };
    if (typeof requestAnimationFrame === 'function') raf = requestAnimationFrame(tick);
    setTimeout(() => finish(stillLive()), durationMs + 16);
  });
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** One scheduled point of a param's envelope, on the audio clock (seconds). */
interface EnvelopePoint { t: number; v: number }
/** What each ramped AudioParam was last scheduled to do, so the next ramp starts from where it really is. */
const scheduledCurves = new WeakMap<AudioParam, EnvelopePoint[]>();

function paramCanRamp(param: AudioParam | null | undefined): boolean {
  return Boolean(param)
    && typeof param!.cancelScheduledValues === 'function'
    && typeof param!.setValueAtTime === 'function'
    && typeof param!.linearRampToValueAtTime === 'function';
}

function scheduledValueAt(param: AudioParam, time: number): number {
  const curve = scheduledCurves.get(param);
  if (!curve || !curve.length) {
    const value = Number(param.value);
    return Number.isFinite(value) ? value : 1;
  }
  if (time <= curve[0]!.t) return curve[0]!.v;
  for (let index = 1; index < curve.length; index += 1) {
    const next = curve[index]!;
    if (time <= next.t) {
      const previous = curve[index - 1]!;
      if (next.t <= previous.t) return next.v;
      return previous.v + (next.v - previous.v) * ((time - previous.t) / (next.t - previous.t));
    }
  }
  return curve[curve.length - 1]!.v;
}

function scheduledFinalValue(param: AudioParam): number {
  const curve = scheduledCurves.get(param);
  if (curve?.length) return curve[curve.length - 1]!.v;
  const value = Number(param.value);
  return Number.isFinite(value) ? value : 1;
}

/**
 * Anchored ramps on the audio clock (VOF-86 defect 2). Each schedule pins the param at the value it has right now,
 * then ramps through `points`, given in seconds from now. A ramp scheduled without that anchor starts from the last
 * scheduled point, which can be seconds old, so the gain jumped instead of gliding. Points at 0 set the start value.
 */
function scheduleParam(param: AudioParam, ctx: BaseAudioContext, points: ReadonlyArray<{ at: number; v: number }>) {
  const now = ctx.currentTime;
  let start = scheduledValueAt(param, now);
  const ramps = [...points];
  while (ramps.length && ramps[0]!.at <= 0) start = clamp01(ramps.shift()!.v);
  const curve: EnvelopePoint[] = [{ t: now, v: start }];
  try {
    param.cancelScheduledValues(now);
    param.setValueAtTime(start, now);
    for (const point of ramps) {
      const t = now + point.at;
      const v = clamp01(point.v);
      param.linearRampToValueAtTime(v, t);
      curve.push({ t, v });
    }
  } catch { /* a closed context refuses new automation */ }
  scheduledCurves.set(param, curve);
}

function setParamNow(param: AudioParam, ctx: BaseAudioContext, value: number) {
  scheduleParam(param, ctx, [{ at: 0, v: value }]);
}

/** The level the master should start at when the graph is built: silent while muted. */
function initialMasterLevel(): number {
  try {
    const { muted, volume } = useAudioStore.getState();
    return muted ? 0 : clamp01(volume);
  } catch {
    return 0;
  }
}

/** Master to destination, and the duck stage feeding the master. Beds join through routeBed. */
function ensureShowGraph(ctx: AudioContext) {
  if (!gainNode) {
    try {
      gainNode = ctx.createGain();
      gainNode.connect(ctx.destination);
      if (paramCanRamp(gainNode.gain)) setParamNow(gainNode.gain, ctx, initialMasterLevel());
    } catch {
      gainNode = null;
      return;
    }
  }
  if (!duckNode) {
    try {
      duckNode = ctx.createGain();
      duckNode.connect(gainNode);
      if (paramCanRamp(duckNode.gain)) setParamNow(duckNode.gain, ctx, 1);
    } catch {
      duckNode = null;
    }
  }
}

/** Beds take the audio-clock path when every stage can ramp and elements can be routed into the graph. */
function graphReady(): boolean {
  return Boolean(
    audioCtx
    && gainNode
    && duckNode
    && typeof audioCtx.createMediaElementSource === 'function'
    && paramCanRamp(gainNode.gain)
    && paramCanRamp(duckNode.gain),
  );
}

/**
 * Route a bed through its own level into the duck stage. The element stays at unity from here on. A media source
 * claims its element for good, which is why released elements are re-warmed fresh (releaseMusicElement).
 */
function routeBed(audio: HTMLAudioElement, level: number): GainNode | null {
  const routed = bedGainByElement.get(audio);
  if (routed) return routed;
  if (!audioCtx || !duckNode || !graphReady()) return null;
  try {
    const source = audioCtx.createMediaElementSource(audio);
    const envelope = audioCtx.createGain();
    setParamNow(envelope.gain, audioCtx, level);
    source.connect(envelope);
    envelope.connect(duckNode);
    bedSourceByElement.set(audio, source);
    bedGainByElement.set(audio, envelope);
    try { audio.volume = 1; } catch { /* the envelope owns the level now */ }
    return envelope;
  } catch {
    return null;
  }
}

function unrouteBed(audio: HTMLAudioElement) {
  try { bedSourceByElement.get(audio)?.disconnect(); } catch { /* ignore */ }
  try { bedGainByElement.get(audio)?.disconnect(); } catch { /* ignore */ }
  bedSourceByElement.delete(audio);
  bedGainByElement.delete(audio);
}

/**
 * Fade a bed out on its own level (its element volume when it is not routed), then release it. `holdMs` is graph-only:
 * it holds the level on the audio clock before the ramp. A bed that is not routed has no audio clock to hold on and
 * fades at once, which is what an engine without Web Audio did before the hold existed.
 */
function fadeOutAndRelease(audio: HTMLAudioElement, fadeMs: number, holdMs = 0) {
  if (releasingBeds.has(audio) || !liveMusicElements.has(audio)) return;
  releasingBeds.add(audio);
  const finish = () => {
    if (!releasingBeds.has(audio)) return;
    releasingBeds.delete(audio);
    if (currentAudio !== audio) releaseMusicElement(audio);
  };
  const envelope = bedGainByElement.get(audio);
  if (envelope && audioCtx && paramCanRamp(envelope.gain)) {
    if (fadeMs <= 0) {
      setParamNow(envelope.gain, audioCtx, 0);
      finish();
      return;
    }
    // The hold is on the audio clock: the level stays where it is, then the ramp runs the full fade.
    const hold = Math.max(0, holdMs);
    const ctx = audioCtx;
    const held = scheduledValueAt(envelope.gain, ctx.currentTime);
    scheduleParam(envelope.gain, ctx, hold > 0
      ? [{ at: hold / 1000, v: held }, { at: (hold + fadeMs) / 1000, v: 0 }]
      : [{ at: fadeMs / 1000, v: 0 }]);
    // The release follows the same clock as the ramp. On a starved audio thread that clock falls behind the wall clock, and a
    // release on a wall timer stopped the element while its level was still up: an audible cut at a reveal (the 2026-10-01
    // traces, clocks at 0.75x and 0.96x of wall time, last gains 0.178 and 0.052). So the wait re-arms for the ramp time still
    // left on the audio clock, bounded so a clock that has stopped (a suspended context, which sounds nothing) never holds a bed.
    const endsAt = ctx.currentTime + (hold + fadeMs) / 1000;
    const scheduled = hold + fadeMs + RELEASE_SETTLE_MS;
    const limit = scheduled + RELEASE_CLOCK_LAG_BOUND_MS;
    let waited = 0;
    const finishOnAudioClock = (delay: number) => {
      waited += delay;
      setTimeout(() => {
        if (!releasingBeds.has(audio)) return;
        const leftMs = (endsAt - ctx.currentTime) * 1000;
        if (!(leftMs > 0) || waited >= limit) {
          finish();
          return;
        }
        finishOnAudioClock(Math.min(Math.max(leftMs, 20) + RELEASE_SETTLE_MS, limit - waited));
      }, delay);
    };
    finishOnAudioClock(scheduled);
    return;
  }
  void fadeElementVolume(audio, 0, fadeMs).catch(() => {}).finally(finish);
}

/**
 * Calls `onFlow` once the element's playhead moves past `from`, the first sign its audio is really coming out. A
 * resolved play() is not enough: on a slow network a bed reported playing and then sat at 0 s for 1.5 s while the
 * old bed faded out on schedule (audio trace, room-slow). Time updates catch it, and a light poll backs them up.
 */
function whenPlaybackFlows(audio: HTMLAudioElement, from: number, onFlow: () => void, stale: () => boolean) {
  let settled = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const check = () => {
    if (settled) return;
    if (stale()) {
      stop();
      return;
    }
    const time = Number(audio.currentTime);
    if ((Number.isFinite(time) && time > from + 0.01) || audio.ended) {
      stop();
      onFlow();
    }
  };
  const stop = () => {
    settled = true;
    if (timer !== null) clearTimeout(timer);
    timer = null;
    try { audio.removeEventListener('timeupdate', check); } catch { /* test doubles may omit it */ }
  };
  // The poll only shortens the wait for the first time update, so it gives up after a few seconds. The time-update
  // listener stays armed until the bed flows or is replaced, so a bed that starts late still gets its attack.
  let polls = Math.ceil(FLOW_POLL_LIMIT_MS / 40);
  const poll = () => {
    timer = null;
    check();
    polls -= 1;
    if (!settled && polls > 0) timer = setTimeout(poll, 40);
  };
  try { audio.addEventListener('timeupdate', check); } catch { /* the poll still runs */ }
  check();
  if (!settled) timer = setTimeout(poll, 40);
}

/**
 * Release waits for attack (VOF-86 defect 3). Outgoing beds fade only once the incoming bed really plays, so a bed
 * that has to fetch first no longer leaves a hole where the old one already faded out.
 */
function releaseOutgoingBeds(fadeMs: number, holdMs = 0) {
  for (const audio of [...outgoingBeds]) {
    outgoingBeds.delete(audio);
    fadeOutAndRelease(audio, fadeMs, holdMs);
  }
}

function releaseMusicElement(audio: HTMLAudioElement | null | undefined) {
  if (!audio) return;
  bedListenerCleanups.get(audio)?.();
  bedListenerCleanups.delete(audio);
  unrouteBed(audio);
  outgoingBeds.delete(audio);
  releasingBeds.delete(audio);
  liveMusicElements.delete(audio);
  // Capture before nuking src — absolute audio.src is not the pool key.
  const poolKey = musicPoolKeyByElement.get(audio);
  try {
    audio.pause();
    audio.currentTime = 0;
    audio.src = '';
    audio.load();
  } catch {}
  if (currentAudio === audio) {
    currentAudio = null;
    currentTrackSha256 = null;
  }
  // Show recycles deliberate ↔ menu-soft all night. MediaElementSource permanently
  // claims an element, so return a fresh warmer under the same pool key instead of
  // leaving prefetchedPaths blocked with an empty map slot.
  if (poolKey && !warmedMusicBySrc.has(poolKey)) {
    prefetchedPaths.delete(poolKey);
    warmMusicElement(poolKey);
  }
}

/** Pause and drop every music element so a new role cannot stack on a leftover bed. */
function stopAllLiveMusic() {
  for (const el of [...liveMusicElements]) {
    releaseMusicElement(el);
  }
  outgoingBeds.clear();
  releasingBeds.clear();
  currentAudio = null;
}

const STORAGE_KEY = 'vrc_audio_muted';

function launchPrefersAudibleWalkin(search: string): boolean {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const venue = (params.get('venue') ?? '').trim().toLowerCase();
  if (venue === 'teams' || venue === 'offline') return false;
  if (venue === 'room') return true;
  const preset = (params.get('preset') ?? '').trim();
  const mode = (params.get('mode') ?? '').trim();
  return preset === 'curated15' || preset === 'curated15-room' || mode === 'curated15';
}

export function getInitialMuted(): boolean {
  // VOF-25: start muted for Teams / screen-share unless the host already unmuted.
  // In-room Curated 15 (`venue=room`) should hear Smile after the first gesture.
  try {
    if (typeof window === 'undefined') return true;
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved !== null) return saved === 'true';
    return !launchPrefersAudibleWalkin(window.location.search || '');
  } catch {
    return true;
  }
}

export function sfxAllowed(role: string, muted: boolean, reducedMotion: boolean): boolean {
  if (muted) return false;
  if (reducedMotion && !['ui-tap', 'answer-lock'].includes(String(role))) return false;
  return true;
}

function saveMuted(muted: boolean) {
  try {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, String(muted));
    }
  } catch {}
}

function getContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    try {
      audioCtx = new (window.AudioContext || (window as typeof window & { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    } catch {
      return null;
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  if (audioCtx) ensureShowGraph(audioCtx);
  return audioCtx;
}

function resolveTrack(manifest: AudioManifest, role: string, options: any = {}): AudioManifestTrack | null {
  if (!manifest) return null;
  const deckId = options.deck || 'flagship';
  const deck = (manifest as Record<string, any>).decks?.[deckId] || manifest[deckId] || manifest;
  if (!deck) return null;

  const roleStr = String(role || '').trim();
  if (deck[roleStr]) {
    const entry = deck[roleStr];
    if (Array.isArray(entry)) {
      const idx = options.index ?? 0;
      return entry[idx] || entry[0] || null;
    }
    return entry as AudioManifestTrack;
  }

  const interludeKey = 'interlude';
  const interludeRegex = new RegExp(`^${interludeKey}(?:\\[(\\d+)\\]|\\.(\\d+))?$`, 'i');
  const match = roleStr.match(interludeRegex);
  if (match && deck[interludeKey]) {
    const parsedIdx = match[1] ?? match[2];
    const index = parsedIdx !== undefined ? parseInt(parsedIdx, 10) : (options.index ?? 0);
    const interludeEntries = deck[interludeKey];
    if (Array.isArray(interludeEntries)) {
      return interludeEntries[index] || interludeEntries[0] || null;
    }
    return interludeEntries as AudioManifestTrack;
  }

  if (options.index !== undefined && Array.isArray(deck[roleStr])) {
    return deck[roleStr][options.index] || null;
  }
  return null;
}

function cancelActiveFade() {
  if (activeFade) {
    activeFade.cancel();
    activeFade = null;
  }
}

function cancelActiveDuck() {
  if (activeDuck) {
    if (activeDuck.timerId) clearTimeout(activeDuck.timerId);
    activeDuck.resolve(preDuckVolume);
    activeDuck = null;
  }
  isDucking = false;
}

/**
 * VOF-25 starts beds muted. Unmute must soft-attack like a bed swap — snapping
 * element+gain to full volume mid-Smile is a click, not a transition.
 * Gain rises to the presenter level immediately; element volume ramps from 0.
 */
function softAttackUnmute(
  applyVolume: (volume?: number) => void,
  getVolume: () => number,
  isMuted: () => boolean,
) {
  const audio = currentAudio;
  if (!audio) {
    // A bed fading out under a reveal may still be sounding, so the master rises over the bed-swap time, not a snap.
    if (gainNode && audioCtx && paramCanRamp(gainNode.gain) && !isMuted()) {
      scheduleParam(gainNode.gain, audioCtx, [{ at: BED_FADE_MS / 1000, v: Math.min(1, Math.max(0, getVolume())) }]);
      return;
    }
    applyVolume();
    return;
  }
  const targetVol = Math.min(1, Math.max(0, getVolume()));
  if (gainNode && audioCtx && paramCanRamp(gainNode.gain) && bedGainByElement.has(audio)) {
    // A routed bed plays at unity into the master, so the whole soft attack is one master ramp on the audio clock.
    // A bed whose play() is still pending comes in partway up the same ramp, never with a click.
    unmuteSoftAttackGeneration += 1;
    for (const el of liveMusicElements) {
      try { el.muted = false; } catch { /* ignore */ }
    }
    scheduleParam(gainNode.gain, audioCtx, [{ at: BED_FADE_MS / 1000, v: isMuted() ? 0 : targetVol }]);
    notifyPlaybackListeners();
    return;
  }
  if (gainNode && audioCtx) {
    if (paramCanRamp(gainNode.gain)) {
      setParamNow(gainNode.gain, audioCtx, targetVol);
    } else {
      try {
        gainNode.gain.cancelScheduledValues(audioCtx.currentTime);
        gainNode.gain.setValueAtTime(targetVol, audioCtx.currentTime);
      } catch { /* ignore */ }
    }
  }
  // play() may still be pending — element is paused until it resolves. Snapping
  // to full volume here makes the bed click in when playback starts. Own the
  // post-play soft-attack: mute bumps unmuteSoftAttackGeneration, which makes
  // playMusic yield its ramp — without this schedule the bed stays silent.
  // Intentionally paused beds (no play in flight) still get applyVolume so a
  // later restart is not stuck silent at element volume 0.
  if (audio.paused) {
    try { audio.muted = false; } catch { /* ignore */ }
    if (currentPlayPromise) {
      try { audio.volume = 0; } catch { /* ignore */ }
      const attackGeneration = ++unmuteSoftAttackGeneration;
      const pendingPlay = currentPlayPromise;
      void pendingPlay.then(() => {
        if (attackGeneration !== unmuteSoftAttackGeneration) return;
        if (isMuted() || currentAudio !== audio) return;
        if (audio.paused) {
          applyVolume();
          return;
        }
        void fadeElementVolumeWhile(
          audio,
          Math.min(1, Math.max(0, getVolume())),
          BED_FADE_MS,
          () => attackGeneration === unmuteSoftAttackGeneration && !isMuted() && currentAudio === audio,
        ).then(() => {
          if (attackGeneration !== unmuteSoftAttackGeneration) return;
          if (isMuted() || currentAudio !== audio) return;
          applyVolume();
          notifyPlaybackListeners();
        });
      }).catch(() => {});
    } else {
      applyVolume();
    }
    return;
  }
  const attackGeneration = ++unmuteSoftAttackGeneration;
  try {
    audio.muted = false;
    audio.volume = 0;
  } catch { /* ignore */ }
  void fadeElementVolumeWhile(
    audio,
    targetVol,
    BED_FADE_MS,
    () => attackGeneration === unmuteSoftAttackGeneration && !isMuted() && currentAudio === audio,
  ).then(() => {
    if (attackGeneration !== unmuteSoftAttackGeneration) return;
    if (isMuted() || currentAudio !== audio) return;
    applyVolume();
    notifyPlaybackListeners();
  });
}

export const useAudioStore = create<AudioState & AudioActions>((set, get) => {
  const applyVolume = (volume = get().volume) => {
    const { muted } = get();
    const effective = muted ? 0 : Math.min(1, Math.max(0, volume));
    // Crossfade keeps an outgoing bed in liveMusicElements while currentAudio is
    // already the incoming one. Mute must silence every live bed — not only the
    // current pointer — or Smile leaks under a host mute mid-swap.
    for (const el of liveMusicElements) {
      try {
        if (bedGainByElement.has(el)) {
          // A routed bed stays at unity. The master stage below carries mute and volume, its own level its fades.
          if (el.muted) el.muted = false;
        } else if (muted) {
          el.volume = 0;
          el.muted = true;
        } else if (el === currentAudio) {
          el.volume = effective;
          el.muted = false;
        } else {
          // Outgoing soft-release keeps its own element ramp; only clear mute.
          el.muted = false;
        }
      } catch { /* ignore */ }
    }
    // Never create a context here — destroy()/stopMusic must not allocate a
    // leftover AudioContext that unlock would treat as a second gesture.
    if (gainNode && audioCtx) {
      if (paramCanRamp(gainNode.gain)) {
        // Glide, never step. A ramp already heading for this level (an unmute soft attack) is left to finish.
        if (Math.abs(scheduledFinalValue(gainNode.gain) - effective) > 1e-4) {
          scheduleParam(gainNode.gain, audioCtx, [{ at: MASTER_GLIDE_MS / 1000, v: effective }]);
        }
      } else {
        try {
          gainNode.gain.cancelScheduledValues(audioCtx.currentTime);
          gainNode.gain.setValueAtTime(effective, audioCtx.currentTime);
        } catch {}
      }
    }
  };

  return {
    muted: getInitialMuted(),
    unlocked: false,
    volume: 1.0,
    status: 'idle',
    error: null,
    role: null,
    audioCtx: null,

    setMuted: (muted, options) => {
      const wasMuted = get().muted;
      if (options?.persist !== false) saveMuted(muted);
      set({ muted });
      // The playback snapshot carries the mute, and the lyric pane rests while it is on (VOF-87). A paused bed sends
      // no playback events, so the change itself wakes the subscribers.
      if (muted !== wasMuted) notifyPlaybackListeners();
      if (muted) {
        // Host asked for silence now — abandon any soft-attack ramp and snap quiet.
        unmuteSoftAttackGeneration += 1;
        applyVolume();
        return;
      }
      if (options?.unlock !== false) get().unlock();
      // Only soft-attack on a real mute→unmute edge. setMuted(false) while already
      // unmuted must not zero a live bed (tests and restore paths call this freely).
      if (wasMuted) softAttackUnmute(applyVolume, () => get().volume, () => get().muted);
      else applyVolume();
    },

    toggleMute: () => {
      const muted = !get().muted;
      saveMuted(muted);
      set({ muted });
      notifyPlaybackListeners();
      if (muted) {
        unmuteSoftAttackGeneration += 1;
        applyVolume();
        return;
      }
      get().unlock();
      softAttackUnmute(applyVolume, () => get().volume, () => get().muted);
    },

    setVolume: (vol) => {
      cancelActiveFade();
      cancelActiveDuck();
      const volume = Math.min(1, Math.max(0, vol));
      set({ volume });
      applyVolume();
    },

    unlock: () => {
      let ctx = audioCtx;
      if (ctx) {
        ctx.resume().catch(() => {});
        ensureShowGraph(ctx);
      } else if (typeof window !== 'undefined') {
        try {
          const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
          if (AudioContextClass) {
            ctx = new AudioContextClass();
            ctx.resume().catch(() => {});
            audioCtx = ctx;
            ensureShowGraph(ctx);
            if (currentAudio) routeBed(currentAudio, 1);
          }
        } catch {}
      }
      set({ unlocked: true, audioCtx: ctx });
      if (pendingAutoplay) {
        const { role, manifest, options } = pendingAutoplay;
        pendingAutoplay = null;
        get().playMusic(role, manifest, { ...options, autoplay: false });
      }
    },

    destroy: () => {
      get().stopMusic();
      // stopMusic re-warms spent beds for the live show; a full destroy must drop
      // the pool so remounts and tests do not inherit stale MediaElements.
      for (const warmer of warmedMusicBySrc.values()) {
        try {
          warmer.pause();
          warmer.src = '';
          warmer.load();
        } catch { /* ignore */ }
      }
      warmedMusicBySrc.clear();
      prefetchedPaths.clear();
      currentAudio = null;
      if (audioCtx) {
        try {
          if (typeof audioCtx.close === 'function') audioCtx.close().catch(() => {});
        } catch {}
        audioCtx = null;
        gainNode = null;
        duckNode = null;
      }
      duckHoldUntil = 0;
      // A remounted AudioPlayer must not keep unlocked=true against a closed context,
      // or HUD unmute looks live while beds cannot start.
      set({ audioCtx: null, unlocked: false, status: 'idle', role: null });
    },

    playMusic: async (role, manifest, options = {}) => {
      const generation = ++musicTransitionGeneration;
      return get().playMusicForGeneration(role, manifest, options, generation);
    },

    playMusicForGeneration: async (role: string, manifest: AudioManifest, options: MusicPlayOptions = {}, generation: number) => {
      if (generation !== musicTransitionGeneration) return;
      const state = get();
      if (!state.unlocked) {
        if (options.autoplay) {
          pendingAutoplay = { role, manifest, options };
          if (generation === musicTransitionGeneration) set({ role });
          return;
        }
        get().unlock();
      }

      cancelActiveFade();
      // Off the graph the duck and a bed's soft attack share the element volume, so a new bed ends the duck there.
      // On the graph the duck is its own stage and a sting keeps its dip across the bed change (VOF-86).
      if (!graphReady()) cancelActiveDuck();

      const track = resolveTrack(manifest, role, options);
      if (!track) {
        if (generation === musicTransitionGeneration) set({ error: new Error(`Track not found: ${role}`), status: 'error' });
        return;
      }

      const pendingPlay = currentPlayPromise;
      currentPlayPromise = null;
      const fadeInMs = Math.max(0, Number(options.fadeInMs) || 0);

      if (fadeInMs > 0) {
        // Whatever is playing keeps playing until the new bed really plays, then fades under its soft attack
        // (release waits for attack, VOF-86 defect 3). A hard start still stops everything first.
        if (currentAudio) outgoingBeds.add(currentAudio);
        currentAudio = null;
        currentTrackSha256 = null;
      } else {
        stopAllLiveMusic();
      }

      if (pendingPlay) {
        if (fadeInMs > 0) {
          // Outgoing may still be settling its play() promise. Do not block the
          // incoming soft attack on that settle — that reintroduced a silence hole.
          void pendingPlay.catch(() => {});
        } else {
          await pendingPlay.catch(() => {});
          if (generation !== musicTransitionGeneration || !get().unlocked) {
            return;
          }
        }
      }

      // A newer transition, release or stop owns the outgoing beds from here.
      if (generation !== musicTransitionGeneration || !get().unlocked) return;

      const basePath = options.basePath || '';
      const resolvedSrc = `${basePath}${track.path}`;
      const shouldLoop = options.loop !== undefined ? options.loop : Boolean(track.loop);

      try {
        const audio = takeWarmedMusic(resolvedSrc);
        audio.loop = shouldLoop;
        const reportCurrentFailure = (failure: unknown) => {
          if (currentAudio !== audio || generation !== musicTransitionGeneration) return;
          // Nothing is coming to take over, so the beds that were waiting on this one fade out now.
          releaseOutgoingBeds(fadeInMs || BED_FADE_MS);
          set({
            status: 'error',
            error: failure instanceof Error ? failure : new Error(String(failure)),
            role: null,
            unlocked: false,
          });
        };
        audio.addEventListener('error', () => {
          reportCurrentFailure(
            audio.error
              ? new Error(`Audio error: ${audio.error.message || audio.error.code}`)
              : new Error(`Failed to load audio from ${resolvedSrc}`),
          );
        });
        liveMusicElements.add(audio);
        currentAudio = audio;
        currentTrackSha256 = typeof track.sha256 === 'string' ? track.sha256 : null;
        attachBedListeners(audio);
        const ctx = audioCtx || getContext();
        // On the graph the bed starts silent on its own level. Off it, on its element volume, as before.
        const envelope = ctx ? routeBed(audio, fadeInMs > 0 ? 0 : 1) : null;

        // applyVolume() first — a prior fadeTo(0) silence release can leave gainNode
        // at 0, and without this restore the bed's attack is inaudible until a late snap.
        // Target volume is re-read when play() resolves so unmute during a muted
        // start does not bake targetVol=0 and leave the bed silent after attack.
        applyVolume();
        if (!envelope && fadeInMs > 0) {
          try { audio.volume = 0; audio.muted = get().muted; } catch {}
        }
        const softAttackUnmuteAtStart = unmuteSoftAttackGeneration;
        const attackGeneration = generation;
        // A bed that cannot start (a stalled fetch) must not hold the outgoing ones forever.
        const releaseDeadline = fadeInMs > 0 && outgoingBeds.size
          ? setTimeout(() => {
            if (attackGeneration === musicTransitionGeneration) releaseOutgoingBeds(fadeInMs);
          }, ATTACK_WAIT_LIMIT_MS)
          : null;
        const stale = () => attackGeneration !== musicTransitionGeneration || currentAudio !== audio;
        const attack = async () => {
          if (stale()) return;
          if (envelope && ctx) {
            // The new bed's audio flows now, so the old ones fade under its attack from this moment.
            whenPlaybackFlows(audio, startedFrom, () => {
              if (releaseDeadline !== null) clearTimeout(releaseDeadline);
              releaseOutgoingBeds(fadeInMs, RELEASE_LEAD_MS);
              if (fadeInMs > 0) scheduleParam(envelope.gain, ctx, [{ at: fadeInMs / 1000, v: 1 }]);
              applyVolume();
              notifyPlaybackListeners();
            }, stale);
            return;
          }
          if (releaseDeadline !== null) clearTimeout(releaseDeadline);
          // The new bed plays now, so the old ones fade under its attack from this moment.
          releaseOutgoingBeds(fadeInMs);
          // Unmute soft-attack owns the ramp once the host clears mute mid-flight.
          if (unmuteSoftAttackGeneration !== softAttackUnmuteAtStart) return;
          if (fadeInMs > 0) {
            const liveTarget = get().muted ? 0 : get().volume;
            await fadeElementVolumeWhile(
              audio,
              liveTarget,
              fadeInMs,
              () => (
                attackGeneration === musicTransitionGeneration
                && currentAudio === audio
                && unmuteSoftAttackGeneration === softAttackUnmuteAtStart
              ),
            );
            if (attackGeneration !== musicTransitionGeneration || currentAudio !== audio) return;
            if (unmuteSoftAttackGeneration !== softAttackUnmuteAtStart) return;
          }
          applyVolume();
          notifyPlaybackListeners();
        };

        const startedFrom = Number(audio.currentTime) || 0;
        const playPromise = audio.play();
        if (playPromise !== undefined) {
          const observedPlayPromise = playPromise.then(
            () => {
              if (currentPlayPromise === observedPlayPromise) currentPlayPromise = null;
              void attack().catch(() => {});
            },
            (failure) => {
              if (currentPlayPromise === observedPlayPromise) currentPlayPromise = null;
              if (releaseDeadline !== null) clearTimeout(releaseDeadline);
              reportCurrentFailure(failure);
            },
          );
          currentPlayPromise = observedPlayPromise;
        } else {
          void attack();
        }

        if (generation === musicTransitionGeneration && currentAudio === audio) {
          set({ role, status: 'playing', error: null });
          notifyPlaybackListeners();
        } else {
          releaseMusicElement(audio);
        }
      } catch (err) {
        releaseOutgoingBeds(fadeInMs);
        if (generation === musicTransitionGeneration) {
          set({
            error: err instanceof Error ? err : new Error(String(err)),
            status: 'error',
            role: null,
            unlocked: false,
          });
        }
      }
    },

    transitionMusic: async (role, manifest, options = {}) => {
      const generation = ++musicTransitionGeneration;
      if (!graphReady()) cancelActiveDuck();
      const fadeMs = options.fadeDurationMs ?? 160;
      const activeRole = get().role;
      const swapping = Boolean(
        activeRole
        && activeRole !== role
        && (get().status === 'playing' || get().status === 'fading'),
      );

      // Yield so a synchronous stopMusic/pauseMusic right after transitionMusic()
      // can cancel before a replacement element is constructed (zero-duration path).
      await Promise.resolve();
      if (generation !== musicTransitionGeneration) return;
      // Overlap soft release + soft attack so role swaps do not dip through silence.
      // fadeMs 0 keeps the hard cut via stopAllLiveMusic inside playMusicForGeneration.
      await get().playMusicForGeneration(
        role,
        manifest,
        { ...options, fadeInMs: fadeMs, crossfade: swapping && fadeMs > 0 },
        generation,
      );
    },

    stopMusic: () => {
      musicTransitionGeneration += 1;
      cancelActiveFade();
      cancelActiveDuck();
      unmuteSoftAttackGeneration += 1;
      pendingAutoplay = null;
      currentTrackSha256 = null;
      const pending = currentPlayPromise;
      currentPlayPromise = null;
      stopAllLiveMusic();
      // A fadeTo(0, { preserveVolume: true }) parks gainNode at 0.
      // Restore presenter level so the next soft attack is audible.
      applyVolume();
      // Nothing is left under a duck, so the duck stage is ready at full level for the next bed. Reset after the
      // beds stop, so a stop during a sting cannot lift a bed for an instant first.
      if (duckNode && audioCtx && paramCanRamp(duckNode.gain)) setParamNow(duckNode.gain, audioCtx, 1);
      duckHoldUntil = 0;
      if (pending) pending.catch(() => {});
      set({ status: 'idle', role: null });
      notifyPlaybackListeners();
    },

    releaseMusic: (fadeMs = BED_FADE_MS) => {
      musicTransitionGeneration += 1;
      pendingAutoplay = null;
      const pending = currentPlayPromise;
      currentPlayPromise = null;
      if (pending) pending.catch(() => {});
      // The bed leaves the current slot first, so ending a fade or an element duck below cannot snap it back up.
      if (currentAudio) outgoingBeds.add(currentAudio);
      currentAudio = null;
      currentTrackSha256 = null;
      cancelActiveFade();
      if (!graphReady()) cancelActiveDuck();
      // Every bed fades out on its own level. A sting's duck works on its own stage and cannot cut this short.
      releaseOutgoingBeds(Math.max(0, Number(fadeMs) || 0));
      set({ status: 'idle', role: null });
      notifyPlaybackListeners();
    },

    prefetchMusic: (roles, manifest, options = {}) => {
      // Do not treat index.html as=fetch as done — that hint (and fetch()) do not
      // fill the HTMLAudioElement media cache. Warm with a real media element and
      // hand it to playMusic so first play does not construct a second loader.
      if (!getAudioConstructor()) return;
      const basePath = options.basePath || '';
      for (const role of roles) {
        const track = resolveTrack(manifest, role, options);
        if (!track?.path) continue;
        const src = `${basePath}${track.path}`;
        if (prefetchedPaths.has(src) || warmedMusicBySrc.has(src)) continue;
        warmMusicElement(src);
      }
    },

    pauseMusic: () => {
      musicTransitionGeneration += 1;
      cancelActiveFade();
      cancelActiveDuck();
      const audioToPause = currentAudio;
      if (audioToPause) {
        try { audioToPause.pause(); } catch { /* ignore */ }
        if (currentPlayPromise) {
          currentPlayPromise
            .then(() => { try { audioToPause.pause(); } catch { /* ignore */ } })
            .catch(() => {});
        }
      }
      // Crossfade may leave an outgoing bed releasing — pause every live element.
      for (const el of [...liveMusicElements]) {
        try { el.pause(); } catch { /* ignore */ }
      }
      set({ status: 'paused' });
      notifyPlaybackListeners();
    },

    fadeTo: (targetVolume, durationMs = 0, { preserveVolume = false } = {}) => {
      if (!Number.isFinite(targetVolume)) return Promise.resolve(get().volume);
      const target = Math.min(1, Math.max(0, targetVolume));
      cancelActiveFade();

      if (durationMs <= 0) {
        if (!preserveVolume) set({ volume: target });
        applyVolume(target);
        const { status } = get();
        if (status === 'fading') {
          set({ status: currentAudio && !currentAudio.paused ? 'playing' : 'idle' });
        }
        return Promise.resolve(target);
      }

      set({ status: 'fading' });

      return new Promise((resolve) => {
        const { muted } = get();
        const targetGain = muted ? 0 : target;
        const fadeDuration = durationMs / 1000;
        const ctx = audioCtx || getContext();

        if (gainNode && ctx && paramCanRamp(gainNode.gain)) {
          // The master glides from wherever it is now, on the audio clock (anchored, never a jump).
          scheduleParam(gainNode.gain, ctx, [{ at: fadeDuration, v: targetGain }]);
        }

        // A routed bed stays at unity and the master above carries this fade. Only a bed outside the graph fades
        // its element.
        const fadedElement = currentAudio && !bedGainByElement.has(currentAudio) ? currentAudio : null;
        const startVol = fadedElement ? fadedElement.volume : get().volume;
        const startTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
        let rafId: number | null = null;
        let timerId: ReturnType<typeof setTimeout> | null = null;

        const onFrame = (now: number) => {
          const elapsed = (now - startTime) / 1000;
          const progress = Math.min(1, durationMs > 0 ? elapsed / fadeDuration : 1);
          const currentFadeVol = startVol + (targetGain - startVol) * progress;
          if (fadedElement && currentAudio === fadedElement) {
            try {
              fadedElement.volume = Math.min(1, Math.max(0, currentFadeVol));
            } catch {}
          }
          if (progress < 1) {
            if (typeof requestAnimationFrame === 'function') {
              rafId = requestAnimationFrame(onFrame);
            }
          }
        };

        if (fadedElement && typeof requestAnimationFrame === 'function') {
          rafId = requestAnimationFrame(onFrame);
        }

        timerId = setTimeout(() => {
          if (rafId !== null && typeof cancelAnimationFrame === 'function') {
            cancelAnimationFrame(rafId);
            rafId = null;
          }
          activeFade = null;
          if (!preserveVolume) set({ volume: target });
          set({
            status: currentAudio && !currentAudio.paused ? 'playing' : 'idle',
          });
          applyVolume(target);
          resolve(target);
        }, durationMs);

        activeFade = {
          cancel: () => {
            if (timerId !== null) clearTimeout(timerId);
            if (rafId !== null && typeof cancelAnimationFrame === 'function') {
              cancelAnimationFrame(rafId);
              rafId = null;
            }
            activeFade = null;
            // On the graph applyVolume below glides the master back from where it is. A bare cancel here would drop
            // the ramp and jump the gain back to where the fade began.
            if (gainNode && ctx && !paramCanRamp(gainNode.gain)) {
              const audioCtx = ctx;
              gainNode.gain.cancelScheduledValues(audioCtx.currentTime);
            }
            // Media output may be muted or partway through a temporary ramp.
            // Cancellation preserves the logical setting, not that output.
            const currentVol = get().volume;
            set({ status: currentAudio && !currentAudio.paused ? 'playing' : 'idle' });
            applyVolume();
            resolve(currentVol);
          },
        };
      });
    },


    playSfx: async (role, options: { deck?: string; basePath?: string; volume?: number } = {}) => {
      const { muted } = get();
      const reducedMotion = typeof window !== 'undefined'
        && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
      if (!sfxAllowed(role, muted, reducedMotion)) return;
      const src = `/assets/audio/vax-or-fiction/${role}.mp3`;
      try {
        const audio = new Audio(src);
        audio.volume = Math.min(1, Math.max(0, options.volume ?? 0.85));
        await audio.play().catch(() => {});
      } catch {}
    },
    duck: (durationMs = 2000, duckVolume = 0.2) => {
      const targetDuck = Math.min(1, Math.max(0, duckVolume));
      // The duck stage only reaches beds routed through the graph. A bed that plays on its element (no media source
      // on this engine, or one that failed to route) ducks on its element below, as before.
      const unroutedBedPlaying = [...liveMusicElements].some((el) => !bedGainByElement.has(el));
      if (duckNode && audioCtx && graphReady() && !unroutedBedPlaying) {
        // VOF-86: the dip lives on the duck stage alone, so it is exactly `duckVolume` (not squared with the
        // element), it glides down and back on the audio clock, and it leaves bed fades and the master untouched.
        // A second sting inside the hold extends it rather than letting the music pop up between the two.
        const ctx = audioCtx;
        const now = ctx.currentTime;
        const attack = DUCK_ATTACK_MS / 1000;
        const release = DUCK_RELEASE_MS / 1000;
        const holdUntil = Math.max(duckHoldUntil, now + Math.max(attack, Math.max(0, durationMs) / 1000 - release));
        duckHoldUntil = holdUntil;
        // A dip already on its way down to this level keeps its own timing, so the second sting never slows it.
        const underway = (scheduledCurves.get(duckNode.gain) ?? []).find((point) => point.t > now && Math.abs(point.v - targetDuck) < 1e-6);
        const down = underway ? underway.t - now : attack;
        scheduleParam(duckNode.gain, ctx, [
          { at: Math.min(down, holdUntil - now), v: targetDuck },
          { at: holdUntil - now, v: targetDuck },
          { at: holdUntil - now + release, v: 1 },
        ]);
        return new Promise((resolve) => {
          setTimeout(() => resolve(get().volume), Math.max(0, (holdUntil - now + release) * 1000));
        });
      }
      if (!isDucking) preDuckVolume = get().volume;
      cancelActiveDuck();
      isDucking = true;

      return new Promise((resolve) => {
        let cancelled = false;
        activeDuck = {
          timerId: null,
          resolve: (vol) => {
            cancelled = true;
            cancelActiveFade();
            set({ volume: vol });
            applyVolume();
            resolve(vol);
          }
        };

        const rampDownMs = Math.min(90, Math.max(48, Math.floor(durationMs * 0.18)));
        const rampUpMs = Math.min(90, Math.max(48, Math.floor(durationMs * 0.18)));
        const holdMs = Math.max(0, durationMs - rampDownMs - rampUpMs);

        get().fadeTo(targetDuck, rampDownMs).then(() => {
          if (cancelled) return;
          activeDuck!.timerId = setTimeout(() => {
            if (cancelled) return;
            activeDuck!.timerId = null;
            get().fadeTo(preDuckVolume, rampUpMs).then(() => {
              if (cancelled) return;
              isDucking = false;
              activeDuck = null;
              resolve(get().volume);
            });
          }, holdMs);
        });
      });
    },
  };
});

export function canPlaySfx(role: string): boolean {
  const { muted } = useAudioStore.getState();
  const reducedMotion = typeof window !== 'undefined'
    && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  return sfxAllowed(role, muted, reducedMotion);
}

export function getMusicPlaybackSnapshot(): {
  role: string | null;
  trackSha256: string | null;
  currentTime: number;
  duration: number;
  paused: boolean;
  status: AudioState['status'];
  muted: boolean;
} {
  const state = useAudioStore.getState();
  const duration = currentAudio?.duration;
  return {
    role: state.role,
    trackSha256: currentTrackSha256,
    currentTime: currentAudio?.currentTime ?? 0,
    duration: typeof duration === 'number' && Number.isFinite(duration) ? duration : 0,
    paused: currentAudio ? currentAudio.paused : true,
    status: state.status,
    muted: state.muted,
  };
}

/** Subscribe to playhead / role changes for lyric sync (and similar UI). */
export function subscribeMusicPlayback(listener: () => void): () => void {
  playbackListeners.add(listener);
  return () => {
    playbackListeners.delete(listener);
  };
}

/**
 * In the room, Smile should be audible after a gesture unless this tab
 * explicitly muted. Do not persist so a later Teams load still starts quiet.
 */
export function applyInRoomWalkinMutePolicy(): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage.getItem(STORAGE_KEY) === 'true') return;
  } catch {
    return;
  }
  const audio = useAudioStore.getState();
  if (audio.muted) audio.setMuted(false, { persist: false, unlock: false });
}

/**
 * MUTE-LEAK (VOF-25). Online meeting / Teams screen-share must stay muted at start. If the
 * in-room walk-in policy above unmuted this tab, that unmute never persisted, so a saved
 * preference here can only mean the host explicitly chose a mute state (mute or unmute) through
 * the sound control. Restore the mute only when there is no such explicit choice on record.
 * Otherwise the host's own pick, in either direction, survives the round trip untouched.
 */
export function applyOnlineMeetingMutePolicy(): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage.getItem(STORAGE_KEY) !== null) return;
  } catch {
    return;
  }
  const audio = useAudioStore.getState();
  if (!audio.muted) audio.setMuted(true, { persist: false, unlock: false });
}
