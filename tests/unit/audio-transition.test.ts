import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { useAudioStore } from '../../src/engine/audio-store';

class TransitionAudio {
  static instances: TransitionAudio[] = [];
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
    TransitionAudio.instances.push(this);
  }

  addEventListener(event: string, listener: () => void) {
    this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener]);
  }
  removeEventListener(event: string, listener: () => void) {
    const next = (this.listeners.get(event) ?? []).filter((entry) => entry !== listener);
    this.listeners.set(event, next);
  }
  pause() { this.paused = true; }
  load() {}
  play() { this.paused = false; return TransitionAudio.playImplementation?.() ?? Promise.resolve(); }
  triggerError() {
    for (const listener of this.listeners.get('error') ?? []) listener();
  }
}

const cancellationManifest = {
  deliberate: { path: '/audio/deliberate.mp3', loop: true },
  reveal: { path: '/audio/reveal.mp3', loop: false },
  countdown: { path: '/audio/countdown.mp3', loop: false },
};

/** Live/pool elements still hold a src. Released beds clear src before re-warm. */
function bedsWithSrc() {
  return TransitionAudio.instances.filter((audio) => Boolean(audio.src));
}

function playingBeds() {
  return bedsWithSrc().filter((audio) => !audio.paused);
}

/** Let queued promise work settle, such as an incoming bed's play() resolving into its attack. */
async function flushMicrotasks(rounds = 12) {
  for (let round = 0; round < rounds; round += 1) await Promise.resolve();
}

async function prepareCancellation(t: TestContext, muted: boolean) {
  const previousAudio = (globalThis as { Audio?: unknown }).Audio;
  const previousRaf = globalThis.requestAnimationFrame;
  const previousCancelRaf = globalThis.cancelAnimationFrame;
  const frames = new Map<number, FrameRequestCallback>();
  let nextFrame = 0;
  t.mock.timers.enable({ apis: ['setTimeout'] });
  (globalThis as { Audio?: unknown }).Audio = TransitionAudio;
  globalThis.requestAnimationFrame = (callback) => { frames.set(++nextFrame, callback); return nextFrame; };
  globalThis.cancelAnimationFrame = (id) => { frames.delete(id); };
  t.after(() => {
    useAudioStore.getState().destroy();
    useAudioStore.setState({ unlocked: false, volume: 1, muted: false, status: 'idle', role: null, error: null });
    if (previousAudio === undefined) delete (globalThis as { Audio?: unknown }).Audio;
    else (globalThis as { Audio?: unknown }).Audio = previousAudio;
    globalThis.requestAnimationFrame = previousRaf;
    globalThis.cancelAnimationFrame = previousCancelRaf;
  });
  useAudioStore.getState().destroy();
  TransitionAudio.instances = [];
  TransitionAudio.playImplementation = null;
  useAudioStore.setState({ unlocked: true, volume: 0.7, muted, status: 'idle', role: null, error: null });
  await useAudioStore.getState().playMusic('deliberate', cancellationManifest);
  return {
    frame: (elapsedMs: number) => {
      const pending = [...frames.values()];
      frames.clear();
      for (const callback of pending) callback(performance.now() + elapsedMs);
    },
    advance: async (elapsedMs: number) => {
      t.mock.timers.tick(elapsedMs);
      await Promise.resolve();
    },
  };
}

for (const muted of [true, false]) {
  for (const action of ['stopMusic', 'pauseMusic'] as const) {
    test(`${action} during a ${muted ? 'muted' : 'unmuted'} transition preserves presenter volume and cancels replacement`, async (t) => {
      const clock = await prepareCancellation(t, muted);
      const transition = useAudioStore.getState().transitionMusic('countdown', cancellationManifest, { fadeDurationMs: 160 });
      // The outgoing bed starts its release once the incoming bed plays (VOF-86), so let that play resolve first.
      await flushMicrotasks();
      clock.frame(20);
      const outgoing = TransitionAudio.instances[0]!;
      assert.ok(muted ? outgoing.volume === 0 : outgoing.volume > 0 && outgoing.volume < 0.7, 'the outgoing bed must actually be attenuated');
      useAudioStore.getState()[action]();
      await transition;
      assert.equal(useAudioStore.getState().volume, 0.7);
      assert.equal(useAudioStore.getState().muted, muted);
      assert.equal(useAudioStore.getState().status, action === 'stopMusic' ? 'idle' : 'paused');
      assert.ok(TransitionAudio.instances.every((audio) => audio.paused), 'cancelled navigation leaves no playing bed');
      await useAudioStore.getState().playMusic('reveal', cancellationManifest);
      useAudioStore.getState().setMuted(false);
      if (muted) {
        assert.equal(TransitionAudio.instances.at(-1)!.volume, 0, 'unmute soft-attacks from silence');
        await clock.advance(720);
        clock.frame(720);
      }
      assert.equal(TransitionAudio.instances.at(-1)!.volume, 0.7, 'the next reveal must be audible after unmuting');
      assert.equal(TransitionAudio.instances.at(-1)!.muted, false);
      assert.equal(TransitionAudio.instances.filter((audio) => !audio.paused).length, 1);
    });

    test(`${action} after a ${muted ? 'muted' : 'unmuted'} fade completes preserves volume while play is pending`, async (t) => {
      const clock = await prepareCancellation(t, muted);
      let resolvePlay!: () => void;
      TransitionAudio.playImplementation = () => new Promise<void>((resolve) => { resolvePlay = resolve; });
      await useAudioStore.getState().playMusic('deliberate', cancellationManifest);
      const transition = useAudioStore.getState().transitionMusic('countdown', cancellationManifest, { fadeDurationMs: 160 });
      await Promise.resolve();
      await clock.advance(160);
      clock.frame(160);
      const incoming = TransitionAudio.instances.at(-1)!;
      assert.equal(incoming.volume, 0, 'incoming soft attack waits on play before rising');
      useAudioStore.getState()[action]();
      TransitionAudio.playImplementation = null;
      resolvePlay();
      await transition;
      assert.equal(useAudioStore.getState().volume, 0.7);
      assert.equal(incoming.paused, true);
    });
  }

  test(`an immediately stopped ${muted ? 'muted' : 'unmuted'} zero-duration transition preserves volume`, async (t) => {
    await prepareCancellation(t, muted);
    const transition = useAudioStore.getState().transitionMusic('countdown', cancellationManifest, { fadeDurationMs: 0 });
    useAudioStore.getState().stopMusic();
    await transition;
    assert.equal(useAudioStore.getState().volume, 0.7);
    assert.ok(TransitionAudio.instances.every((audio) => audio.paused));
  });

  test(`a completed ${muted ? 'muted' : 'unmuted'} transition restores presenter volume`, async (t) => {
    const clock = await prepareCancellation(t, muted);
    const transition = useAudioStore.getState().transitionMusic('countdown', cancellationManifest, { fadeDurationMs: 160 });
    await Promise.resolve();
    await clock.advance(160);
    await transition;
    await clock.advance(176);
    clock.frame(176);
    assert.equal(useAudioStore.getState().volume, 0.7);
    assert.equal(useAudioStore.getState().role, 'countdown');
    assert.equal(playingBeds().at(-1)!.volume, muted ? 0 : 0.7);
    assert.equal(playingBeds().length, 1);
  });

  test(`a completed ${muted ? 'muted' : 'unmuted'} duck restores presenter volume`, async (t) => {
    const clock = await prepareCancellation(t, muted);
    const duck = useAudioStore.getState().duck(100, 0.2);
    await clock.advance(48);
    assert.equal(useAudioStore.getState().volume, 0.2);
    await clock.advance(4);
    await clock.advance(48);
    assert.equal(await duck, 0.7);
    assert.equal(useAudioStore.getState().volume, 0.7);
    assert.equal(TransitionAudio.instances[0]!.volume, muted ? 0 : 0.7);
  });

  test(`a restarted ${muted ? 'muted' : 'unmuted'} duck survives the cancelled ramp-up continuation`, async (t) => {
    const clock = await prepareCancellation(t, muted);
    const firstDuck = useAudioStore.getState().duck(100, 0.2);
    await clock.advance(48);
    await clock.advance(4);
    const replacementDuck = useAudioStore.getState().duck(100, 0.1);
    await firstDuck;
    // The cancelled first ramp-up settles after the replacement is installed.
    // It must not clear that replacement's ownership or restoration timer.
    await clock.advance(48);
    assert.equal(useAudioStore.getState().volume, 0.1);
    useAudioStore.getState().stopMusic();
    assert.equal(useAudioStore.getState().volume, 0.7);
    assert.equal(await replacementDuck, 0.7);
  });

  test(`explicit volume cancels a ${muted ? 'muted' : 'unmuted'} duck ramp without leaving fading status`, async (t) => {
    const clock = await prepareCancellation(t, muted);
    const duck = useAudioStore.getState().duck(100, 0.2);
    await clock.advance(48);
    await clock.advance(4);
    useAudioStore.getState().setVolume(0.4);
    await duck;
    await clock.advance(100);
    assert.equal(useAudioStore.getState().volume, 0.4);
    assert.equal(useAudioStore.getState().status, 'playing');
    assert.equal(TransitionAudio.instances[0]!.volume, muted ? 0 : 0.4);
  });

  for (const volume of [0, 0.35]) {
    test(`explicit volume ${volume} wins over a pending ${muted ? 'muted' : 'unmuted'} transition`, async (t) => {
      const clock = await prepareCancellation(t, muted);
      const transition = useAudioStore.getState().transitionMusic('countdown', cancellationManifest, { fadeDurationMs: 160 });
      clock.frame(20);
      useAudioStore.getState().setVolume(volume);
      await transition;
      await clock.advance(176);
      clock.frame(176);
      assert.equal(useAudioStore.getState().volume, volume);
      assert.equal(useAudioStore.getState().role, 'countdown');
      useAudioStore.getState().setMuted(false);
      if (muted) {
        assert.equal(playingBeds().at(-1)!.volume, 0, 'unmute soft-attacks from silence');
        await clock.advance(720);
        clock.frame(720);
      }
      assert.equal(playingBeds().at(-1)!.volume, volume);
    });
  }

  for (const phase of ['down', 'hold', 'up'] as const) {
    test(`stopping ${muted ? 'muted' : 'unmuted'} duck ${phase} restores the pre-duck setting`, async (t) => {
      const clock = await prepareCancellation(t, muted);
      const duck = useAudioStore.getState().duck(100, 0.2);
      if (phase !== 'down') await clock.advance(48);
      if (phase === 'up') await clock.advance(4);
      clock.frame(5);
      useAudioStore.getState().stopMusic();
      await duck;
      assert.equal(useAudioStore.getState().volume, 0.7);
      assert.equal(useAudioStore.getState().muted, muted);
      await clock.advance(100);
      await useAudioStore.getState().playMusic('reveal', cancellationManifest);
      useAudioStore.getState().setMuted(false);
      if (muted) {
        assert.equal(TransitionAudio.instances.at(-1)!.volume, 0, 'unmute soft-attacks from silence');
        await clock.advance(720);
        clock.frame(720);
      }
      assert.equal(TransitionAudio.instances.at(-1)!.volume, 0.7);
    });
  }

  for (const action of ['pauseMusic', 'playMusic', 'setVolume'] as const) {
    test(`${action} cancels a ${muted ? 'muted' : 'unmuted'} duck hold without a late restore`, async (t) => {
      const clock = await prepareCancellation(t, muted);
      const duck = useAudioStore.getState().duck(100, 0.2);
      await clock.advance(48);
      assert.equal(useAudioStore.getState().volume, 0.2, 'the temporary duck level is reached');
      if (action === 'playMusic') await useAudioStore.getState().playMusic('reveal', cancellationManifest);
      else if (action === 'setVolume') useAudioStore.getState().setVolume(0.4);
      else useAudioStore.getState().pauseMusic();
      await clock.advance(4);
      await clock.advance(48);
      await duck;
      const expected = action === 'setVolume' ? 0.4 : 0.7;
      assert.equal(useAudioStore.getState().volume, expected);
      useAudioStore.getState().setMuted(false);
      const bed = TransitionAudio.instances.at(-1)!;
      if (muted && !bed.paused) {
        assert.equal(bed.volume, 0, 'unmute soft-attacks from silence');
        await clock.advance(720);
        clock.frame(720);
      }
      assert.equal(bed.volume, expected);
      if (action === 'pauseMusic') assert.equal(bed.paused, true);
    });
  }
}

test('latest audio transition wins after rapid navigation and stops the replaced media element', async (t) => {
  const previousAudio = (globalThis as { Audio?: unknown }).Audio;
  (globalThis as { Audio?: unknown }).Audio = TransitionAudio;
  t.after(() => {
    if (previousAudio === undefined) delete (globalThis as { Audio?: unknown }).Audio;
    else (globalThis as { Audio?: unknown }).Audio = previousAudio;
    useAudioStore.getState().destroy();
    useAudioStore.setState({ unlocked: false, volume: 1, muted: false, status: 'idle', role: null, error: null });
  });

  useAudioStore.getState().destroy();
  TransitionAudio.instances = [];
  TransitionAudio.playImplementation = null;
  useAudioStore.setState({ unlocked: true, volume: 0.7, muted: false, status: 'idle', role: null, error: null });
  const manifest = {
    deliberate: { path: '/audio/deliberate.mp3', loop: true },
    reveal: { path: '/audio/reveal.mp3', loop: false },
    countdown: { path: '/audio/countdown.mp3', loop: false },
  };

  await useAudioStore.getState().playMusic('deliberate', manifest);
  const staleTransition = useAudioStore.getState().transitionMusic('reveal', manifest, { fadeDurationMs: 20 });
  const latestTransition = useAudioStore.getState().transitionMusic('countdown', manifest, { fadeDurationMs: 0 });
  await Promise.all([staleTransition, latestTransition]);

  assert.equal(useAudioStore.getState().role, 'countdown');
  assert.equal(useAudioStore.getState().volume, 0.7, 'the presenter volume is restored after replacement');
  assert.equal(TransitionAudio.instances.filter((audio) => !audio.paused).length, 1, 'only the latest bed may play');
  assert.equal(TransitionAudio.instances.at(-1)?.paused, false, 'the latest role remains playing');
  assert.ok(
    TransitionAudio.instances.slice(0, -1).every((audio) => audio.paused),
    'replaced beds must be stopped',
  );
});

test('a late error from replaced audio cannot corrupt the current role', async (t) => {
  const previousAudio = (globalThis as { Audio?: unknown }).Audio;
  (globalThis as { Audio?: unknown }).Audio = TransitionAudio;
  t.after(() => {
    if (previousAudio === undefined) delete (globalThis as { Audio?: unknown }).Audio;
    else (globalThis as { Audio?: unknown }).Audio = previousAudio;
    useAudioStore.getState().destroy();
    useAudioStore.setState({ unlocked: false, volume: 1, muted: false, status: 'idle', role: null, error: null });
  });

  useAudioStore.getState().destroy();
  TransitionAudio.instances = [];
  TransitionAudio.playImplementation = null;
  useAudioStore.setState({ unlocked: true, volume: 0.7, muted: false, status: 'idle', role: null, error: null });
  const manifest = {
    deliberate: { path: '/audio/deliberate.mp3', loop: true },
    countdown: { path: '/audio/countdown.mp3', loop: false },
  };

  await useAudioStore.getState().playMusic('deliberate', manifest);
  await useAudioStore.getState().transitionMusic('countdown', manifest, { fadeDurationMs: 0 });
  TransitionAudio.instances[0]?.triggerError();

  assert.equal(useAudioStore.getState().role, 'countdown');
  assert.equal(useAudioStore.getState().status, 'playing');
  assert.equal(useAudioStore.getState().error, null);
  assert.equal(playingBeds().length, 1);
  assert.match(playingBeds()[0]!.src, /countdown\.mp3/);
});

test('stop cancels a replacement queued behind an unresolved first play', async (t) => {
  const previousAudio = (globalThis as { Audio?: unknown }).Audio;
  (globalThis as { Audio?: unknown }).Audio = TransitionAudio;
  t.after(() => {
    if (previousAudio === undefined) delete (globalThis as { Audio?: unknown }).Audio;
    else (globalThis as { Audio?: unknown }).Audio = previousAudio;
    TransitionAudio.playImplementation = null;
    useAudioStore.getState().destroy();
    useAudioStore.setState({ unlocked: false, volume: 1, muted: false, status: 'idle', role: null, error: null });
  });

  let resolveFirstPlay: (() => void) | null = null;
  const firstPlay = new Promise<void>((resolve) => { resolveFirstPlay = resolve; });
  let plays = 0;
  useAudioStore.getState().destroy();
  TransitionAudio.instances = [];
  TransitionAudio.playImplementation = () => ++plays === 1 ? firstPlay : Promise.resolve();
  useAudioStore.setState({ unlocked: true, volume: 0.7, muted: false, status: 'idle', role: null, error: null });
  const manifest = {
    deliberate: { path: '/audio/deliberate.mp3', loop: true },
    countdown: { path: '/audio/countdown.mp3', loop: false },
  };

  await useAudioStore.getState().playMusic('deliberate', manifest);
  const queuedTransition = useAudioStore.getState().transitionMusic('countdown', manifest, { fadeDurationMs: 0 });
  await Promise.resolve();
  useAudioStore.getState().stopMusic();
  resolveFirstPlay?.();
  await queuedTransition;

  assert.equal(
    bedsWithSrc().filter((audio) => audio.src.includes('countdown')).length,
    0,
    'the cancelled transition must not construct replacement media',
  );
  assert.equal(playingBeds().length, 0, 'the pending original must be stopped after its play resolves');
  assert.deepEqual({ role: useAudioStore.getState().role, status: useAudioStore.getState().status }, { role: null, status: 'idle' });
});

test('the latest queued replacement wins while the original play is pending', async (t) => {
  const previousAudio = (globalThis as { Audio?: unknown }).Audio;
  (globalThis as { Audio?: unknown }).Audio = TransitionAudio;
  t.after(() => {
    if (previousAudio === undefined) delete (globalThis as { Audio?: unknown }).Audio;
    else (globalThis as { Audio?: unknown }).Audio = previousAudio;
    TransitionAudio.playImplementation = null;
    useAudioStore.getState().destroy();
    useAudioStore.setState({ unlocked: false, volume: 1, muted: false, status: 'idle', role: null, error: null });
  });

  let resolveFirstPlay: (() => void) | null = null;
  const firstPlay = new Promise<void>((resolve) => { resolveFirstPlay = resolve; });
  let plays = 0;
  useAudioStore.getState().destroy();
  TransitionAudio.instances = [];
  TransitionAudio.playImplementation = () => ++plays === 1 ? firstPlay : Promise.resolve();
  useAudioStore.setState({ unlocked: true, volume: 0.7, muted: false, status: 'idle', role: null, error: null });
  const manifest = {
    deliberate: { path: '/audio/deliberate.mp3', loop: true },
    reveal: { path: '/audio/reveal.mp3', loop: false },
    countdown: { path: '/audio/countdown.mp3', loop: false },
  };

  await useAudioStore.getState().playMusic('deliberate', manifest);
  const staleTransition = useAudioStore.getState().transitionMusic('reveal', manifest, { fadeDurationMs: 0 });
  const latestTransition = useAudioStore.getState().transitionMusic('countdown', manifest, { fadeDurationMs: 0 });
  await Promise.resolve();
  resolveFirstPlay?.();
  await Promise.all([staleTransition, latestTransition]);

  assert.equal(playingBeds().length, 1, 'only the latest replacement may play');
  assert.match(playingBeds()[0]!.src, /countdown\.mp3/);
  assert.equal(
    bedsWithSrc().filter((audio) => audio.src.includes('reveal')).length,
    0,
    'stale reveal replacement must be released',
  );
  assert.deepEqual({ role: useAudioStore.getState().role, status: useAudioStore.getState().status }, { role: 'countdown', status: 'playing' });
});

test('overlapping transitions never leave two music elements playing', async (t) => {
  const previousAudio = (globalThis as { Audio?: unknown }).Audio;
  (globalThis as { Audio?: unknown }).Audio = TransitionAudio;
  t.after(() => {
    if (previousAudio === undefined) delete (globalThis as { Audio?: unknown }).Audio;
    else (globalThis as { Audio?: unknown }).Audio = previousAudio;
    useAudioStore.getState().destroy();
    useAudioStore.setState({ unlocked: false, volume: 1, muted: false, status: 'idle', role: null, error: null });
  });

  useAudioStore.getState().destroy();
  TransitionAudio.instances = [];
  TransitionAudio.playImplementation = null;
  useAudioStore.setState({ unlocked: true, volume: 0.7, muted: false, status: 'idle', role: null, error: null });
  const manifest = {
    walkin: { path: '/audio/walkin.mp3', loop: true },
    'menu-soft': { path: '/audio/menu-soft.mp3', loop: true },
    deliberate: { path: '/audio/deliberate.mp3', loop: true },
    countdown: { path: '/audio/countdown.mp3', loop: false },
  };

  await useAudioStore.getState().playMusic('walkin', manifest);
  const first = useAudioStore.getState().transitionMusic('menu-soft', manifest, { fadeDurationMs: 0 });
  const second = useAudioStore.getState().transitionMusic('deliberate', manifest, { fadeDurationMs: 0 });
  await Promise.all([first, second]);

  const playing = TransitionAudio.instances.filter((audio) => !audio.paused);
  assert.equal(playing.length, 1, 'only one HTMLAudioElement may play after overlapping transitions');
  assert.equal(playing[0]?.src, '/audio/deliberate.mp3');
  assert.equal(useAudioStore.getState().role, 'deliberate');
});

test('role swaps crossfade so the incoming bed starts before the outgoing bed reaches silence', async (t) => {
  const previousAudio = (globalThis as { Audio?: unknown }).Audio;
  const previousRaf = globalThis.requestAnimationFrame;
  const previousCancelRaf = globalThis.cancelAnimationFrame;
  const frames = new Map<number, FrameRequestCallback>();
  let nextFrame = 0;
  (globalThis as { Audio?: unknown }).Audio = TransitionAudio;
  globalThis.requestAnimationFrame = (callback) => { frames.set(++nextFrame, callback); return nextFrame; };
  globalThis.cancelAnimationFrame = (id) => { frames.delete(id); };
  t.after(() => {
    if (previousAudio === undefined) delete (globalThis as { Audio?: unknown }).Audio;
    else (globalThis as { Audio?: unknown }).Audio = previousAudio;
    globalThis.requestAnimationFrame = previousRaf;
    globalThis.cancelAnimationFrame = previousCancelRaf;
    useAudioStore.getState().destroy();
    useAudioStore.setState({ unlocked: false, volume: 1, muted: false, status: 'idle', role: null, error: null });
  });

  useAudioStore.getState().destroy();
  TransitionAudio.instances = [];
  TransitionAudio.playImplementation = null;
  useAudioStore.setState({ unlocked: true, volume: 0.8, muted: false, status: 'idle', role: null, error: null });
  const manifest = {
    walkin: { path: '/audio/walkin.mp3', loop: true },
    'menu-soft': { path: '/audio/menu-soft.mp3', loop: true },
  };

  await useAudioStore.getState().playMusic('walkin', manifest);
  let startIncoming!: () => void;
  TransitionAudio.playImplementation = () => new Promise<void>((resolve) => { startIncoming = resolve; });
  const transition = useAudioStore.getState().transitionMusic('menu-soft', manifest, { fadeDurationMs: 200 });
  await flushMicrotasks();
  assert.equal(TransitionAudio.instances.length, 2, 'incoming bed is constructed while outgoing still lives');
  assert.equal(TransitionAudio.instances[0]?.paused, false, 'outgoing bed still plays during the overlap');
  assert.equal(TransitionAudio.instances[1]?.paused, false, 'incoming bed starts during the overlap');
  assert.equal(TransitionAudio.instances[1]?.volume, 0, 'incoming bed soft-attacks from silence');

  // Release waits for attack (VOF-86): while the incoming bed's play() is still pending (a cold fetch), the outgoing
  // bed holds its level. It used to fade at once and leave a hole when the incoming bed was slow to start.
  for (const callback of [...frames.values()]) callback(performance.now() + 400);
  frames.clear();
  assert.equal(TransitionAudio.instances[0]!.volume, 0.8, 'outgoing bed holds until the incoming bed plays');

  TransitionAudio.playImplementation = null;
  startIncoming();
  await flushMicrotasks();
  for (const callback of [...frames.values()]) callback(performance.now() + 40);
  frames.clear();
  assert.ok(TransitionAudio.instances[0]!.volume < 0.8, 'outgoing bed is releasing');
  assert.ok(TransitionAudio.instances[0]!.volume > 0, 'outgoing bed has not hit silence yet');

  await transition;
  for (const callback of [...frames.values()]) callback(performance.now() + 200);
  frames.clear();
  useAudioStore.getState().stopMusic();
  assert.equal(useAudioStore.getState().role, null);
});

test('mute during a crossfade silences the outgoing bed as well as the incoming one', async (t) => {
  const previousAudio = (globalThis as { Audio?: unknown }).Audio;
  const previousRaf = globalThis.requestAnimationFrame;
  const previousCancelRaf = globalThis.cancelAnimationFrame;
  const frames = new Map<number, FrameRequestCallback>();
  let nextFrame = 0;
  (globalThis as { Audio?: unknown }).Audio = TransitionAudio;
  globalThis.requestAnimationFrame = (callback) => { frames.set(++nextFrame, callback); return nextFrame; };
  globalThis.cancelAnimationFrame = (id) => { frames.delete(id); };
  t.after(() => {
    if (previousAudio === undefined) delete (globalThis as { Audio?: unknown }).Audio;
    else (globalThis as { Audio?: unknown }).Audio = previousAudio;
    globalThis.requestAnimationFrame = previousRaf;
    globalThis.cancelAnimationFrame = previousCancelRaf;
    useAudioStore.getState().destroy();
    useAudioStore.setState({ unlocked: false, volume: 1, muted: false, status: 'idle', role: null, error: null });
  });

  useAudioStore.getState().destroy();
  TransitionAudio.instances = [];
  TransitionAudio.playImplementation = null;
  useAudioStore.setState({ unlocked: true, volume: 0.8, muted: false, status: 'idle', role: null, error: null });
  const manifest = {
    walkin: { path: '/audio/walkin.mp3', loop: true },
    'menu-soft': { path: '/audio/menu-soft.mp3', loop: true },
  };

  await useAudioStore.getState().playMusic('walkin', manifest);
  const transition = useAudioStore.getState().transitionMusic('menu-soft', manifest, { fadeDurationMs: 200 });
  await Promise.resolve();
  for (const callback of [...frames.values()]) callback(performance.now() + 40);
  frames.clear();
  const outgoing = TransitionAudio.instances[0]!;
  const incoming = TransitionAudio.instances[1]!;
  assert.ok(outgoing.volume > 0.05, 'outgoing still audible mid-release before mute');
  useAudioStore.getState().setMuted(true);
  assert.equal(outgoing.muted, true, 'outgoing crossfade bed must mute with the host');
  assert.equal(outgoing.volume, 0, 'outgoing volume snaps quiet on mute');
  assert.equal(incoming.muted, true);
  assert.equal(incoming.volume, 0);
  useAudioStore.getState().stopMusic();
  await transition.catch(() => {});
});

test('releasing a bed re-warms a fresh element so deliberate↔menu-soft returns are not cold', async (t) => {
  const previousAudio = (globalThis as { Audio?: unknown }).Audio;
  (globalThis as { Audio?: unknown }).Audio = TransitionAudio;
  t.after(() => {
    useAudioStore.getState().destroy();
    useAudioStore.setState({ unlocked: false, volume: 1, muted: false, status: 'idle', role: null, error: null });
    if (previousAudio === undefined) delete (globalThis as { Audio?: unknown }).Audio;
    else (globalThis as { Audio?: unknown }).Audio = previousAudio;
  });
  useAudioStore.getState().destroy();
  TransitionAudio.instances = [];
  TransitionAudio.playImplementation = null;
  useAudioStore.setState({ unlocked: true, volume: 0.7, muted: false, status: 'idle', role: null, error: null });

  useAudioStore.getState().prefetchMusic(['deliberate'], cancellationManifest);
  assert.equal(TransitionAudio.instances.length, 1, 'prefetch warms one deliberate element');
  const warmed = TransitionAudio.instances[0]!;

  await useAudioStore.getState().playMusic('deliberate', cancellationManifest, { fadeInMs: 0 });
  assert.equal(TransitionAudio.instances[0], warmed, 'first play consumes the warmed element');

  useAudioStore.getState().stopMusic();
  assert.ok(
    TransitionAudio.instances.length >= 2,
    'release must spawn a fresh warmer under the same src',
  );
  const rewarmed = TransitionAudio.instances.at(-1)!;
  assert.notEqual(rewarmed, warmed, 'MediaElementSource cannot reuse the spent element');
  assert.match(rewarmed.src, /deliberate\.mp3/);

  await useAudioStore.getState().playMusic('deliberate', cancellationManifest, { fadeInMs: 0 });
  assert.equal(
    TransitionAudio.instances.filter((audio) => !audio.paused).at(-1),
    rewarmed,
    'second deliberate play must take the re-warmed element, not construct a third cold loader',
  );
});

test('without Web Audio, a reveal during a sting fades the bed from where the duck left it, never snapping it up', async (t) => {
  const previousAudio = (globalThis as { Audio?: unknown }).Audio;
  const previousRaf = globalThis.requestAnimationFrame;
  const previousCancelRaf = globalThis.cancelAnimationFrame;
  const frames = new Map<number, FrameRequestCallback>();
  let nextFrame = 0;
  (globalThis as { Audio?: unknown }).Audio = TransitionAudio;
  globalThis.requestAnimationFrame = (callback) => { frames.set(++nextFrame, callback); return nextFrame; };
  globalThis.cancelAnimationFrame = (id) => { frames.delete(id); };
  t.after(() => {
    if (previousAudio === undefined) delete (globalThis as { Audio?: unknown }).Audio;
    else (globalThis as { Audio?: unknown }).Audio = previousAudio;
    globalThis.requestAnimationFrame = previousRaf;
    globalThis.cancelAnimationFrame = previousCancelRaf;
    useAudioStore.getState().destroy();
    useAudioStore.setState({ unlocked: false, volume: 1, muted: false, status: 'idle', role: null, error: null });
  });
  useAudioStore.getState().destroy();
  TransitionAudio.instances = [];
  TransitionAudio.playImplementation = null;
  useAudioStore.setState({ unlocked: true, volume: 1, muted: false, status: 'idle', role: null, error: null });
  await useAudioStore.getState().playMusic('deliberate', cancellationManifest);
  const bed = TransitionAudio.instances.at(-1)!;
  void useAudioStore.getState().duck(640, 0.25);
  const started = performance.now();
  for (const callback of [...frames.values()]) callback(started + 200);
  frames.clear();
  assert.ok(bed.volume <= 0.26, `ducked first (${bed.volume})`);
  useAudioStore.getState().releaseMusic(720);
  assert.ok(bed.volume <= 0.26, `the reveal does not snap the bed back up before fading it (${bed.volume})`);
});
