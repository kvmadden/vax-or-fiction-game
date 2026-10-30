import assert from 'node:assert/strict';
import test from 'node:test';
import { LANDING_WALKIN_PATH, resetLandingMusicForTests, useLandingMusicStore } from '../../src/engine/landing-music';

/**
 * VOF-W9. Landing-page walk-in music is off by default and lives entirely apart from the
 * show's engine (src/engine/audio-store.ts, key vrc_audio_muted). These tests stub
 * window.Audio the way tests/unit/audio-transition.test.ts does, so no real media loads.
 * There is no window.AudioContext in plain Node, so every test here runs the store's plain
 * volume fallback path unless a test installs its own fake AudioContext to exercise the
 * GainNode path directly (see the two tests near the bottom of this file for that).
 */
// Mirrors src/engine/landing-music.ts's own FADE_MS, not exported since nothing outside that
// module needs it. Kept as one named constant here so a future change to the real value only
// needs updating in one place in this file.
const FADE_MS = 900;
class FakeAudio {
  static instances: FakeAudio[] = [];
  static playImpl: (() => Promise<void>) | null = null;
  src: string;
  loop = false;
  volume = 1;
  paused = true;
  playCalls = 0;
  pauseCalls = 0;

  constructor(src: string) {
    this.src = src;
    FakeAudio.instances.push(this);
  }

  play() {
    this.playCalls += 1;
    this.paused = false;
    const impl = FakeAudio.playImpl ?? (() => Promise.resolve());
    return impl();
  }

  pause() {
    this.pauseCalls += 1;
    this.paused = true;
  }
}

function installFakeAudio() {
  FakeAudio.instances = [];
  FakeAudio.playImpl = null;
  (globalThis as { Audio?: unknown }).Audio = FakeAudio;
}

test.beforeEach(() => {
  installFakeAudio();
  resetLandingMusicForTests();
});

test('landing music starts off, and toggle, stop and hardStop never read or write vrc_audio_muted', () => {
  class MapStorage {
    #map = new Map<string, string>();
    setCalls: Array<[string, string]> = [];
    removeCalls: string[] = [];
    constructor(seed: Record<string, string>) {
      for (const [key, value] of Object.entries(seed)) this.#map.set(key, value);
    }
    getItem(key: string) {
      return this.#map.has(key) ? this.#map.get(key)! : null;
    }
    setItem(key: string, value: string) {
      this.setCalls.push([key, value]);
      this.#map.set(key, value);
    }
    removeItem(key: string) {
      this.removeCalls.push(key);
      this.#map.delete(key);
    }
  }
  const standIn = new MapStorage({ vrc_audio_muted: 'true' });
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: standIn });

  try {
    assert.equal(useLandingMusicStore.getState().playing, false, 'off by default');
    useLandingMusicStore.getState().toggle();
    assert.equal(useLandingMusicStore.getState().playing, true, 'a tap turns it on');
    useLandingMusicStore.getState().stop();
    useLandingMusicStore.getState().toggle();
    useLandingMusicStore.getState().hardStop();

    assert.equal(standIn.getItem('vrc_audio_muted'), 'true', 'the show mute preference must be unchanged');
    assert.equal(standIn.setCalls.some(([key]) => key === 'vrc_audio_muted'), false, 'must never write the show mute key');
    assert.equal(standIn.removeCalls.includes('vrc_audio_muted'), false, 'must never remove the show mute key');
  } finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else delete (globalThis as { localStorage?: unknown }).localStorage;
  }
});

test('toggle plays the walk-in track lazily, only on the first tap', () => {
  assert.equal(FakeAudio.instances.length, 0, 'no element before any tap');
  useLandingMusicStore.getState().toggle();
  assert.equal(FakeAudio.instances.length, 1, 'exactly one element created on first tap');
  assert.equal(FakeAudio.instances[0].src.endsWith(LANDING_WALKIN_PATH), true);
  assert.equal(FakeAudio.instances[0].loop, true);
  assert.equal(FakeAudio.instances[0].playCalls, 1);
});

test('toggle again stops it, and a third tap reuses the element rather than creating a new one', () => {
  useLandingMusicStore.getState().toggle();
  assert.equal(useLandingMusicStore.getState().playing, true);
  useLandingMusicStore.getState().toggle();
  assert.equal(useLandingMusicStore.getState().playing, false);
  useLandingMusicStore.getState().toggle();
  assert.equal(useLandingMusicStore.getState().playing, true);
  assert.equal(FakeAudio.instances.length, 1, 'the same element is reused, not recreated');
});

test('stop() quietly does nothing when nothing is playing', () => {
  assert.equal(useLandingMusicStore.getState().playing, false);
  useLandingMusicStore.getState().stop();
  assert.equal(useLandingMusicStore.getState().playing, false);
  assert.equal(FakeAudio.instances.length, 0, 'stop must not itself create an element');
});

test('a rejected play() quietly falls back to off, without throwing', async () => {
  FakeAudio.playImpl = () => Promise.reject(new Error('NotAllowedError: no gesture'));
  assert.doesNotThrow(() => useLandingMusicStore.getState().toggle());
  // The rejection settles on a later microtask.
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(useLandingMusicStore.getState().playing, false, 'a blocked autoplay must not report as playing');
});

test('hardStop pauses immediately, with no fade, for a page that is about to leave', () => {
  useLandingMusicStore.getState().toggle();
  assert.equal(useLandingMusicStore.getState().playing, true);
  const audio = FakeAudio.instances[0];
  audio.volume = 0.5;
  useLandingMusicStore.getState().hardStop();
  assert.equal(useLandingMusicStore.getState().playing, false, 'off immediately');
  assert.equal(audio.paused, true, 'paused immediately, not after a fade');
});

// The fade is a fixed-step setInterval (FADE_STEP_MS granularity), so FADE_MS itself does not
// land on an exact step boundary. FADE_MS_COMPLETE ticks comfortably past every step, and
// FADE_MS_MID is comfortably short of it. Neither test below depends on the exact step count.
const FADE_MS_COMPLETE = FADE_MS + 100;
const FADE_MS_MID = Math.round(FADE_MS / 3);

test('the fade-out actually pauses the element once it finishes, not before', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  useLandingMusicStore.getState().toggle();
  const audio = FakeAudio.instances[0];
  await Promise.resolve(); // let toggle's play().then(settle) run so the fade-in interval exists
  t.mock.timers.tick(FADE_MS_COMPLETE); // finish the fade-in, so the fade-out starts from a real level
  assert.equal(audio.volume, 0.5, 'sanity: reached the target level before this test fades it out');

  useLandingMusicStore.getState().stop();
  assert.equal(audio.paused, false, 'still audible partway through the fade-out');
  t.mock.timers.tick(FADE_MS_MID);
  assert.equal(audio.pauseCalls, 0, 'the fade has not reached the end yet');
  t.mock.timers.tick(FADE_MS_COMPLETE - FADE_MS_MID);
  assert.equal(audio.pauseCalls, 1, 'pause() runs exactly once, right when the fade-out finishes');
  assert.equal(audio.volume, 0, 'the level actually reached 0, not a rounding-short value');
});

test('tap on, off, then on again inside the 900ms fade-out never pauses the new playback', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  useLandingMusicStore.getState().toggle();
  const audio = FakeAudio.instances[0];
  await Promise.resolve(); // let the fade-in interval start
  t.mock.timers.tick(FADE_MS_COMPLETE); // fully faded in, at the target level

  useLandingMusicStore.getState().stop();
  t.mock.timers.tick(FADE_MS_MID); // the fade-out is partway down, well inside its 900ms window
  useLandingMusicStore.getState().toggle();
  assert.equal(useLandingMusicStore.getState().playing, true);
  await Promise.resolve(); // let the new attempt's play().then(settle) start its own fade-in

  // The old fade-out interval is cleared the moment the new attempt starts, so ticking through
  // the rest of that original 900ms window must never call pause() on the still-playing track.
  t.mock.timers.tick(FADE_MS_COMPLETE);
  assert.equal(audio.pauseCalls, 0, 'the abandoned fade-out never paused the new attempt');
  assert.equal(audio.volume, 0.5, 'the new fade-in reached the target level on its own schedule');
  assert.equal(audio.paused, false, 'audible the whole time, no gap');
});

test('the walk-in path matches the shipped audio manifest', async () => {
  const { readFile } = await import('node:fs/promises');
  const path = await import('node:path');
  const manifest = JSON.parse(await readFile(path.join(process.cwd(), 'public/assets/audio/manifest.json'), 'utf8'));
  const manifestPath = manifest.decks['vax-or-fiction'].walkin.path;
  assert.equal(LANDING_WALKIN_PATH, `/${manifestPath}`);
});

/**
 * The two tests below install a fake window.AudioContext (same technique as
 * tests/unit/audio-mute.test.ts's "unlock reuses one AudioContext" test) so the store's real
 * GainNode branch runs, not the volume fallback every other test above exercises. This is the
 * actual fix for the reported bug: iOS ignores HTMLMediaElement.volume, so the fade must move a
 * GainNode's gain, not the element's volume, and the element's volume must never be touched at
 * all once a gain node is wired in.
 */
function installFakeAudioContext() {
  const gains: Array<{ value: number }> = [];
  let resumeCalls = 0;
  let context: InstanceType<typeof FakeAudioContext> | null = null;
  // A real AudioContext throws InvalidStateError on a second createMediaElementSource for the
  // same element. Reproducing that here catches a future regression that re-wraps the element
  // on a later tap instead of reusing the cached GainNode.
  const wrappedElements = new WeakSet<object>();
  class FakeGainNode {
    connected: unknown = null;
    gain = { value: 0 };
    connect(target: unknown) {
      this.connected = target;
    }
  }
  class FakeSourceNode {
    connected: unknown = null;
    connect(target: unknown) {
      this.connected = target;
    }
  }
  class FakeAudioContext {
    state = 'running';
    destination = {};
    createGain() {
      const node = new FakeGainNode();
      gains.push(node.gain);
      return node as unknown as GainNode;
    }
    createMediaElementSource(element: object) {
      if (wrappedElements.has(element)) {
        throw new Error('InvalidStateError: this element is already wrapped by a MediaElementAudioSourceNode');
      }
      wrappedElements.add(element);
      return new FakeSourceNode() as unknown as MediaElementAudioSourceNode;
    }
    resume() {
      resumeCalls += 1;
      return Promise.resolve();
    }
    close() {
      return Promise.resolve();
    }
  }
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      AudioContext: class extends FakeAudioContext {
        constructor() {
          super();
          context = this;
        }
      },
      addEventListener() {},
      removeEventListener() {},
    },
  });
  return {
    gains,
    getResumeCalls: () => resumeCalls,
    getContext: () => context,
    restore: () => {
      if (previous) Object.defineProperty(globalThis, 'window', previous);
      else delete (globalThis as { window?: unknown }).window;
    },
  };
}

test('with a real AudioContext available, the fade moves a GainNode, and the element volume is never touched', async (t) => {
  const fake = installFakeAudioContext();
  t.mock.timers.enable({ apis: ['setInterval'] });
  try {
    useLandingMusicStore.getState().toggle(); // on
    const audio = FakeAudio.instances[0];
    await Promise.resolve(); // let toggle's play().then(settle) run so the fade-in interval exists
    t.mock.timers.tick(FADE_MS_COMPLETE);
    assert.equal(fake.gains.length, 1, 'exactly one GainNode created for the one element');
    assert.equal(fake.gains[0].value, 0.5, 'the gain, not the element, reached the target level');
    assert.equal(audio.volume, 1, 'element.volume is left at its default: the gain node owns loudness');

    useLandingMusicStore.getState().stop(); // off
    t.mock.timers.tick(FADE_MS_COMPLETE);
    assert.equal(fake.gains[0].value, 0, 'the gain faded all the way down on stop');
    assert.equal(audio.pauseCalls, 1, 'the element still pauses once the gain fade completes');

    // on again. The fake's createMediaElementSource throws if the same element is wrapped
    // twice (a real AudioContext does too), so reaching this line without a throw is itself
    // the proof that the cached GainNode was reused, not rebuilt, on this second tap.
    useLandingMusicStore.getState().toggle();
    await Promise.resolve();
    t.mock.timers.tick(FADE_MS_COMPLETE);
    assert.equal(fake.gains.length, 1, 'still the same one GainNode, not a second one');
    assert.equal(fake.gains[0].value, 0.5, 'the reused gain reached the target level again');
    assert.equal(audio.pauseCalls, 1, 'no extra pause from the second tap');
  } finally {
    fake.restore();
  }
});

test('a suspended AudioContext resumes on every tap, not only when it is first created', async (t) => {
  const fake = installFakeAudioContext();
  t.mock.timers.enable({ apis: ['setInterval'] });
  try {
    useLandingMusicStore.getState().toggle(); // on, creates the context, resume runs once at creation
    await Promise.resolve();
    t.mock.timers.tick(FADE_MS_COMPLETE);
    const resumeCallsAfterFirstTap = fake.getResumeCalls();

    useLandingMusicStore.getState().stop(); // off
    t.mock.timers.tick(FADE_MS_COMPLETE);

    // A screen lock or an incoming call can suspend the context between taps.
    const context = fake.getContext();
    assert.ok(context, 'the context must exist by now');
    context.state = 'suspended';

    useLandingMusicStore.getState().toggle(); // on again, same cached GainNode, same context
    assert.equal(
      fake.getResumeCalls(),
      resumeCallsAfterFirstTap + 1,
      'this second tap must resume the suspended context too, not only the first tap that created it',
    );
  } finally {
    fake.restore();
  }
});

test('tapping on marks the audio session playback, feature-detected and only from the tap', () => {
  const calls: string[] = [];
  const previousNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      audioSession: {
        set type(value: string) {
          calls.push(value);
        },
      },
    },
  });
  try {
    assert.deepEqual(calls, [], 'never touched before any tap');
    useLandingMusicStore.getState().toggle();
    assert.deepEqual(calls, ['playback'], 'set to playback exactly once, from inside the tap');
    useLandingMusicStore.getState().stop();
    assert.deepEqual(calls, ['playback'], 'stop never touches the session type');
  } finally {
    if (previousNavigator) Object.defineProperty(globalThis, 'navigator', previousNavigator);
    else delete (globalThis as { navigator?: unknown }).navigator;
  }
});

test('a missing navigator.audioSession is left alone, feature-detection does not throw', () => {
  const previousNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {} });
  try {
    assert.doesNotThrow(() => useLandingMusicStore.getState().toggle());
  } finally {
    if (previousNavigator) Object.defineProperty(globalThis, 'navigator', previousNavigator);
    else delete (globalThis as { navigator?: unknown }).navigator;
  }
});

test('when neither a GainNode nor a working element.volume is available, stop pauses immediately', () => {
  // A standalone class, not a FakeAudio subclass: a TS class field on the base (`volume = 1`)
  // uses define semantics and would shadow an accessor declared on a subclass, silently
  // defeating the very bug this test needs to reproduce (iOS Safari's real fault: the volume
  // setter is a no-op and the getter always echoes the same stale value).
  class UnreliableVolumeAudio {
    static instances: UnreliableVolumeAudio[] = [];
    src: string;
    loop = false;
    paused = true;
    pauseCalls = 0;
    #volume = 1;
    constructor(src: string) {
      this.src = src;
      UnreliableVolumeAudio.instances.push(this);
    }
    get volume() {
      return this.#volume;
    }
    set volume(_v: number) {
      /* the actual bug: assignment is silently ignored */
    }
    play() {
      this.paused = false;
      return Promise.resolve();
    }
    pause() {
      this.pauseCalls += 1;
      this.paused = true;
    }
  }
  (globalThis as { Audio?: unknown }).Audio = UnreliableVolumeAudio;
  useLandingMusicStore.getState().toggle();
  const audio = UnreliableVolumeAudio.instances[0];
  assert.equal(audio.paused, false);
  useLandingMusicStore.getState().stop();
  // No GainNode (no window.AudioContext in this test) and volume cannot actually be set, so
  // there is nothing to fade truthfully. The button already reads off, and sound must stop with it.
  assert.equal(audio.paused, true, 'paused immediately, the button never lies about what is audible');
  assert.equal(audio.pauseCalls, 1);
});
