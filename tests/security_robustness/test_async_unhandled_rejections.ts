import assert from 'node:assert/strict';
import test from 'node:test';
import { useAudioStore } from '../../src/engine/audio-store';
import { OfflineProvider } from '../../src/data/providers/OfflineProvider';
import { OnlineProvider } from '../../src/data/providers/OnlineProvider';

class MockAudioElement {
  private _volume = 1;
  src = '';
  loop = false;
  muted = false;
  paused = true;
  currentTime = 0;
  error: { message?: string; code?: number } | null = null;
  private errorListeners: Array<() => void> = [];

  get volume() { return this._volume; }
  set volume(value: number) {
    if (!Number.isFinite(value)) invalidVolumeWrites += 1;
    this._volume = value;
  }

  addEventListener(event: string, callback: () => void) {
    if (event === 'error') this.errorListeners.push(callback);
  }

  removeEventListener() {}
  pause() { this.paused = true; }
  load() {}
  play() {
    this.paused = false;
    return Promise.reject(new Error('NotAllowedError: synthetic autoplay rejection'));
  }
  triggerError() {
    for (const callback of this.errorListeners) callback();
  }
}

let invalidVolumeWrites = 0;

test('audio and provider promise failures are observable and contained', async (t) => {
  const previousAudio = (globalThis as { Audio?: unknown }).Audio;
  (globalThis as { Audio?: unknown }).Audio = MockAudioElement;
  const unhandled: unknown[] = [];
  const onUnhandled = (reason: unknown) => unhandled.push(reason);
  process.on('unhandledRejection', onUnhandled);
  t.after(() => {
    process.removeListener('unhandledRejection', onUnhandled);
    if (previousAudio === undefined) delete (globalThis as { Audio?: unknown }).Audio;
    else (globalThis as { Audio?: unknown }).Audio = previousAudio;
    useAudioStore.getState().stopMusic();
  });

  useAudioStore.setState({ unlocked: true, status: 'idle', error: null, volume: 1 });
  await useAudioStore.getState().playMusic('missing-role', {});
  assert.equal(useAudioStore.getState().status, 'error');
  assert.match(useAudioStore.getState().error?.message ?? '', /Track not found/);

  await useAudioStore.getState().playMusic('theme', { flagship: { theme: { path: '/audio/synthetic.mp3' } } });
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(useAudioStore.getState().status, 'error');
  assert.equal(useAudioStore.getState().role, null);
  assert.equal(useAudioStore.getState().unlocked, false);
  assert.match(useAudioStore.getState().error?.message ?? '', /synthetic autoplay rejection/);
  assert.deepEqual(unhandled, []);

  useAudioStore.getState().setVolume(0.75);
  assert.equal(await useAudioStore.getState().fadeTo(Number.NaN, 0), 0.75);
  assert.equal(useAudioStore.getState().volume, 0.75);
  assert.equal(await useAudioStore.getState().fadeTo(Number.POSITIVE_INFINITY, 0), 0.75);
  assert.equal(useAudioStore.getState().volume, 0.75);
  assert.equal(invalidVolumeWrites, 0);

  await assert.rejects(() => new OfflineProvider().getDeck('invalid-deck-id'), /Deck not found/);
  await assert.rejects(() => new OnlineProvider().getDeck('any-deck'), /Deck not found/);

  assert.equal(await useAudioStore.getState().fadeTo(2, 0), 1);
  assert.equal(await useAudioStore.getState().fadeTo(-5, 0), 0);
  useAudioStore.getState().setVolume(0.75);
  const ducked = await useAudioStore.getState().duck(0, 1.5);
  assert.equal(ducked, 0.75);
  assert.equal(useAudioStore.getState().volume, 0.75);
  console.log('coverage: missing-track, autoplay-rejection, 2 provider rejections, and 4 clamped audio parameters');
});
