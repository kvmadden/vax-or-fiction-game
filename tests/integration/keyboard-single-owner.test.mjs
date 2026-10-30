import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startInProcessVite, wrapBrowserAgainstViteAutoReload } from './render-harness.mjs';

// VOF_BASE_URL still overrides, for pointing at an already-running dev server.
// Otherwise this starts its own Vite server on a free port, the same as
// tests/integration/question-lifecycle.test.mjs, so a plain node run is self-sufficient.
// TW-5: this file shares one Vite instance across every test rather than restarting per test, so it
// starts Vite in-process (Vite's own createServer() JS API, not a spawned child) instead of using
// withViteAndBrowser. startInProcessVite races that startup against a bound: a hung plugin or a
// config that never resolves used to hang this file's very first top-level await forever, with no
// output, so `check` never reached a later suite either.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ownServer = process.env.VOF_BASE_URL
  ? null
  : await startInProcessVite({ root, server: { port: 0, host: '127.0.0.1' }, logLevel: 'error' });
const base = process.env.VOF_BASE_URL || ownServer.resolvedUrls.local[0].replace(/\/$/, '');

const browser = await chromium.launch({
  headless: true,
});
// FLAKE (phone-flake brief): see render-harness.mjs's neutralizeViteAutoReload for why.
wrapBrowserAgainstViteAutoReload(browser);

async function verifySingleAdvance(key) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(15_000);
  try {
    await page.addInitScript(() => localStorage.setItem('vrc_audio_muted', 'true'));
    // Since 50bda3b a room URL without host intent renders the phone join screen (f605a2f fixed
    // the three harnesses that document names, this is the same staleness in a fourth).
    await page.goto(`${base}/?room=KEY_${randomUUID().slice(0, 8)}&host=1`);
    await page.getByRole('button', { name: 'Open the lobby', exact: true }).click();
    await page.locator('[data-screen="lobby"]').waitFor();
    await page.getByRole('button', { name: /Open the stage/ }).click();
    await page.getByRole('button', { name: 'Start Session' }).click();
    await page.locator('[data-screen="instructions"]').waitFor();
    await page.waitForTimeout(350);
    // VOF-88: the first press starts the 3-2-1 and a second skips it, so question 1 lands at once. A count
    // left to run out drops presses for its 700 ms landing grace, which is not what this suite measures.
    await page.keyboard.press('ArrowRight');
    await page.locator('[data-role="intro-countdown"]').waitFor();
    await page.waitForTimeout(350);
    await page.keyboard.press('ArrowRight');

    const question = page.locator('[data-screen="question"][data-question-id]').first();
    await question.waitFor();
    await page.waitForTimeout(350);
    const firstQuestionId = await question.getAttribute('data-question-id');
    assert.ok(firstQuestionId);

    // PRES-02: on a live question the first press locks (the stage rail turns "Votes locked"),
    // the second reveals, the third explains, the fourth moves on. One owner, one step per press.
    await page.keyboard.press(key);
    await page.locator('.question-shell[data-phase="locked"]').waitFor();
    await page.locator('[data-role="status-rail"][data-state="locked"]').waitFor();
    assert.equal(await question.getAttribute('data-question-id'), firstQuestionId,
      `${key} must lock the current question without advancing its id`);
    assert.equal(await page.locator('[data-stage-beat="result"]').count(), 0,
      `one ${key} press must not reveal`);

    await page.waitForTimeout(350);
    await page.keyboard.press(key);
    await page.waitForTimeout(100);
    // Question.tsx stamps data-stage-beat on both the persistent .question-shell wrapper and the
    // inner per-beat .question-beat section (H1: the same ambiguity visual-parity.mjs and
    // mounted-room.test.mjs already scope around). The unscoped locator's .first() resolved to
    // the wrapper, which carries no data-question-id, so the assertion always read null.
    const reveal = page.locator('.question-beat[data-stage-beat="result"]').first();
    assert.equal(await reveal.getAttribute('data-question-id'), firstQuestionId,
      `the second ${key} press must reveal the current question without advancing its id`);

    await page.waitForTimeout(350);
    await page.keyboard.press(key);
    const explanation = page.locator('.question-beat[data-stage-beat="explanation"]').first();
    await explanation.waitFor();
    assert.equal(await explanation.getAttribute('data-question-id'), firstQuestionId,
      `the third ${key} press must explain the current question without advancing its id`);

    await page.waitForTimeout(350);
    await page.keyboard.press(key);
    await page.waitForFunction((priorId) =>
      document.querySelector('[data-screen="question"][data-question-id]')?.getAttribute('data-question-id') !== priorId,
    firstQuestionId);
    assert.notEqual(await question.getAttribute('data-question-id'), firstQuestionId,
      `the fourth ${key} press must advance to the next question`);
  } finally {
    await page.close();
  }
}

// the 2026-09-16 design calls: presenter keys and a clicker do nothing on setup, the 1 2 3 setup picks are retired,
// Enter does nothing in the lobby, and clicker Back still returns from the lobby to setup. The store is read
// through the dev server's own module, as presenter-controls does.
const SETUP_KEYS = ['ArrowRight', 'PageDown', 'Space', 'Enter', 's', '1', '2', '3', 'ArrowLeft', 'PageUp', 't', 'T', 'Shift+R'];

async function verifySetupAndLobbyKeys() {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(15_000);
  try {
    await page.addInitScript(() => localStorage.setItem('vrc_audio_muted', 'true'));
    await page.goto(`${base}/?room=KEY_${randomUUID().slice(0, 8)}&host=1`);
    const storeUrl = new URL('/src/store/game-store.ts', base).href;
    const where = () => page.evaluate(async (url) => {
      const { useGameStore } = await import(url);
      const { phase, slideIndex, modeId, formatId, interactionMode, votesLocked } = useGameStore.getState();
      const screens = [...document.querySelectorAll('[data-screen]')]
        .map((el) => `${el.getAttribute('data-screen')}:${el.getAttribute('data-view') ?? ''}`);
      return { phase, slideIndex, modeId, formatId, interactionMode, votesLocked, screens };
    }, storeUrl);
    // TW-9: ScreenRouter crossfades screens over SCREEN_FADE_S (260ms, src/ui/screen-fade.ts), so the
    // outgoing screen can still be mounted the instant the incoming one attaches. Both helpers require
    // exactly one [data-screen] element total, not just that a matching one exists somewhere, so an
    // outgoing screen mid-fade (lobby, on the trip back to setup) can never read as already settled.
    // Proved RED against the unfixed originals (a fixed 350ms wait here, and a settledOn that checked
    // only the incoming preFlight element) by temporarily inflating SCREEN_FADE_S past 350ms: the
    // fixed wait let a stale `screens` baseline include the still-fading preFlight or lobby element,
    // and the old settledOn resolved the instant preFlight:ready mounted while lobby was still fading
    // out, both producing the exact spurious deepEqual mismatches this settling is meant to prevent.
    const settledOn = (view) => page.waitForFunction((wanted) => {
      const screens = document.querySelectorAll('[data-screen]');
      return screens.length === 1 && screens[0].getAttribute('data-screen') === 'preFlight' && screens[0].getAttribute('data-view') === wanted;
    }, view);
    const settledOnlyScreen = (screen) => page.waitForFunction((wanted) => {
      const screens = document.querySelectorAll('[data-screen]');
      return screens.length === 1 && screens[0].getAttribute('data-screen') === wanted;
    }, screen);
    const press = async (key) => {
      // A presenter key reaches the stage, not a focused control, so nothing holds focus when it lands.
      await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); });
      await page.keyboard.press(key);
      // Past the 300ms navigation debounce, so every press really reaches the keyboard layer.
      await page.waitForTimeout(350);
    };
    const pressAllOn = async (label) => {
      const before = await where();
      for (const key of SETUP_KEYS) {
        await press(key);
        assert.deepEqual(await where(), before, `${key} on ${label} must do nothing`);
      }
    };

    // A hands-up quick setup, so the trip back from the lobby can also prove the sheet keeps it hands up.
    // VOF-52 retired the 10-minute game. Practice run (venue: 'offline') is the hands-up quick setup
    // today (src/screens/Preflight.tsx DEFAULT_CURATED_PRESETS), matching the fix already applied to
    // tests/integration/visual-parity.mjs.
    await settledOn('ready');
    await page.getByRole('button', { name: 'More options', exact: true }).click();
    await page.getByRole('button', { name: 'Quick setups', exact: true }).click();
    await page.getByRole('button', { name: 'Use this: Practice run', exact: true }).click();
    await settledOn('sheet');
    await pressAllOn('the More options sheet');
    await page.getByRole('button', { name: 'Done', exact: true }).click();
    await settledOn('ready');
    await pressAllOn('the ready screen');

    await page.getByRole('button', { name: 'Open the lobby', exact: true }).click();
    await page.locator('[data-screen="lobby"]').waitFor();
    // Settle past the crossfade before taking the baseline snapshot the next deepEqual compares
    // against: a still-mounted outgoing preFlight screen would otherwise show up in `where()`'s own
    // screens list and make every later deepEqual against this baseline fail for the wrong reason.
    await settledOnlyScreen('lobby');
    const lobby = await where();
    assert.equal(lobby.interactionMode, 'facilitator', 'Practice run opens the lobby hands up');
    await press('Enter');
    assert.deepEqual(await where(), lobby, 'Enter in the lobby must do nothing');

    await press('ArrowLeft');
    await settledOn('ready');
    assert.equal((await where()).phase, 'preFlight', 'clicker Back from the lobby returns to setup');
    await pressAllOn('setup after coming back from the lobby');

    await page.getByRole('button', { name: 'Open the lobby', exact: true }).click();
    await page.locator('[data-screen="lobby"]').waitFor();
    assert.equal((await where()).interactionMode, 'facilitator', 'coming back from the lobby keeps a hands-up game hands up');
  } finally {
    await page.close();
  }
}

try {
  await verifySingleAdvance('ArrowRight');
  await verifySingleAdvance('Space');
  await verifySetupAndLobbyKeys();
  console.log('PASS one keyboard owner: ArrowRight and Space lock once, reveal once, explain once, then advance once, no presenter key moves setup, Enter does nothing in the lobby, and a hands-up game survives the trip back to setup');
} finally {
  await browser.close();
  await ownServer?.close();
}
