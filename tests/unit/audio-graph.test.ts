// The show's audio-clock path (VOF-86): each bed on its own level, stings on a separate duck stage, the presenter's
// volume and mute on the master, every ramp anchored where it is. The fake AudioParam below follows Web Audio's own
// automation rules (a linear ramp runs from the previous event), so an unanchored ramp or a cancelled fade shows up
// here as the same jump a real browser makes. The browser trace (npm run test:audio-trace) covers the full show.
import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { useAudioStore } from '../../src/engine/audio-store';

type AutomationEvent = { kind: 'set' | 'linear'; time: number; value: number };

class FakeParam {
  events: AutomationEvent[] = [];
  constructor(private readonly context: FakeContext, private readonly intrinsic = 1) {}
  get value() { return this.valueAt(this.context.currentTime); }
  set value(next: number) { this.events = [{ kind: 'set', time: this.context.currentTime, value: next }]; }
  cancelScheduledValues(time: number) { this.events = this.events.filter((event) => event.time < time); }
  setValueAtTime(value: number, time: number) { this.insert({ kind: 'set', time, value }); }
  linearRampToValueAtTime(value: number, time: number) { this.insert({ kind: 'linear', time, value }); }
  private insert(event: AutomationEvent) {
    this.events.push(event);
    this.events.sort((a, b) => a.time - b.time);
  }
  valueAt(time: number): number {
    let previous: AutomationEvent | null = null;
    for (const event of this.events) {
      if (event.time <= time) { previous = event; continue; }
      if (event.kind === 'linear') {
        const from = previous ?? { time, value: this.intrinsic };
        if (event.time <= from.time) return event.value;
        return from.value + (event.value - from.value) * ((time - from.time) / (event.time - from.time));
      }
      break;
    }
    return previous ? previous.value : this.intrinsic;
  }
}

class FakeNode {
  outputs: unknown[] = [];
  connect(target: unknown) { this.outputs.push(target); return target; }
  disconnect() { this.outputs = []; }
}

class FakeGain extends FakeNode {
  gain: FakeParam;
  constructor(context: FakeContext) { super(); this.gain = new FakeParam(context); }
}

class FakeSource extends FakeNode {
  constructor(readonly element: GraphAudio) { super(); }
}

class FakeContext {
  static last: FakeContext | null = null;
  currentTime = 0;
  state = 'running';
  destination = new FakeNode();
  gains: FakeGain[] = [];
  sources: FakeSource[] = [];
  constructor() { FakeContext.last = this; }
  resume() { return Promise.resolve(); }
  close() { return Promise.resolve(); }
  createGain() { const gain = new FakeGain(this); this.gains.push(gain); return gain; }
  createMediaElementSource(element: GraphAudio) {
    if (this.sources.some((source) => source.element === element)) throw new Error('InvalidStateError: element already has a source');
    const source = new FakeSource(element);
    this.sources.push(source);
    return source;
  }
  /** The level an element's audio leaves the graph at: every gain on its path to the destination multiplied. */
  levelOf(element: GraphAudio): number {
    const source = this.sources.find((entry) => entry.element === element);
    if (!source || element.paused) return 0;
    const walk = (node: unknown, depth: number): number => {
      if (node === this.destination) return 1;
      if (depth > 8 || !(node instanceof FakeNode)) return 0;
      const own = node instanceof FakeGain ? node.gain.valueAt(this.currentTime) : 1;
      return own * node.outputs.reduce<number>((sum, next) => sum + walk(next, depth + 1), 0);
    };
    return walk(source, 0) * element.volume;
  }
}

class GraphAudio {
  static instances: GraphAudio[] = [];
  static nextPlay: (() => Promise<void>) | null = null;
  /** The next play() reports playing but its playhead stays put, as a stalled fetch does. */
  static stallNext = false;
  src: string;
  loop = false;
  muted = false;
  paused = true;
  currentTime = 0;
  volume = 1;
  error = null;
  private listeners = new Map<string, Array<() => void>>();
  constructor(src = '') { this.src = src; GraphAudio.instances.push(this); }
  addEventListener(name: string, listener: () => void) {
    this.listeners.set(name, [...(this.listeners.get(name) ?? []), listener]);
  }
  removeEventListener(name: string, listener: () => void) {
    this.listeners.set(name, (this.listeners.get(name) ?? []).filter((entry) => entry !== listener));
  }
  emit(name: string) {
    for (const listener of this.listeners.get(name) ?? []) listener();
  }
  pause() { this.paused = true; }
  load() {}
  play() {
    this.paused = false;
    // A playing element's playhead moves. A stalled one sits still until its data arrives.
    if (GraphAudio.stallNext) GraphAudio.stallNext = false;
    else this.currentTime += 0.05;
    const pending = GraphAudio.nextPlay;
    GraphAudio.nextPlay = null;
    return pending ? pending() : Promise.resolve();
  }
}

const manifest = {
  walkin: { path: '/audio/walkin.mp3', loop: true },
  'menu-soft': { path: '/audio/menu-soft.mp3', loop: true },
  deliberate: { path: '/audio/deliberate.mp3', loop: true },
};

async function settle(rounds = 12) {
  for (let round = 0; round < rounds; round += 1) await Promise.resolve();
}

function installGraph(t: TestContext) {
  const previousWindow = globalThis.window;
  const previousAudio = (globalThis as { Audio?: unknown }).Audio;
  t.mock.timers.enable({ apis: ['setTimeout'] });
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { AudioContext: FakeContext, addEventListener() {}, removeEventListener() {}, localStorage: { getItem: () => 'false', setItem() {} } },
  });
  (globalThis as { Audio?: unknown }).Audio = GraphAudio;
  t.after(() => {
    useAudioStore.getState().destroy();
    useAudioStore.setState({ unlocked: false, volume: 1, muted: false, status: 'idle', role: null, error: null });
    Object.defineProperty(globalThis, 'window', { configurable: true, value: previousWindow });
    if (previousAudio === undefined) delete (globalThis as { Audio?: unknown }).Audio;
    else (globalThis as { Audio?: unknown }).Audio = previousAudio;
  });
  useAudioStore.getState().destroy();
  GraphAudio.instances = [];
  GraphAudio.nextPlay = null;
  GraphAudio.stallNext = false;
  useAudioStore.setState({ unlocked: false, volume: 1, muted: false, status: 'idle', role: null, error: null });
  useAudioStore.getState().unlock();
  const context = FakeContext.last!;
  const [master, duck] = context.gains;
  return { context, master: master!, duck: duck! };
}

/** The element playing a track, newest first (released elements clear their src). */
function playing(file: string) {
  return [...GraphAudio.instances].reverse().find((audio) => audio.src.endsWith(file) && !audio.paused)!;
}

test('the graph is master to destination, the duck stage into the master, and each bed through its own level', async (t) => {
  const { context, master, duck } = installGraph(t);
  assert.deepEqual(master.outputs, [context.destination]);
  assert.deepEqual(duck.outputs, [master]);
  await useAudioStore.getState().transitionMusic('walkin', manifest, { fadeDurationMs: 720 });
  await settle();
  const bed = playing('walkin.mp3');
  const source = context.sources.find((entry) => entry.element === bed)!;
  const envelope = source.outputs[0] as FakeGain;
  assert.ok(envelope instanceof FakeGain && envelope !== master && envelope !== duck, 'the bed has a level of its own');
  assert.deepEqual(envelope.outputs, [duck]);
  assert.equal(bed.volume, 1, 'a routed bed stays at unity, its level ramps on the audio clock');
  context.currentTime = 1;
  assert.equal(context.levelOf(bed), 1, 'the soft attack reaches full level');
});

test('a sting dips the music about 12 dB on the duck stage only, then glides back', async (t) => {
  const { context, master, duck } = installGraph(t);
  await useAudioStore.getState().playMusic('menu-soft', manifest);
  await settle();
  const bed = playing('menu-soft.mp3');
  context.currentTime = 2;
  void useAudioStore.getState().duck(640, 0.25);
  context.currentTime = 2.05;
  const partway = context.levelOf(bed);
  assert.ok(partway < 1 && partway > 0.25, `the dip ramps down instead of stepping (${partway})`);
  context.currentTime = 2.2;
  assert.equal(context.levelOf(bed), 0.25, 'about -12 dB, not squared to -24 dB');
  assert.equal(master.gain.valueAt(2.2), 1, 'the master is untouched');
  assert.equal(duck.gain.valueAt(2.2), 0.25);
  context.currentTime = 2.39 + 0.125;
  const rising = context.levelOf(bed);
  assert.ok(rising > 0.25 && rising < 1, `it glides back up (${rising})`);
  context.currentTime = 3;
  assert.equal(context.levelOf(bed), 1);
});

test('a second sting inside the hold extends the dip instead of popping the music back up between them', async (t) => {
  const { context, duck } = installGraph(t);
  await useAudioStore.getState().playMusic('menu-soft', manifest);
  await settle();
  context.currentTime = 1;
  void useAudioStore.getState().duck(640, 0.25);
  context.currentTime = 1.02;
  void useAudioStore.getState().duck(640, 0.25);
  // The first sting's way down keeps its timing (at the floor by 1.09 s), and nothing rises before the second
  // sting's hold ends (1.41 s).
  let previous = duck.gain.valueAt(1.02);
  for (let time = 1.03; time <= 1.405; time += 0.005) {
    const level = duck.gain.valueAt(time);
    assert.ok(level <= previous + 1e-9, `never rises between the stings (${level} after ${previous} at ${time.toFixed(3)} s)`);
    if (time >= 1.09) assert.equal(Number(level.toFixed(6)), 0.25, `at the floor at ${time.toFixed(3)} s`);
    previous = level;
  }
  assert.ok(duck.gain.valueAt(1.5) > 0.25, 'and then glides back');
});

test('the reveal fades the bed out under its sting, and the sting cannot cut the fade short', async (t) => {
  const { context } = installGraph(t);
  await useAudioStore.getState().playMusic('menu-soft', manifest);
  await settle();
  const bed = playing('menu-soft.mp3');
  context.currentTime = 5;
  useAudioStore.getState().releaseMusic(720);
  void useAudioStore.getState().duck(640, 0.25);
  context.currentTime = 5.36;
  const midway = context.levelOf(bed);
  assert.ok(midway > 0 && midway < 0.5, `still sounding, faded and ducked at the midpoint (${midway})`);
  assert.equal(bed.paused, false, 'the element is not stopped while it is audible');
  context.currentTime = 5.72;
  assert.equal(context.levelOf(bed), 0, 'silent at the end of the fade');
  t.mock.timers.tick(800);
  assert.equal(bed.paused, true, 'released once the fade is done');
  assert.equal(useAudioStore.getState().role, null);
});

test('a bed fading on an audio clock that lags the wall clock keeps sounding until its ramp has run on that clock', async (t) => {
  // The 2026-10-01 audio traces: on a starved audio thread the bed's clock ran at 0.75x of wall time, and the bed was stopped
  // on its wall timer with its gain still at 0.178, an audible cut at the reveal. Here the context clock runs at 0.75x too.
  const { context } = installGraph(t);
  await useAudioStore.getState().playMusic('menu-soft', manifest);
  await settle();
  const bed = playing('menu-soft.mp3');
  const envelope = context.sources.find((entry) => entry.element === bed)!.outputs[0] as FakeGain;
  context.currentTime = 5;
  useAudioStore.getState().releaseMusic(720);
  const lagging = (wallMs: number) => { context.currentTime += (wallMs / 1000) * 0.75; t.mock.timers.tick(wallMs); };
  lagging(780);
  assert.ok(context.currentTime < 5.72, 'the audio clock is still inside the ramp when the wall timer runs out');
  const level = envelope.gain.valueAt(context.currentTime);
  assert.ok(level > 0.1, `the bed's own level is still up on its clock (${level})`);
  assert.equal(bed.paused, false, 'so it is not stopped while it is still audible');
  assert.ok(context.levelOf(bed) > 0.1, 'and it is still sounding');
  for (let step = 0; step < 20 && !bed.paused; step += 1) {
    const before = context.currentTime;
    lagging(50);
    if (bed.paused) assert.ok(before + 0.0375 >= 5.72, `stopped only once its clock has passed the ramp's end (${context.currentTime})`);
  }
  assert.equal(bed.paused, true, 'it is released once the ramp has run on the audio clock');
  assert.ok(context.currentTime >= 5.72);
  assert.equal(useAudioStore.getState().role, null);
});

test('a bed whose audio clock stops advancing is still released within a bound, so no fade waits forever', async (t) => {
  const { context } = installGraph(t);
  await useAudioStore.getState().playMusic('menu-soft', manifest);
  await settle();
  const bed = playing('menu-soft.mp3');
  context.currentTime = 5;
  useAudioStore.getState().releaseMusic(720);
  t.mock.timers.tick(780);
  assert.equal(bed.paused, false, 'a frozen clock never reached the end of the ramp');
  let waited = 780;
  while (!bed.paused && waited < 6000) { t.mock.timers.tick(50); waited += 50; }
  assert.equal(bed.paused, true, 'released anyway (a suspended context sounds nothing)');
  assert.ok(waited <= 780 + 2000 + 50, `within the bound of 2 s past its schedule (${waited} ms)`);
});

test('a bed on an audio clock in step with the wall clock is released on its old schedule', async (t) => {
  const { context } = installGraph(t);
  await useAudioStore.getState().playMusic('menu-soft', manifest);
  await settle();
  const bed = playing('menu-soft.mp3');
  context.currentTime = 5;
  useAudioStore.getState().releaseMusic(720);
  context.currentTime = 5 + 0.779;
  t.mock.timers.tick(779);
  assert.equal(bed.paused, false, 'not before the fade and its settle margin');
  context.currentTime = 5.78;
  t.mock.timers.tick(1);
  assert.equal(bed.paused, true, 'released at the fade plus its settle margin, as before');
});

test('a swap holds the outgoing bed until the incoming one really plays, then overlaps them', async (t) => {
  const { context } = installGraph(t);
  await useAudioStore.getState().playMusic('deliberate', manifest);
  await settle();
  const outgoing = playing('deliberate.mp3');
  let startIncoming!: () => void;
  GraphAudio.nextPlay = () => new Promise<void>((resolve) => { startIncoming = resolve; });
  context.currentTime = 10;
  void useAudioStore.getState().transitionMusic('menu-soft', manifest, { fadeDurationMs: 720 });
  await settle();
  context.currentTime = 11.5;
  assert.equal(context.levelOf(outgoing), 1, 'the outgoing bed holds while the incoming fetch is still pending');
  startIncoming();
  await settle();
  const incoming = playing('menu-soft.mp3');
  context.currentTime = 11.86;
  const outLevel = context.levelOf(outgoing);
  const inLevel = context.levelOf(incoming);
  // The old bed holds 120 ms before it fades, so it is a beat behind the new bed's rise.
  assert.ok(outLevel > 0.6 && outLevel < 0.72 && inLevel > 0.4 && inLevel < 0.6, `they overlap from the moment the new bed plays (${outLevel}, ${inLevel})`);
  context.currentTime = 12.4;
  assert.equal(context.levelOf(outgoing), 0);
  assert.equal(context.levelOf(incoming), 1);
});

test('an incoming bed that never starts lets the outgoing one go after the wait limit', async (t) => {
  const { context } = installGraph(t);
  await useAudioStore.getState().playMusic('deliberate', manifest);
  await settle();
  const outgoing = playing('deliberate.mp3');
  GraphAudio.nextPlay = () => new Promise<void>(() => {});
  context.currentTime = 20;
  void useAudioStore.getState().transitionMusic('menu-soft', manifest, { fadeDurationMs: 720 });
  await settle();
  t.mock.timers.tick(3000);
  context.currentTime = 23.72;
  assert.equal(context.levelOf(outgoing), 0, 'faded out after the wait limit');
});

test('a ramp scheduled mid-ramp starts where the level is, never from an older point', async (t) => {
  const { context, master } = installGraph(t);
  await useAudioStore.getState().playMusic('menu-soft', manifest);
  await settle();
  context.currentTime = 1;
  void useAudioStore.getState().fadeTo(0.5, 1000);
  context.currentTime = 1.5;
  const before = master.gain.valueAt(1.5);
  void useAudioStore.getState().fadeTo(1, 200);
  assert.ok(Math.abs(master.gain.valueAt(1.5) - before) < 1e-9, `no jump when the second ramp takes over (${before})`);
  assert.ok(Math.abs(before - 0.75) < 1e-9);
  context.currentTime = 1.8;
  assert.equal(master.gain.valueAt(1.8), 1);
});

test('mute glides the master to silence and unmute rises over the bed-swap time', async (t) => {
  const { context, master } = installGraph(t);
  await useAudioStore.getState().playMusic('menu-soft', manifest);
  await settle();
  const bed = playing('menu-soft.mp3');
  context.currentTime = 3;
  useAudioStore.getState().setMuted(true, { persist: false });
  context.currentTime = 3.03;
  assert.equal(context.levelOf(bed), 0, 'muted');
  assert.equal(bed.muted, false, 'the master carries mute, so the element is never snapped');
  useAudioStore.getState().setMuted(false, { persist: false });
  context.currentTime = 3.39;
  const rising = master.gain.valueAt(3.39);
  assert.ok(rising > 0.3 && rising < 0.7, `unmute soft-attacks (${rising})`);
  context.currentTime = 3.8;
  assert.equal(context.levelOf(bed), 1);
});

test('an outgoing bed that wraps its loop mid-crossfade keeps its level, so the swap has no hole', async (t) => {
  // Audio trace, solo close: menu-soft wrapped 240 ms into its fade under the closing bed, the softener zeroed it, and
  // the music fell to -11 dB for a moment (a hole). This fails on origin/main at 66.3 s in solo-sound every run, and
  // passes with no dip on any bed.
  const { context } = installGraph(t);
  const previousRaf = globalThis.requestAnimationFrame;
  const frames: FrameRequestCallback[] = [];
  globalThis.requestAnimationFrame = (callback) => { frames.push(callback); return frames.length; };
  t.after(() => { globalThis.requestAnimationFrame = previousRaf; });
  await useAudioStore.getState().playMusic('menu-soft', manifest);
  await settle();
  const outgoing = playing('menu-soft.mp3');
  outgoing.loop = true;
  let startIncoming!: () => void;
  GraphAudio.nextPlay = () => new Promise<void>((resolve) => { startIncoming = resolve; });
  void useAudioStore.getState().transitionMusic('deliberate', manifest, { fadeDurationMs: 720 });
  await settle();
  // Waiting on the incoming bed, and then fading out under it: a wrap in either stage leaves the volume alone.
  outgoing.currentTime = 15.9;
  outgoing.emit('timeupdate');
  outgoing.currentTime = 0.02;
  outgoing.emit('timeupdate');
  assert.equal(outgoing.volume, 1, 'no dip while it waits on the incoming bed');
  startIncoming();
  await settle();
  outgoing.currentTime = 15.9;
  outgoing.emit('timeupdate');
  outgoing.currentTime = 0.02;
  outgoing.emit('timeupdate');
  assert.equal(outgoing.volume, 1, 'no dip while it fades out');
  assert.equal(frames.length, 0, 'and no animation frame is queued to bring it back');
  context.currentTime = 0.3;
  assert.ok(context.levelOf(outgoing) > 0, 'still audible partway through the crossfade');
});

test('a loop wrap leaves the element volume alone on the current bed too, so no bed ever dips at its seam', async (t) => {
  // VOF-92: the seam click is baked out of the loop files (4 ms fades at the cut and the onset), so the dip the old loop
  // softener made at a wrap, up to 250 ms late, is gone. Nothing queues an animation frame to bring a volume back.
  const { context } = installGraph(t);
  const previousRaf = globalThis.requestAnimationFrame;
  const frames: FrameRequestCallback[] = [];
  globalThis.requestAnimationFrame = (callback) => { frames.push(callback); return frames.length; };
  t.after(() => { globalThis.requestAnimationFrame = previousRaf; });
  await useAudioStore.getState().playMusic('menu-soft', manifest);
  await settle();
  const bed = playing('menu-soft.mp3');
  bed.loop = true;
  bed.currentTime = 15.9;
  bed.emit('timeupdate');
  bed.currentTime = 0.02;
  bed.emit('timeupdate');
  assert.equal(bed.volume, 1, 'no dip at the wrap');
  assert.equal(frames.length, 0, 'and no animation frame is queued to bring it back');
  assert.equal(context.levelOf(bed), 1, 'the bed sounds at full level across its seam');
});

test('a bed that reports playing but has not started to sound yet still holds the outgoing bed', async (t) => {
  const { context } = installGraph(t);
  await useAudioStore.getState().playMusic('menu-soft', manifest);
  await settle();
  const outgoing = playing('menu-soft.mp3');
  // On a slow network deliberate resolved play() at once and then sat at 0 s for 1.5 s (audio trace, room-slow).
  GraphAudio.stallNext = true;
  context.currentTime = 30;
  void useAudioStore.getState().transitionMusic('deliberate', manifest, { fadeDurationMs: 720 });
  await settle();
  const incoming = playing('deliberate.mp3');
  assert.equal(incoming.paused, false, 'the browser reports it playing');
  t.mock.timers.tick(1500);
  context.currentTime = 31.5;
  assert.equal(context.levelOf(outgoing), 1, 'the outgoing bed holds while no audio flows from the new one');
  assert.equal(context.levelOf(incoming), 0, 'and the new one has not been brought up into silence');
  incoming.currentTime = 0.04;
  incoming.emit('timeupdate');
  context.currentTime = 31.86;
  const outLevel = context.levelOf(outgoing);
  const inLevel = context.levelOf(incoming);
  assert.ok(outLevel > 0.6 && outLevel < 0.72 && inLevel > 0.4 && inLevel < 0.6, `they overlap once it sounds (${outLevel}, ${inLevel})`);
});

test('the outgoing bed holds its full level for a beat after the new bed starts to sound, then fades', async (t) => {
  // Audio trace, Teams title to instructions: the fade began the moment the playhead moved, a sampled frame landed
  // 230 to 290 ms later, and the old bed was already down to 0.68 of its level when the new one was first seen
  // sounding. The playhead moves a little before audio reaches the speakers, so the old bed waits a beat.
  const { context } = installGraph(t);
  await useAudioStore.getState().playMusic('menu-soft', manifest);
  await settle();
  const outgoing = playing('menu-soft.mp3');
  GraphAudio.stallNext = true;
  context.currentTime = 30;
  void useAudioStore.getState().transitionMusic('deliberate', manifest, { fadeDurationMs: 720 });
  await settle();
  const incoming = playing('deliberate.mp3');
  incoming.currentTime = 0.04;
  incoming.emit('timeupdate');
  context.currentTime = 30.1;
  assert.equal(context.levelOf(outgoing), 1, 'still at full level 100 ms after the new bed starts to sound');
  assert.ok(context.levelOf(incoming) > 0.1, 'while the new bed is already rising');
  context.currentTime = 30.12 + 0.36;
  const halfway = context.levelOf(outgoing);
  assert.ok(halfway > 0.4 && halfway < 0.6, `and then fades over the full 720 ms (${halfway})`);
  context.currentTime = 30.12 + 0.72 + 0.01;
  assert.equal(context.levelOf(outgoing), 0, 'to silence');
});

test('a bed that starts sounding long after the poll gave up still gets its soft attack', async (t) => {
  const { context } = installGraph(t);
  await useAudioStore.getState().playMusic('menu-soft', manifest);
  await settle();
  GraphAudio.stallNext = true;
  context.currentTime = 40;
  void useAudioStore.getState().transitionMusic('deliberate', manifest, { fadeDurationMs: 720 });
  await settle();
  const incoming = playing('deliberate.mp3');
  // Past the 3 s wait limit (the old bed has gone) and the 5 s poll limit (only time updates watch now). Mock time
  // steps 40 ms at a time, since one long tick fires only the poll that is due, not the ones it re-schedules.
  for (let step = 0; step < 150; step += 1) t.mock.timers.tick(40);
  context.currentTime = 46;
  assert.equal(context.levelOf(incoming), 0, 'still silent while nothing flows');
  // The poll has stopped: audio that starts flowing is only noticed on its next time update.
  incoming.currentTime = 0.04;
  for (let step = 0; step < 25; step += 1) t.mock.timers.tick(40);
  context.currentTime = 47;
  assert.equal(context.levelOf(incoming), 0, 'the poll no longer runs after its limit');
  incoming.emit('timeupdate');
  context.currentTime = 47.36;
  const rising = context.levelOf(incoming);
  assert.ok(rising > 0.3 && rising < 0.7, `the late start still rises softly (${rising})`);
});

test('a sting still dips the music on an engine that has gains but cannot route a media element', async (t) => {
  // The review's W1: the duck stage exists as soon as createGain works, but with no createMediaElementSource no bed
  // feeds it, so a duck scheduled there left the music at full level. Those beds duck on their element instead.
  class SourcelessContext extends FakeContext {
    declare createMediaElementSource: never;
  }
  Object.defineProperty(SourcelessContext.prototype, 'createMediaElementSource', { value: undefined });
  const previousWindow = globalThis.window;
  const previousAudio = (globalThis as { Audio?: unknown }).Audio;
  const previousRaf = globalThis.requestAnimationFrame;
  const frames: FrameRequestCallback[] = [];
  t.mock.timers.enable({ apis: ['setTimeout'] });
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { AudioContext: SourcelessContext, addEventListener() {}, removeEventListener() {}, localStorage: { getItem: () => 'false', setItem() {} } },
  });
  (globalThis as { Audio?: unknown }).Audio = GraphAudio;
  globalThis.requestAnimationFrame = (callback) => { frames.push(callback); return frames.length; };
  t.after(() => {
    useAudioStore.getState().destroy();
    useAudioStore.setState({ unlocked: false, volume: 1, muted: false, status: 'idle', role: null, error: null });
    Object.defineProperty(globalThis, 'window', { configurable: true, value: previousWindow });
    if (previousAudio === undefined) delete (globalThis as { Audio?: unknown }).Audio;
    else (globalThis as { Audio?: unknown }).Audio = previousAudio;
    globalThis.requestAnimationFrame = previousRaf;
  });
  useAudioStore.getState().destroy();
  GraphAudio.instances = [];
  useAudioStore.setState({ unlocked: false, volume: 1, muted: false, status: 'idle', role: null, error: null });
  useAudioStore.getState().unlock();
  await useAudioStore.getState().playMusic('menu-soft', manifest);
  await settle();
  const bed = playing('menu-soft.mp3');
  void useAudioStore.getState().duck(640, 0.25);
  const started = performance.now();
  for (let round = 0; round < 4 && frames.length; round += 1) {
    for (const callback of frames.splice(0)) callback(started + 200);
  }
  assert.ok(bed.volume <= 0.26, `the bed ducks on its element (${bed.volume})`);
});

test('a zero-length release silences a routed bed on its own level and leaves its element at unity', async (t) => {
  const { context } = installGraph(t);
  await useAudioStore.getState().playMusic('menu-soft', manifest);
  await settle();
  const bed = playing('menu-soft.mp3');
  context.currentTime = 2;
  useAudioStore.getState().releaseMusic(0);
  assert.equal(bed.volume, 1, 'no element volume write on a routed bed');
  assert.equal(bed.paused, true, 'released at once');
});

test('unmuting while a reveal fade is still sounding rises over the bed-swap time, not a snap', async (t) => {
  const { context, master } = installGraph(t);
  await useAudioStore.getState().playMusic('menu-soft', manifest);
  await settle();
  context.currentTime = 3;
  useAudioStore.getState().setMuted(true, { persist: false });
  context.currentTime = 3.1;
  useAudioStore.getState().releaseMusic(720);
  useAudioStore.getState().setMuted(false, { persist: false });
  context.currentTime = 3.2;
  const early = master.gain.valueAt(3.2);
  assert.ok(early < 0.3, `still low 100 ms after the unmute (${early})`);
  context.currentTime = 3.9;
  assert.equal(master.gain.valueAt(3.9), 1);
});
