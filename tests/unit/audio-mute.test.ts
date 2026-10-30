import test from "node:test";
import assert from "node:assert/strict";
import { getMusicPlaybackSnapshot, sfxAllowed, subscribeMusicPlayback, useAudioStore } from "../../src/engine/audio-store";
import { useGameStore } from "../../src/store/game-store";
import { handleKeyboardEvent, TOGGLE_AUDIO } from "../../src/facilitator/keyboard-actions";

// ==============================================================================
// Task 2.1 / STATE-02 & JUDGE-F04 Unit Tests: Audio Mute Integration
// ==============================================================================

test("STATE-02 / JUDGE-F04: useAudioStore toggles mute correctly", () => {
  useAudioStore.getState().setMuted(false);
  assert.equal(useAudioStore.getState().muted, false, "Initial muted should be false");

  useAudioStore.getState().toggleMute();
  assert.equal(useAudioStore.getState().muted, true, "After toggle, muted should be true");

  useAudioStore.getState().toggleMute();
  assert.equal(useAudioStore.getState().muted, false, "After second toggle, muted should be false");
});

test("STATE-02 / JUDGE-F04: useGameStore handles TOGGLE_AUDIO action and updates useAudioStore", () => {
  useAudioStore.getState().setMuted(false);
  assert.equal(useAudioStore.getState().muted, false);

  useGameStore.getState().dispatch({ type: "TOGGLE_AUDIO" });
  assert.equal(useAudioStore.getState().muted, true, "TOGGLE_AUDIO dispatch must toggle useAudioStore muted to true");

  useGameStore.getState().dispatch({ type: "TOGGLE_AUDIO" });
  assert.equal(useAudioStore.getState().muted, false, "Second TOGGLE_AUDIO dispatch must toggle useAudioStore muted to false");
});

test("unlock reuses one AudioContext and unmute calls unlock", () => {
  const created: object[] = [];
  class FakeContext {
    currentTime = 0;
    destination = {};
    state = "running";
    resume() { return Promise.resolve(); }
    close() { return Promise.resolve(); }
    createGain() {
      return {
        connect() {},
        gain: { cancelScheduledValues() {}, setValueAtTime() {} },
      };
    }
    constructor() { created.push(this); }
  }
  const previous = (globalThis as { AudioContext?: unknown; window?: unknown }).AudioContext;
  const previousWindow = globalThis.window;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { AudioContext: FakeContext, addEventListener() {}, removeEventListener() {} },
  });
  (globalThis as { AudioContext?: unknown }).AudioContext = FakeContext;

  useAudioStore.getState().destroy();
  assert.equal(useAudioStore.getState().unlocked, false, "destroy must drop the gesture lock so a remount can unlock a new context");
  useAudioStore.getState().unlock();
  useAudioStore.getState().unlock();
  assert.equal(created.length, 1, "a second unlock must resume the existing context");

  useAudioStore.getState().setMuted(true);
  useAudioStore.getState().setMuted(false);
  assert.equal(useAudioStore.getState().unlocked, true);
  assert.equal(created.length, 1);

  useAudioStore.getState().destroy();
  (globalThis as { AudioContext?: unknown }).AudioContext = previous;
  Object.defineProperty(globalThis, "window", { configurable: true, value: previousWindow });
});

test("a mute change wakes playback subscribers, so the lyric pane rests and resumes even on a paused walk-in (VOF-87)", () => {
  useAudioStore.getState().setMuted(false);
  let calls = 0;
  const unsubscribe = subscribeMusicPlayback(() => { calls += 1; });
  try {
    useAudioStore.getState().setMuted(true);
    assert.equal(getMusicPlaybackSnapshot().muted, true);
    assert.ok(calls >= 1, "muting must wake the lyric pane");
    const afterMute = calls;
    useAudioStore.getState().toggleMute();
    assert.equal(getMusicPlaybackSnapshot().muted, false);
    assert.ok(calls > afterMute, "unmuting must wake it too");
    const afterUnmute = calls;
    useAudioStore.getState().setMuted(false);
    assert.equal(calls, afterUnmute, "no change, no wake");
  } finally {
    unsubscribe();
  }
});

test("muted and reduced-motion skip companion SFX so duck does not run under a silent cue", () => {
  assert.equal(sfxAllowed("timer-pulse", true, false), false);
  assert.equal(sfxAllowed("timer-pulse", false, true), false);
  assert.equal(sfxAllowed("answer-lock", false, true), true);
  assert.equal(sfxAllowed("ui-tap", false, true), true);
  assert.equal(sfxAllowed("streak-lift", false, false), true);
});

test("STATE-02 / JUDGE-F04: Keyboard maps 'm' and 'M' to TOGGLE_AUDIO", () => {
  const state = { restartRunConfirmationOpen: false } as any;

  const eventLower = {
    key: "m",
    shiftKey: false,
    repeat: false,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
  };
  const actionLower = handleKeyboardEvent(eventLower, state);
  assert.deepEqual(actionLower, { type: TOGGLE_AUDIO });

  const eventUpper = {
    key: "M",
    shiftKey: true,
    repeat: false,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
  };
  const actionUpper = handleKeyboardEvent(eventUpper, state);
  assert.deepEqual(actionUpper, { type: TOGGLE_AUDIO });
});

test("unmute soft-attacks a playing bed instead of snapping to full volume", async (t) => {
  class MuteAudio {
    static instances: MuteAudio[] = [];
    src: string;
    loop = false;
    muted = false;
    paused = true;
    currentTime = 0;
    volume = 1;
    error = null;
    private listeners = new Map<string, Array<() => void>>();
    constructor(src: string) {
      this.src = src;
      MuteAudio.instances.push(this);
    }
    addEventListener(event: string, listener: () => void) {
      this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener]);
    }
    removeEventListener() {}
    pause() { this.paused = true; }
    load() {}
    play() { this.paused = false; return Promise.resolve(); }
  }

  const previousAudio = (globalThis as { Audio?: unknown }).Audio;
  const previousRaf = globalThis.requestAnimationFrame;
  const previousCancelRaf = globalThis.cancelAnimationFrame;
  const frames = new Map<number, FrameRequestCallback>();
  let nextFrame = 0;
  t.mock.timers.enable({ apis: ["setTimeout"] });
  (globalThis as { Audio?: unknown }).Audio = MuteAudio;
  globalThis.requestAnimationFrame = (callback) => {
    frames.set(++nextFrame, callback);
    return nextFrame;
  };
  globalThis.cancelAnimationFrame = (id) => { frames.delete(id); };
  t.after(() => {
    useAudioStore.getState().destroy();
    useAudioStore.setState({ unlocked: false, volume: 1, muted: false, status: "idle", role: null, error: null });
    if (previousAudio === undefined) delete (globalThis as { Audio?: unknown }).Audio;
    else (globalThis as { Audio?: unknown }).Audio = previousAudio;
    globalThis.requestAnimationFrame = previousRaf;
    globalThis.cancelAnimationFrame = previousCancelRaf;
  });

  MuteAudio.instances = [];
  useAudioStore.getState().destroy();
  useAudioStore.setState({ unlocked: true, volume: 1, muted: true, status: "idle", role: null, error: null });
  await useAudioStore.getState().playMusic("walkin", {
    walkin: { path: "/assets/audio/vax-or-fiction/walkin.mp3", loop: true },
  });
  const bed = MuteAudio.instances[0];
  assert.ok(bed, "walk-in bed must mount");
  assert.equal(bed.paused, false);
  // Muted play leaves the element silent (soft attack target is 0 while muted).
  assert.equal(bed.volume, 0);
  assert.equal(bed.muted, true);

  useAudioStore.getState().toggleMute();
  assert.equal(useAudioStore.getState().muted, false);
  assert.equal(bed.muted, false, "unmute clears the element mute flag immediately");
  assert.equal(bed.volume, 0, "unmute soft-attacks from silence — must not snap to 1");

  const pending = [...frames.values()];
  frames.clear();
  for (const callback of pending) callback(performance.now() + 360);
  assert.ok(bed.volume > 0 && bed.volume < 1, `mid-ramp volume should be partial, got ${bed.volume}`);

  t.mock.timers.tick(800);
  const rest = [...frames.values()];
  frames.clear();
  for (const callback of pending.concat(rest)) callback(performance.now() + 720);
  // Drain any remaining raf/timeout settle
  t.mock.timers.tick(50);
  for (const callback of [...frames.values()]) callback(performance.now() + 800);
  assert.equal(bed.volume, 1, "soft attack settles at presenter volume");
});

test("unmute while play() is pending soft-attacks after playback starts — never snaps to full", async (t) => {
  class PendingMuteAudio {
    static instances: PendingMuteAudio[] = [];
    static playImplementation: (() => Promise<void>) | null = null;
    src: string;
    loop = false;
    muted = false;
    paused = true;
    currentTime = 0;
    volume = 1;
    error = null;
    private listeners = new Map<string, Array<() => void>>();
    constructor(src: string) {
      this.src = src;
      PendingMuteAudio.instances.push(this);
    }
    addEventListener(event: string, listener: () => void) {
      this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener]);
    }
    removeEventListener() {}
    pause() { this.paused = true; }
    load() {}
    play() {
      if (PendingMuteAudio.playImplementation) return PendingMuteAudio.playImplementation();
      this.paused = false;
      return Promise.resolve();
    }
  }

  const previousAudio = (globalThis as { Audio?: unknown }).Audio;
  const previousRaf = globalThis.requestAnimationFrame;
  const previousCancelRaf = globalThis.cancelAnimationFrame;
  const frames = new Map<number, FrameRequestCallback>();
  let nextFrame = 0;
  t.mock.timers.enable({ apis: ["setTimeout"] });
  (globalThis as { Audio?: unknown }).Audio = PendingMuteAudio;
  globalThis.requestAnimationFrame = (callback) => {
    frames.set(++nextFrame, callback);
    return nextFrame;
  };
  globalThis.cancelAnimationFrame = (id) => { frames.delete(id); };
  t.after(() => {
    useAudioStore.getState().destroy();
    useAudioStore.setState({ unlocked: false, volume: 1, muted: false, status: "idle", role: null, error: null });
    if (previousAudio === undefined) delete (globalThis as { Audio?: unknown }).Audio;
    else (globalThis as { Audio?: unknown }).Audio = previousAudio;
    globalThis.requestAnimationFrame = previousRaf;
    globalThis.cancelAnimationFrame = previousCancelRaf;
  });

  PendingMuteAudio.instances = [];
  let resolvePlay!: () => void;
  PendingMuteAudio.playImplementation = () => new Promise<void>((resolve) => { resolvePlay = resolve; });
  useAudioStore.getState().destroy();
  useAudioStore.setState({ unlocked: true, volume: 1, muted: true, status: "idle", role: null, error: null });
  const playStarted = useAudioStore.getState().playMusic("walkin", {
    walkin: { path: "/assets/audio/vax-or-fiction/walkin.mp3", loop: true },
  }, { fadeInMs: 720 });
  const bed = PendingMuteAudio.instances[0];
  assert.ok(bed, "walk-in bed must mount");
  assert.equal(bed.paused, true, "play() still pending");
  assert.equal(bed.volume, 0);

  useAudioStore.getState().toggleMute();
  assert.equal(useAudioStore.getState().muted, false);
  assert.equal(bed.muted, false, "unmute clears mute while play is pending");
  assert.equal(bed.volume, 0, "unmute must not snap to full while play is pending");

  bed.paused = false;
  PendingMuteAudio.playImplementation = null;
  resolvePlay();
  await playStarted;
  assert.equal(bed.volume, 0, "post-play soft attack starts from silence");

  const pending = [...frames.values()];
  frames.clear();
  for (const callback of pending) callback(performance.now() + 360);
  assert.ok(bed.volume > 0 && bed.volume < 1, `mid-ramp volume should be partial, got ${bed.volume}`);

  t.mock.timers.tick(800);
  for (const callback of [...frames.values()]) callback(performance.now() + 720);
  t.mock.timers.tick(50);
  for (const callback of [...frames.values()]) callback(performance.now() + 800);
  assert.equal(bed.volume, 1, "soft attack settles at presenter volume after play resolves");
});

test("mute then unmute while play() is pending soft-attacks after playback — must not stay silent", async (t) => {
  class PendingMuteAudio {
    static instances: PendingMuteAudio[] = [];
    static playImplementation: (() => Promise<void>) | null = null;
    src: string;
    loop = false;
    muted = false;
    paused = true;
    currentTime = 0;
    volume = 1;
    error = null;
    private listeners = new Map<string, Array<() => void>>();
    constructor(src: string) {
      this.src = src;
      PendingMuteAudio.instances.push(this);
    }
    addEventListener(event: string, listener: () => void) {
      this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener]);
    }
    removeEventListener() {}
    pause() { this.paused = true; }
    load() {}
    play() {
      if (PendingMuteAudio.playImplementation) return PendingMuteAudio.playImplementation();
      this.paused = false;
      return Promise.resolve();
    }
  }

  const previousAudio = (globalThis as { Audio?: unknown }).Audio;
  const previousRaf = globalThis.requestAnimationFrame;
  const previousCancelRaf = globalThis.cancelAnimationFrame;
  const frames = new Map<number, FrameRequestCallback>();
  let nextFrame = 0;
  t.mock.timers.enable({ apis: ["setTimeout"] });
  (globalThis as { Audio?: unknown }).Audio = PendingMuteAudio;
  globalThis.requestAnimationFrame = (callback) => {
    frames.set(++nextFrame, callback);
    return nextFrame;
  };
  globalThis.cancelAnimationFrame = (id) => { frames.delete(id); };
  t.after(() => {
    useAudioStore.getState().destroy();
    useAudioStore.setState({ unlocked: false, volume: 1, muted: false, status: "idle", role: null, error: null });
    if (previousAudio === undefined) delete (globalThis as { Audio?: unknown }).Audio;
    else (globalThis as { Audio?: unknown }).Audio = previousAudio;
    globalThis.requestAnimationFrame = previousRaf;
    globalThis.cancelAnimationFrame = previousCancelRaf;
  });

  PendingMuteAudio.instances = [];
  let resolvePlay!: () => void;
  PendingMuteAudio.playImplementation = () => new Promise<void>((resolve) => { resolvePlay = resolve; });
  useAudioStore.getState().destroy();
  // Start unmuted so playMusic captures softAttackUnmuteAtStart; mute mid-flight
  // bumps the generation and used to make playMusic abandon its post-play ramp.
  useAudioStore.setState({ unlocked: true, volume: 1, muted: false, status: "idle", role: null, error: null });
  const playStarted = useAudioStore.getState().playMusic("walkin", {
    walkin: { path: "/assets/audio/vax-or-fiction/walkin.mp3", loop: true },
  }, { fadeInMs: 720 });
  const bed = PendingMuteAudio.instances[0];
  assert.ok(bed, "walk-in bed must mount");
  assert.equal(bed.paused, true, "play() still pending");

  useAudioStore.getState().setMuted(true);
  assert.equal(bed.volume, 0);
  useAudioStore.getState().setMuted(false);
  assert.equal(useAudioStore.getState().muted, false);
  assert.equal(bed.muted, false);
  assert.equal(bed.volume, 0, "unmute while pending must not snap to full");

  bed.paused = false;
  PendingMuteAudio.playImplementation = null;
  resolvePlay();
  await playStarted;
  assert.equal(bed.volume, 0, "post-play soft attack starts from silence after mute→unmute");

  const pending = [...frames.values()];
  frames.clear();
  for (const callback of pending) callback(performance.now() + 360);
  assert.ok(bed.volume > 0 && bed.volume < 1, `mid-ramp volume should be partial, got ${bed.volume}`);

  t.mock.timers.tick(800);
  for (const callback of [...frames.values()]) callback(performance.now() + 720);
  t.mock.timers.tick(50);
  for (const callback of [...frames.values()]) callback(performance.now() + 800);
  assert.equal(bed.volume, 1, "mute→unmute while pending must settle audible after play resolves");
});

test("presenter keyboard actions share HUD cue rules and stay silent on lock, reveal, and mute", async () => {
  const { cuePresenterKeyboardAction, tapPrimary, tapUi } = await import("../../src/engine/audio-cues");
  const { useAudioStore } = await import("../../src/engine/audio-store");
  const played: string[] = [];
  const original = useAudioStore.getState().playSfx;
  useAudioStore.setState({ playSfx: async (role: string) => { played.push(role); } } as never);
  try {
    cuePresenterKeyboardAction("ADVANCE", { phase: "deliberating", votesLocked: false, offlineMode: false });
    cuePresenterKeyboardAction("LOCK_VOTES");
    cuePresenterKeyboardAction("REVEAL");
    cuePresenterKeyboardAction("TOGGLE_AUDIO");
    assert.deepEqual(played, [], "lock/reveal/mute and lock-only Next must not tap");
    cuePresenterKeyboardAction("BACK");
    cuePresenterKeyboardAction("OPEN_HELP");
    cuePresenterKeyboardAction("ADVANCE", { phase: "explaining" });
    assert.equal(played.length, 3);
    assert.equal(played.every((role) => role === "ui-tap"), true);
  } finally {
    useAudioStore.setState({ playSfx: original } as never);
  }
  assert.equal(typeof tapPrimary, "function");
  assert.equal(typeof tapUi, "function");
});

test("HUD Next skips ui-tap when AudioPlayer already owns the phase sting", async () => {
  const { shouldTapPrimaryOnAdvance } = await import("../../src/engine/audio-cues");
  assert.equal(shouldTapPrimaryOnAdvance("lobby"), false);
  assert.equal(shouldTapPrimaryOnAdvance("preFlight"), false);
  assert.equal(shouldTapPrimaryOnAdvance("revealed"), false);
  assert.equal(shouldTapPrimaryOnAdvance("showdown"), false);
  assert.equal(shouldTapPrimaryOnAdvance("closing"), false);
  assert.equal(shouldTapPrimaryOnAdvance("outro"), false);
  assert.equal(shouldTapPrimaryOnAdvance("explaining"), true);
  assert.equal(shouldTapPrimaryOnAdvance("deliberating"), true);
  assert.equal(shouldTapPrimaryOnAdvance("entering"), true);
  assert.equal(
    shouldTapPrimaryOnAdvance("entering", { slideType: "title" }),
    false,
    "title Next is the walk-in fade, not a stacked ui-tap",
  );
  assert.equal(
    shouldTapPrimaryOnAdvance("entering", { votesLocked: false, slideType: "binary" }),
    false,
    "posed live question Next settles to reveal; skip ui-tap",
  );
  assert.equal(
    shouldTapPrimaryOnAdvance("entering", { slideType: "instructions" }),
    true,
    "instructions Start still taps",
  );
  assert.equal(shouldTapPrimaryOnAdvance("title"), false);
  assert.equal(
    shouldTapPrimaryOnAdvance("deliberating", { votesLocked: false, offlineMode: false }),
    false,
    "first Next on an open live question only locks, so skip ui-tap",
  );
  assert.equal(
    shouldTapPrimaryOnAdvance("deliberating", { votesLocked: true, offlineMode: false }),
    true,
    "Next after lock still taps; reveal sting is a different primary",
  );
  assert.equal(
    shouldTapPrimaryOnAdvance("deliberating", { votesLocked: false, offlineMode: true }),
    false,
    "offline open-question Next still fires answer-lock + reveal; skip ui-tap",
  );
});

test("SKIP taps mid-run and stays silent when the next slide is the finale", async () => {
  const { shouldTapPrimaryOnSkip, skipEntersFinale } = await import("../../src/engine/audio-cues");
  const run = [
    { id: "q1", type: "question", kind: "binary", answer: true },
    { id: "q2", type: "question", kind: "binary", answer: false },
    { id: "showdown", type: "showdown" },
    { id: "closing", type: "closing" },
  ];
  assert.equal(skipEntersFinale(run, 0), false);
  assert.equal(shouldTapPrimaryOnSkip(run, 0), true);
  assert.equal(skipEntersFinale(run, 1), true);
  assert.equal(shouldTapPrimaryOnSkip(run, 1), false);
  assert.equal(shouldTapPrimaryOnSkip([{ id: "only", type: "question", kind: "binary" }], 0), false);
});

test("in-room launch starts unmuted unless this tab already muted", async () => {
  const { applyInRoomWalkinMutePolicy, getInitialMuted, useAudioStore } = await import("../../src/engine/audio-store");
  const previousWindow = globalThis.window;
  const store: Record<string, string> = {};
  const memory = {
    getItem: (key: string) => (Object.prototype.hasOwnProperty.call(store, key) ? store[key]! : null),
    setItem: (key: string, value: string) => { store[key] = String(value); },
    removeItem: (key: string) => { delete store[key]; },
  };
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      location: { search: "?preset=curated15&venue=room" },
      localStorage: memory,
      addEventListener() {},
      removeEventListener() {},
    },
  });
  try {
    assert.equal(getInitialMuted(), false, "venue=room with no saved mute is audible after gesture");
    (globalThis as { window: { location: { search: string } } }).window.location.search = "?preset=curated15&venue=teams";
    assert.equal(getInitialMuted(), true, "Teams still starts muted");
    memory.setItem("vrc_audio_muted", "true");
    (globalThis as { window: { location: { search: string } } }).window.location.search = "?preset=curated15&venue=room";
    assert.equal(getInitialMuted(), true, "an explicit mute still wins in the room");
    useAudioStore.setState({ muted: true });
    applyInRoomWalkinMutePolicy();
    assert.equal(useAudioStore.getState().muted, true, "explicit mute is not auto-cleared");
    memory.removeItem("vrc_audio_muted");
    useAudioStore.setState({ muted: true, unlocked: false });
    applyInRoomWalkinMutePolicy();
    assert.equal(useAudioStore.getState().muted, false);
    assert.equal(useAudioStore.getState().unlocked, false, "policy unmute waits for the first presenter gesture");
    assert.equal(memory.getItem("vrc_audio_muted"), null, "auto-unmute must not persist into a later Teams load");
  } finally {
    Object.defineProperty(globalThis, "window", { configurable: true, value: previousWindow });
  }
});

// MUTE-LEAK (VOF-25): switching venue to In the room and back to Online meeting must restore the
// mute the walk-in policy applied, since a Teams/Online-meeting share needs muted startup. The
// leak must not clobber a host who genuinely chose to unmute (persisted, so vrc_audio_muted holds
// a real value). It only restores what the room policy silently changed.
test("returning to Online meeting restores the mute the room's walk-in policy silently cleared", async () => {
  const { applyInRoomWalkinMutePolicy, applyOnlineMeetingMutePolicy, useAudioStore } = await import("../../src/engine/audio-store");
  const previousWindow = globalThis.window;
  const store: Record<string, string> = {};
  const memory = {
    getItem: (key: string) => (Object.prototype.hasOwnProperty.call(store, key) ? store[key]! : null),
    setItem: (key: string, value: string) => { store[key] = String(value); },
    removeItem: (key: string) => { delete store[key]; },
  };
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { localStorage: memory, addEventListener() {}, removeEventListener() {} },
  });
  try {
    // Fresh Teams-default room: muted, no explicit host preference yet.
    useAudioStore.setState({ muted: true, unlocked: false });
    assert.equal(memory.getItem("vrc_audio_muted"), null, "no explicit preference yet");

    // Host switches to In the room (mouse or the setup radio, VOF-46 keeps arrows out of it
    // either way): the walk-in policy unmutes without persisting.
    applyInRoomWalkinMutePolicy();
    assert.equal(useAudioStore.getState().muted, false, "in-room walk-in policy unmutes");
    assert.equal(memory.getItem("vrc_audio_muted"), null, "policy unmute still does not persist");

    // Host switches back to Online meeting: the leak, before this fix, left muted false here.
    applyOnlineMeetingMutePolicy();
    assert.equal(useAudioStore.getState().muted, true, "returning to Online meeting must restore the mute the venue policy applied");
    assert.equal(memory.getItem("vrc_audio_muted"), null, "the restored mute is itself policy, not a host choice, so it still must not persist");

    // A host who explicitly muted in the room (persisted) is untouched by either policy.
    useAudioStore.getState().setMuted(true);
    assert.equal(memory.getItem("vrc_audio_muted"), "true");
    applyInRoomWalkinMutePolicy();
    assert.equal(useAudioStore.getState().muted, true, "an explicit mute is not auto-cleared by the in-room policy");

    // A host who explicitly unmuted (persisted false) keeps that choice across a venue round trip.
    useAudioStore.getState().setMuted(false);
    assert.equal(memory.getItem("vrc_audio_muted"), "false");
    applyOnlineMeetingMutePolicy();
    assert.equal(useAudioStore.getState().muted, false, "an explicit unmute is not auto-restored to muted by the Online-meeting policy");
  } finally {
    Object.defineProperty(globalThis, "window", { configurable: true, value: previousWindow });
  }
});
