import assert from 'node:assert/strict';
import test from 'node:test';
import { withViteAndBrowser } from './render-harness.mjs';

// VOF-W9. The landing speaker toggle is its own audio path, separate from the show's engine
// (vrc_audio_muted). window.Audio is stubbed so playback is instant and deterministic, and a
// sessionStorage log survives the real full-page navigation the entry buttons perform, so a
// stop that happens a tick before unload can still be read back on the page it lands on.
//
// The show's own audio engine (src/engine/audio-store.ts) warms its walk-in bed on every mount
// too, and its click sound (tapUi -> playSfx('ui-tap', ...)) also calls `new Audio(src)` with a
// real src argument, so gating the log on "a src was passed" is not narrow enough on its own.
// The log below only records elements whose src ends with the exact walkin filename, and stops
// recording once pagehide fires, so a page's own teardown cannot append anything after the
// moment this suite actually cares about.
function installFakeAudio() {
  // addInitScript reruns on every navigation within this page (including the /play, /join and
  // host landings this suite drives), so only seed the log once or a later read loses everything
  // recorded before that navigation.
  if (sessionStorage.getItem('landingAudioLog') === null) {
    sessionStorage.setItem('landingAudioLog', '[]');
  }
  // In sessionStorage, not a closure variable, so it carries to whatever page this session
  // lands on next (this init script reruns fresh on every navigation, a plain JS variable would
  // forget a pagehide that already fired on the page before). Deferred a microtask past the
  // dispatch itself: every listener a real pagehide fires synchronously in the SAME pass
  // (including the store's own hardStop -> pause) must still get logged. This only closes the
  // window on whatever runs after that pass, real page teardown or a later async straggler, not
  // the pagehide's own immediate, legitimate reaction.
  window.addEventListener('pagehide', () => {
    queueMicrotask(() => {
      sessionStorage.setItem('landingAudioLoggingStopped', '1');
    });
  });
  const log = (event) => {
    if (sessionStorage.getItem('landingAudioLoggingStopped') === '1') return;
    const entries = JSON.parse(sessionStorage.getItem('landingAudioLog') || '[]');
    entries.push(event);
    sessionStorage.setItem('landingAudioLog', JSON.stringify(entries));
  };
  window.Audio = class FakeLandingAudio {
    constructor(src) {
      this.src = src;
      this.loop = false;
      this.volume = 1;
      this.paused = true;
      this.__isLandingInstance = Boolean(src) && src.endsWith('/vax-or-fiction/walkin.mp3');
      if (this.__isLandingInstance) log({ type: 'created', src });
    }
    play() {
      this.paused = false;
      if (this.__isLandingInstance) log({ type: 'play' });
      return Promise.resolve();
    }
    pause() {
      this.paused = true;
      if (this.__isLandingInstance) log({ type: 'pause' });
    }
  };
}

async function seedShowMuted(page) {
  await page.addInitScript(() => {
    // This init script reruns on every navigation. A sessionStorage flag, not a re-check of
    // localStorage, makes the seed itself run exactly once for this test, on the very first
    // load, so a later navigation can never re-touch vrc_audio_muted even indirectly.
    if (sessionStorage.getItem('landingMuteSeeded') === '1') return;
    sessionStorage.setItem('landingMuteSeeded', '1');
    if (localStorage.getItem('vrc_audio_muted') === null) localStorage.setItem('vrc_audio_muted', 'true');
  });
}

test('the entry speaker toggle starts the walk-in track, reads Music with a pressed state, and never touches the show mute', { timeout: 60_000 }, async () => {
  await withViteAndBrowser({}, async ({ url: origin, browser }) => {
    const page = await browser.newPage();
    await seedShowMuted(page);
    await page.addInitScript(installFakeAudio);
    await page.goto(`${origin}/`);
    await page.locator('#root').waitFor();

    const toggle = page.getByRole('button', { name: 'Music', pressed: false });
    await toggle.waitFor();

    // Nothing loads before the first tap.
    const beforeTap = JSON.parse(await page.evaluate(() => sessionStorage.getItem('landingAudioLog')));
    assert.deepEqual(beforeTap, [], 'no audio element before any gesture');

    await toggle.click();
    await page.getByRole('button', { name: 'Music', pressed: true }).waitFor();
    await page.waitForFunction(() => {
      const log = JSON.parse(sessionStorage.getItem('landingAudioLog') || '[]');
      return log.some((entry) => entry.type === 'play');
    });

    const afterTap = JSON.parse(await page.evaluate(() => sessionStorage.getItem('landingAudioLog')));
    assert.equal(afterTap.length, 2, 'exactly one walk-in element, created then played');
    assert.equal(afterTap[0].type, 'created');
    assert.ok(afterTap[0].src.endsWith('/assets/audio/vax-or-fiction/walkin.mp3'));
    assert.equal(afterTap[1].type, 'play');

    const playingState = await page.evaluate(async () => {
      const { useLandingMusicStore } = await import('/src/engine/landing-music.ts');
      return useLandingMusicStore.getState().playing;
    });
    assert.equal(playingState, true);

    const muteKey = await page.evaluate(() => localStorage.getItem('vrc_audio_muted'));
    assert.equal(muteKey, 'true', 'landing music must never write vrc_audio_muted, even after a tap');
  });
});

for (const destination of [
  { label: 'Join', buttonName: 'Join a game', matchesUrl: (url) => url.pathname.endsWith('/join') },
  { label: 'Host', buttonName: 'Host a game', matchesUrl: (url) => url.searchParams.get('host') === '1' },
  { label: 'Solo', buttonName: 'Play on your own', matchesUrl: (url) => url.pathname.endsWith('/play') },
]) {
  test(`leaving for ${destination.label} stops the landing track before/at the navigation, and leaves the show's mute state untouched`, { timeout: 60_000 }, async () => {
    await withViteAndBrowser({}, async ({ url: origin, browser }) => {
      const page = await browser.newPage();
      await seedShowMuted(page);
      await page.addInitScript(installFakeAudio);
      await page.goto(`${origin}/`);
      await page.locator('#root').waitFor();

      await page.getByRole('button', { name: 'Music', pressed: false }).click();
      await page.waitForFunction(() => {
        const log = JSON.parse(sessionStorage.getItem('landingAudioLog') || '[]');
        return log.some((entry) => entry.type === 'play');
      });

      await Promise.all([
        page.waitForURL(destination.matchesUrl),
        page.getByRole('button', { name: destination.buttonName }).click(),
      ]);
      await page.locator('#root').waitFor();

      const log = JSON.parse(await page.evaluate(() => sessionStorage.getItem('landingAudioLog')));
      assert.equal(log.length, 3, 'a pause landed before/at the unload that started the navigation');
      assert.equal(log[2].type, 'pause');

      const muteKey = await page.evaluate(() => localStorage.getItem('vrc_audio_muted'));
      assert.equal(muteKey, 'true', "a landing unmute must never touch the show's mute preference");
    });
  });
}

test('a synthetic pagehide event stops the music, the exact mechanism a footer link departure relies on', { timeout: 60_000 }, async () => {
  await withViteAndBrowser({}, async ({ url: origin, browser }) => {
    const page = await browser.newPage();
    await page.addInitScript(installFakeAudio);
    await page.goto(`${origin}/`);
    await page.locator('#root').waitFor();

    await page.getByRole('button', { name: 'Music', pressed: false }).click();
    await page.waitForFunction(() => {
      const log = JSON.parse(sessionStorage.getItem('landingAudioLog') || '[]');
      return log.some((entry) => entry.type === 'play');
    });

    // The footer's <a href="/about"> has no onClick that stops the music. It relies entirely on
    // the pagehide listener the entry screen installs. Dispatching that event directly, without
    // a real navigation, isolates the exact mechanism this test names in its title. A real
    // navigation to /about would exercise this same listener, but through the browser's own
    // unload timing rather than this suite's own assertion points.
    await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));

    const playing = await page.evaluate(async () => {
      const { useLandingMusicStore } = await import('/src/engine/landing-music.ts');
      return useLandingMusicStore.getState().playing;
    });
    assert.equal(playing, false, 'pagehide must stop the music even with no click handler in the loop');

    const log = JSON.parse(await page.evaluate(() => sessionStorage.getItem('landingAudioLog')));
    assert.equal(log.at(-1)?.type, 'pause', 'the element itself paused, not just the store flag');
  });
});

test('a rejected play() does not report as playing and leaves the button off', { timeout: 60_000 }, async () => {
  await withViteAndBrowser({}, async ({ url: origin, browser }) => {
    const page = await browser.newPage();
    await page.addInitScript(() => {
      window.Audio = class RejectingAudio {
        constructor(src) { this.src = src; this.loop = false; this.volume = 1; this.paused = true; }
        play() { this.paused = false; return Promise.reject(new Error('NotAllowedError: no gesture')); }
        pause() { this.paused = true; }
      };
    });
    await page.goto(`${origin}/`);
    await page.locator('#root').waitFor();

    await page.getByRole('button', { name: 'Music', pressed: false }).click();
    await page.waitForFunction(async () => {
      const { useLandingMusicStore } = await import('/src/engine/landing-music.ts');
      return useLandingMusicStore.getState().playing === false;
    });
    await page.getByRole('button', { name: 'Music', pressed: false }).waitFor();
  });
});
