import assert from 'node:assert/strict';
import test from 'node:test';
import { withViteAndBrowser } from './render-harness.mjs';

test('a rejected play waits for another presenter gesture before retrying the same phase', { timeout: 60_000 }, async () => {
  await withViteAndBrowser({}, async ({ url: origin, browser }) => {
    const page = await browser.newPage();
    await page.addInitScript(() => {
      window.__audioAttempts = 0;
      window.Audio = class SyntheticAudio {
        constructor(src) {
          this.src = src;
          this.loop = false;
          this.muted = false;
          this.paused = true;
          this.currentTime = 0;
          this.volume = 1;
          this.error = null;
        }
        addEventListener() {}
        pause() { this.paused = true; }
        load() {}
        play() {
          this.paused = false;
          window.__audioAttempts += 1;
          return window.__audioAttempts === 1
            ? Promise.reject(new Error('NotAllowedError: synthetic first attempt'))
            : Promise.resolve();
        }
      };
    });
    // Hosts open at /?room=ID&host=1 (VOF-room-routing). Without host=1 a fresh tab resolves to
    // attendee mode, never the presentation surface this test drives.
    await page.goto(`${origin}/?room=AUDIO&host=1`);
    await page.locator('#root').waitFor();
    // 'revealed' is deliberately silent (the reveal-a/reveal-b one-shot SFX owns that beat, and
    // getAudioLifecycleDecision returns null for it, so no playMusic call is ever attempted and
    // this test's whole retry premise never fires). 'lobby' is the walk-in bed, the real case
    // this behavior protects: autoplay-blocked walk-in music retrying on the host's next click.
    await page.evaluate(async () => {
      const { useGameStore } = await import('/src/store/game-store.ts');
      useGameStore.setState({ phase: 'lobby' });
    });

    await page.evaluate(() => document.dispatchEvent(new Event('click')));
    await page.waitForFunction(async () => {
      const { useAudioStore } = await import('/src/engine/audio-store.ts');
      return window.__audioAttempts === 1 && useAudioStore.getState().status === 'error';
    });
    const failed = await page.evaluate(async () => {
      const { useAudioStore } = await import('/src/engine/audio-store.ts');
      const state = useAudioStore.getState();
      return { attempts: window.__audioAttempts, status: state.status, role: state.role, unlocked: state.unlocked, error: state.error?.message ?? null };
    });
    assert.deepEqual(failed, {
      attempts: 1,
      status: 'error',
      role: null,
      unlocked: false,
      error: 'NotAllowedError: synthetic first attempt',
    });

    await page.waitForTimeout(100);
    assert.equal(await page.evaluate(() => window.__audioAttempts), 1, 'failure must not start an automatic retry loop');

    await page.evaluate(() => document.dispatchEvent(new Event('click')));
    await page.waitForFunction(async () => {
      const { useAudioStore } = await import('/src/engine/audio-store.ts');
      const state = useAudioStore.getState();
      return window.__audioAttempts === 2 && state.status === 'playing' && state.role === 'walkin';
    });
  });
});

test('the mounted player advances 5 background bed roles and the reveal sting, stopping each at lock', { timeout: 60_000 }, async () => {
  await withViteAndBrowser({}, async ({ url: origin, browser }) => {
    const page = await browser.newPage();
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(String(error)));
    await page.addInitScript(() => {
      sessionStorage.setItem('vof:presentation-venue:AUDI', 'offline');
      localStorage.setItem('vrc_audio_muted', 'false');
      window.__realMedia = [];
      window.__activeMediaErrors = [];
      const NativeAudio = window.Audio;
      window.Audio = class extends NativeAudio {
        constructor(...args) {
          super(...args);
          window.__realMedia.push(this);
          this.addEventListener('error', () => {
            // Clearing src and loading releases a disposed element. Only a
            // failure while it still owns a track is an active media error.
            if (this.getAttribute('src')) window.__activeMediaErrors.push(this.error?.code);
          });
        }
      };
    });
    // Hosts open at /?room=ID&host=1 (VOF-room-routing). Without host=1 a fresh tab resolves to
    // attendee mode, so the host-only "Open the lobby" control this test clicks never mounts.
    await page.goto(`${origin}/?room=AUDI&host=1`);
    await page.getByRole('button', { name: 'Open the lobby', exact: true }).click();
    const servedPlayer = await (await page.request.get(`${origin}/src/components/AudioPlayer.tsx`)).text();
    const gameModule = servedPlayer.match(/import \{ useGameStore \} from "([^"]+)"/)?.[1];
    assert.ok(gameModule, 'drive the exact store module imported by the mounted player');
    // 'revealed' retired its background bed (VOF-host-default commit 50bda3b, "keep reveal SFX
    // from stacking a second bed"): getAudioLifecycleDecision now returns null for it and the
    // reveal-a/reveal-b one-shot sting owns that beat instead, so it is checked separately below,
    // not as a sixth looping bed role.
    const bedRoles = [
      { role: 'walkin', phase: 'lobby' },
      { role: 'deliberate', phase: 'deliberating', running: false, remaining: 45_000 },
      { role: 'countdown', phase: 'deliberating', running: true, remaining: 8_000, duration: 45_000 },
      { role: 'showdown', phase: 'showdown', stage: 'lineup' },
      { role: 'closing', phase: 'closing' },
    ];
    // The five current background beds. "Open the lobby" also fires a ui-tap click SFX that is
    // still finishing (not paused) the moment the walkin step's own check runs, so exclusivity here
    // is scoped to the bed roles a phase can play, not incidental SFX layered on top by design
    // (the ducking system in audio-store.ts exists precisely so SFX and a bed coexist briefly).
    const BED_FILES = ['walkin.mp3', 'deliberate.mp3', 'countdown.mp3', 'showdown.mp3', 'closing.mp3'];
    const setPhase = (item, gameModule) => page.evaluate(async ({ item, gameModule }) => {
      const { useGameStore } = await import(gameModule);
      const state = useGameStore.getState();
      useGameStore.setState({
        phase: item.phase,
        slideIndex: 2,
        timer: { ...state.timer, enabled: Boolean(item.running), running: Boolean(item.running),
          remainingMs: item.remaining ?? 0, durationMs: item.duration ?? state.timer.durationMs,
          endsAt: item.running ? Date.now() + item.remaining : null },
        ...(item.stage ? { showdown: { stage: item.stage, finalists: [], winner: null, discussionOpen: false } } : {}),
      });
    }, { item, gameModule });
    const lockAndWaitSilent = async () => {
      await page.evaluate(async (gameModule) => {
        const { useGameStore } = await import(gameModule);
        const state = useGameStore.getState();
        useGameStore.setState({ phase: 'locked', timer: { ...state.timer, running: false } });
      }, gameModule);
      await page.waitForFunction((bedFiles) => window.__realMedia.every((audio) => {
        const src = audio.getAttribute('src');
        return !src || audio.paused || !bedFiles.some((file) => src.endsWith(`/${file}`));
      }), BED_FILES, { timeout: 8_000 });
    };
    for (const item of bedRoles) {
      await setPhase(item, gameModule);
      await page.waitForFunction((role) => window.__realMedia.some((audio) =>
        audio.getAttribute('src')?.endsWith(`/${role}.mp3`) && !audio.paused &&
        !audio.muted && audio.volume > 0 && audio.currentTime > 0.08), item.role, { timeout: 8_000 });
      const activeBeds = await page.evaluate((bedFiles) => window.__realMedia.filter((audio) => {
        const src = audio.getAttribute('src');
        return src && !audio.paused && bedFiles.some((file) => src.endsWith(`/${file}`));
      }).map((audio) => audio.getAttribute('src')), BED_FILES);
      assert.equal(activeBeds.length, 1, `${item.role} must be the only active bed: ${JSON.stringify(activeBeds)}`);
      await lockAndWaitSilent();
    }
    // revealed: a reveal-a or reveal-b sting fires once, and no background bed sustains under it.
    await setPhase({ phase: 'revealed' }, gameModule);
    await page.waitForFunction(() => window.__realMedia.some((audio) => {
      const src = audio.getAttribute('src');
      return (src?.endsWith('/reveal-a.mp3') || src?.endsWith('/reveal-b.mp3')) && !audio.paused;
    }), null, { timeout: 8_000 });
    const activeBedsDuringReveal = await page.evaluate((bedFiles) => window.__realMedia.filter((audio) => {
      const src = audio.getAttribute('src');
      return src && !audio.paused && bedFiles.some((file) => src.endsWith(`/${file}`));
    }), BED_FILES);
    assert.equal(activeBedsDuringReveal.length, 0, 'revealed must not sustain a background bed under the reveal sting');
    await lockAndWaitSilent();
    assert.deepEqual(await page.evaluate(() => window.__activeMediaErrors), []);
    assert.deepEqual(pageErrors, []);
    console.log('coverage: 5 background bed roles + the reveal sting, 6 lock stops, no overlapping active beds');
  });
});
