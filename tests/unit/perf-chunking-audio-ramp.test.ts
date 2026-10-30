import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { useAudioStore } from '../../src/engine/audio-store.ts';

describe('Task 4.5 / PERF-02, PERF-03: Code Splitting & Web Audio Hardware Ramps', () => {
  it('PERF-03 / TYPE-05: audio-store.ts eliminates 10ms setInterval loop and implements Web Audio ramps', () => {
    const audioStorePath = path.resolve(process.cwd(), 'src/engine/audio-store.ts');
    const content = fs.readFileSync(audioStorePath, 'utf8');

    // Verify absence of 10ms setInterval loop
    assert.strictEqual(
      content.includes('}, 10);'),
      false,
      'audio-store.ts must not use a 10ms setInterval loop for volume fading'
    );

    // Hardware ramps, anchored (VOF-86). Every ramp first pins the param where it is now, then ramps. The bare
    // `linearRampToValueAtTime` after `cancelScheduledValues` this once pinned ramped from the last scheduled point,
    // which could be seconds old, so the gain jumped instead of gliding.
    assert.match(
      content,
      /param\.cancelScheduledValues\(now\);\s*\n\s*param\.setValueAtTime\(start, now\);[\s\S]{0,200}param\.linearRampToValueAtTime\(v, t\);/,
      'audio-store.ts must anchor each ramp at its current value before ramping'
    );
    assert.match(
      content,
      /scheduleParam\(gainNode\.gain, ctx, \[\{ at: fadeDuration, v: targetGain \}\]\)/,
      'fadeTo must glide the master through the anchored helper'
    );
    assert.strictEqual(
      /gainNode\.gain\.linearRampToValueAtTime\(/.test(content),
      false,
      'audio-store.ts must not ramp the master without an anchor'
    );
  });

  it('PERF-03: useAudioStore.fadeTo executes and resolves volume cleanly', async () => {
    const store = useAudioStore.getState();
    const result = await store.fadeTo(0.4, 20);
    assert.strictEqual(result, 0.4, 'fadeTo should resolve with target volume');
    assert.strictEqual(useAudioStore.getState().volume, 0.4, 'Store volume should update to target volume');
  });

  it('PERF-02 / TYPE-06: vite.config.ts does not collapse dynamic routes into a single file', () => {
    const viteConfigPath = path.resolve(process.cwd(), 'vite.config.ts');
    const content = fs.readFileSync(viteConfigPath, 'utf8');

    assert.strictEqual(
      content.includes('vite-plugin-singlefile'),
      false,
      'vite.config.ts must not import or use vite-plugin-singlefile'
    );

    // Loaded-response isolation is enforced by tests/integration/phone-bundle.mjs.
    // Forced manual chunks previously made the attendee entry preload host answers.
  });

  it('PERF-02: App.tsx utilizes lazy-loaded route chunking for presentation and phone', () => {
    const appTsxPath = path.resolve(process.cwd(), 'src/App.tsx');
    const content = fs.readFileSync(appTsxPath, 'utf8');

    assert.ok(
      content.includes('lazy('),
      'src/App.tsx must use React.lazy for route code splitting'
    );
    assert.ok(
      content.includes('PresentationSuite') && content.includes('PhoneSuite'),
      'src/App.tsx must split presentation and phone suites'
    );
  });

  it('Round 2: RemoteSuite contains zero inline styles and uses labeled remote-pad classes', () => {
    const remotePath = path.resolve(process.cwd(), 'src/phone/RemoteSuite.tsx');
    const content = fs.readFileSync(remotePath, 'utf8');

    assert.strictEqual(
      content.includes('style={{'),
      false,
      'src/phone/RemoteSuite.tsx must not contain any inline styles',
    );
    assert.ok(
      content.includes('className="remote-clicker"') && content.includes('className="remote-pad__btn'),
      'RemoteSuite must use its labeled pad classes: the clicker layout and the remote-pad buttons',
    );
    assert.ok(
      !content.includes('Remote view unavailable'),
      'RemoteSuite must be a working presenter controller',
    );
  });

  it('Round 2: audio-store.ts connects currentAudio to gainNode and uses requestAnimationFrame for smooth volume fading', () => {
    const audioStorePath = path.resolve(process.cwd(), 'src/engine/audio-store.ts');
    const content = fs.readFileSync(audioStorePath, 'utf8');

    assert.ok(
      content.includes('createMediaElementSource'),
      'audio-store.ts must connect HTMLAudioElement to Web Audio gainNode using createMediaElementSource'
    );
    assert.ok(
      content.includes('requestAnimationFrame'),
      'audio-store.ts must use requestAnimationFrame for smooth volume interpolation'
    );
    assert.strictEqual(
      content.includes('currentAudio.volume = targetGain;'),
      false,
      'audio-store.ts must not immediately snap currentAudio.volume at the start of fadeTo'
    );
  });
});
