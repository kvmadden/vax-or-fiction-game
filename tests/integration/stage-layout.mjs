import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import { chromium } from 'playwright';
import { wrapBrowserAgainstViteAutoReload } from './render-harness.mjs';

const BASE_URL = process.env.VOF_STAGE_URL ?? 'http://127.0.0.1:5193';
const VIEWPORTS = [
  { id: 'desktop1440x1000', width: 1440, height: 1000 },
  { id: 'phone390x844', width: 390, height: 844 },
  { id: 'phone430x932', width: 430, height: 932 },
];
const FORMATS = ['widescreen', 'square', 'portrait'];
const CASES = [
  { id: 'lobby', phase: 'lobby' },
  { id: 'question-entering', phase: 'entering', slideIndex: 2 },
  { id: 'question-revealed', phase: 'revealed', slideIndex: 2 },
  { id: 'closing', phase: 'closing' },
  {
    id: 'showdown-duel',
    phase: 'showdown',
    showdown: {
      id: 'qa-showdown',
      stage: 'duel',
      finalists: [
        { ticket: 'T-01', name: 'Participant A', score: 42, duelPoints: 2 },
        { ticket: 'T-02', name: 'Participant B', score: 39, duelPoints: 1 },
      ],
      predictions: { deviceA: 'T-01', deviceB: 'T-02' },
      predictionCounts: { 'T-01': 1, 'T-02': 1 },
      questionIds: ['q1', 'q2'],
      questionIndex: 0,
      winner: null,
      tie: false,
      isRecap: true,
    },
  },
];

function fixtureState(spec, format) {
  return {
    phase: spec.phase,
    leaderboardEnabled: true,
    formatId: format,
    slideIndex: spec.slideIndex ?? -1,
    votesLocked: spec.phase === 'revealed',
    timer: {
      durationMs: 60000,
      remainingMs: 45000,
      running: false,
      enabled: spec.phase === 'entering',
      visible: spec.phase === 'entering',
      pauseReason: 'manual',
      generation: 1,
      endsAt: null,
    },
    ...(spec.showdown ? { showdown: spec.showdown } : {}),
  };
}

async function inspectPage(page, viewport, format, spec) {
  const screenshot = `work/stage-layout-forced-${viewport.id}-${format}-${spec.id}.png`;
  await page.screenshot({ path: screenshot, fullPage: false });
  const evidence = await page.evaluate(({ viewport, format, caseId }) => {
    const rect = (element) => {
      if (!element) return null;
      const value = element.getBoundingClientRect();
      return Object.fromEntries(['x', 'y', 'width', 'height', 'right', 'bottom']
        .map((key) => [key, Number(value[key].toFixed(2))]));
    };
    const visible = (element) => {
      const value = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || 1) > 0
        && value.width > 0 && value.height > 0 && value.right > 0 && value.bottom > 0
        && value.left < innerWidth && value.top < innerHeight;
    };
    const selector = (element) => {
      const role = element.getAttribute('data-role');
      if (role) return `[data-role="${role}"]`;
      const testId = element.getAttribute('data-testid');
      if (testId) return `[data-testid="${testId}"]`;
      return element.tagName.toLowerCase();
    };
    const stage = document.querySelector('.scaled-stage-container');
    const content = document.querySelector('.scaled-stage-content');
    const screen = document.querySelector('[data-screen]');
    const router = document.querySelector('[data-testid="screen-router"]');
    const hud = document.querySelector('[data-role="hud"]');
    const controls = [...document.querySelectorAll('button,a,[role="button"],input,select,textarea')]
      .filter(visible)
      .map((element) => {
        const value = rect(element);
        const hudRect = hud?.getBoundingClientRect();
        const elementRect = element.getBoundingClientRect();
        return {
          selector: selector(element),
          text: (element.innerText || element.getAttribute('aria-label') || element.getAttribute('title') || '')
            .replace(/\s+/g, ' ').trim().slice(0, 100),
          rect: value,
          computed: {
            width: getComputedStyle(element).width,
            height: getComputedStyle(element).height,
            minWidth: getComputedStyle(element).minWidth,
            minHeight: getComputedStyle(element).minHeight,
          },
          touchOK: value.width >= 44 && value.height >= 44,
          hudOverlap: Boolean(hudRect && !hud.contains(element)
            && elementRect.right > hudRect.left && elementRect.left < hudRect.right
            && elementRect.bottom > hudRect.top && elementRect.top < hudRect.bottom),
        };
      });
    const landmarkSelectors = caseId.startsWith('question')
      ? [
          '.show-join-pill',
          '.question-source-header',
          '.question-stage-copy h1',
          ...(caseId === 'question-revealed' ? ['.evidence-panel'] : []),
          '.answer-rail',
          '.show-footer__context',
        ]
      : caseId === 'closing'
      ? [
          '.show-join-pill',
          '.closing-source-header',
          '.closing-source-score__hero',
          '.closing-recap-actions',
        ]
      : caseId === 'showdown-duel'
      ? [
          '[data-role="showdown-back-lineup"]',
          '[data-role="showdown-reveal-winner"]',
        ]
      : [];
    const landmarks = landmarkSelectors.map((selector) => {
      const element = document.querySelector(selector);
      const value = rect(element);
      return {
        selector,
        present: Boolean(element),
        rect: value,
        fullyContained: Boolean(value
          && value.x >= 0
          && value.y >= 0
          && value.right <= innerWidth
          && value.bottom <= innerHeight),
      };
    });
    const before = {
      stageScrollLeft: stage?.scrollLeft ?? null,
      stageScrollTop: stage?.scrollTop ?? null,
      docScrollLeft: document.documentElement.scrollLeft,
      docScrollTop: document.documentElement.scrollTop,
      contentRect: rect(content),
    };
    const scrollTarget = [...document.querySelectorAll('button,a,[role="button"]')].find(visible);
    if (scrollTarget) scrollTarget.scrollIntoView({ block: 'center', inline: 'center' });
    const afterScroll = {
      stageScrollLeft: stage?.scrollLeft ?? null,
      stageScrollTop: stage?.scrollTop ?? null,
      docScrollLeft: document.documentElement.scrollLeft,
      docScrollTop: document.documentElement.scrollTop,
      contentRect: rect(content),
    };
    const focusSamples = controls.slice(0, 3).map((control) => {
      const element = document.querySelector(control.selector);
      const prior = {
        stageLeft: stage?.scrollLeft ?? null,
        stageTop: stage?.scrollTop ?? null,
        docTop: document.documentElement.scrollTop,
      };
      if (element) element.focus();
      const after = {
        stageLeft: stage?.scrollLeft ?? null,
        stageTop: stage?.scrollTop ?? null,
        docTop: document.documentElement.scrollTop,
      };
      return { ...control, focusAfter: after, focusMoved: after.stageLeft !== prior.stageLeft || after.stageTop !== prior.stageTop || after.docTop !== prior.docTop };
    });
    const overflow = {
      documentWidth: document.documentElement.scrollWidth,
      documentHeight: document.documentElement.scrollHeight,
      viewportWidth: innerWidth,
      viewportHeight: innerHeight,
      stageScrollLeft: stage?.scrollLeft ?? null,
      stageScrollTop: stage?.scrollTop ?? null,
    };
    const formatValues = [...document.querySelectorAll('[data-format]')]
      .map((element) => element.getAttribute('data-format'))
      .filter(Boolean);
    return {
      viewport,
      format,
      caseId,
      screen: screen && {
        name: screen.getAttribute('data-screen'),
        phase: screen.getAttribute('data-phase'),
        format: screen.getAttribute('data-format'),
        rect: rect(screen),
      },
      router: router && {
        phase: router.getAttribute('data-game-phase'),
        screen: router.getAttribute('data-active-screen'),
      },
      formatValues: [...new Set(formatValues)],
      formatReached: formatValues.includes(format),
      reconnectBannerCount: [...document.querySelectorAll('[role="alert"]')]
        .filter((element) => /Room is already owned by another host|Reconnect room/i.test(element.innerText || ''))
        .length,
      landmarks,
      stage: rect(stage),
      content: rect(content),
      scroll: overflow,
      focusProbe: {
        before,
        afterScroll,
        after: {
          stageScrollLeft: stage?.scrollLeft ?? null,
          stageScrollTop: stage?.scrollTop ?? null,
          docScrollTop: document.documentElement.scrollTop,
        },
        samples: focusSamples,
      },
      controls,
      blockers: controls.filter((control) => !control.touchOK),
      roomCodeFits: [...document.querySelectorAll('.join-card__code')].filter(visible).every((element) => {
        const code = element.getBoundingClientRect();
        const pill = element.closest('.show-join-pill')?.getBoundingClientRect();
        return Boolean(pill && code.left >= pill.left && code.right <= pill.right);
      }),
      roomCodeTextFits: [...document.querySelectorAll('.join-card__code')].filter(visible).every((element) => {
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        const style = getComputedStyle(element);
        if (!context) return false;
        context.font = style.font;
        return context.measureText((element.textContent || '').trim()).width <= element.clientWidth + 1;
      }),
      hudOcclusions: controls.filter((control) => control.hudOverlap),
    };
  }, { viewport, format, caseId: spec.id });
  return evidence;
}

test('forced host stage formats and representative screens render with measured evidence', async (t) => {
  fs.mkdirSync('work', { recursive: true });
  // Playwright's own bundled headless Chromium, never the installed Google Chrome.app, which
  // auto-updates out from under a pinned test (NIT-10).
  const browser = wrapBrowserAgainstViteAutoReload(await chromium.launch({ headless: true }));
  t.after(() => browser.close());
  const results = [];
  const roomPrefix = randomUUID().replaceAll('-', '').slice(0, 4).toUpperCase();
  for (const viewport of VIEWPORTS) {
    for (const format of FORMATS) {
      for (const spec of CASES) {
        const room = `${roomPrefix}${results.length.toString(36).padStart(2, '0')}`;
        const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height }, reducedMotion: 'reduce' });
        await page.addInitScript(({ state, room }) => {
          localStorage.setItem('vrc_audio_muted', 'true');
          sessionStorage.setItem(`vof-game-session:${room}`, JSON.stringify({ state }));
        }, { state: fixtureState(spec, format), room });
        const errors = [];
        page.on('pageerror', (error) => errors.push(String(error)));
        await page.goto(`${BASE_URL}/?room=${room}`, { waitUntil: 'networkidle' });
        if (spec.id === 'question-entering') {
          try {
            await page.locator('[data-screen="question"]')
              .waitFor({ state: 'visible', timeout: 5_000 });
          } catch (error) {
            throw new Error(`question entering failed to mount: ${(await page.locator('body').innerText()).slice(0, 500)}; ${error}`);
          }
          const facilitatorControl = viewport.width <= 600
            ? page.locator('[data-role="hud-peek-trigger"]')
            : page.getByRole('button', { name: 'Advance (Space or Right Arrow)' });
          await facilitatorControl.waitFor({ state: 'visible', timeout: 5_000 });
        }
        const expectedScreens = {
          lobby: 'Lobby',
          'question-entering': 'QuestionShell',
          'question-revealed': 'QuestionShell',
          closing: 'Closing',
          'showdown-duel': 'Showdown',
        };
        assert.equal(await page.locator('[data-testid="screen-router"]').getAttribute('data-active-screen'), expectedScreens[spec.id]);
        assert.equal(await page.locator('[data-testid="screen-router"]').getAttribute('data-game-phase'), spec.phase);
        const evidence = await inspectPage(page, viewport, format, spec);
        assert.equal(evidence.router?.screen, expectedScreens[spec.id]);
        assert.ok(evidence.formatReached, `${viewport.id}/${format}/${spec.id} did not render the selected format`);
        assert.equal(evidence.roomCodeFits, true, `${viewport.id}/${format}/${spec.id} room code overflowed its pill`);
        assert.equal(evidence.roomCodeTextFits, true, `${viewport.id}/${format}/${spec.id} room code text was truncated`);
        assert.equal(evidence.reconnectBannerCount, 0, `${viewport.id}/${format}/${spec.id} screenshot proof contains a room ownership banner`);
        assert.deepEqual(evidence.hudOcclusions, [], `${viewport.id}/${format}/${spec.id} controls were occluded by the HUD`);
        if (spec.id.startsWith('question') || spec.id === 'closing' || spec.id === 'showdown-duel') {
          assert.equal(
            evidence.landmarks.filter((landmark) => !landmark.present || !landmark.fullyContained).length,
            0,
            `${viewport.id}/${format}/${spec.id} audience landmarks were missing or clipped: ${JSON.stringify(evidence.landmarks)}`
          );
        }
        const targetText = {
          lobby: 'Open the stage',
          'question-entering': viewport.width <= 600 ? 'Reveal Facilitator Controls' : 'Advance',
          'question-revealed': viewport.width <= 600 ? 'Reveal Facilitator Controls' : 'Advance',
          'showdown-duel': 'REVEAL RESULT',
        }[spec.id];
        if (spec.id === 'closing') {
          await page.locator('[data-role="closing-no-responses"]').first().waitFor({ state: 'visible', timeout: 2_000 });
        } else {
          assert.ok(evidence.controls.some((control) => control.text.includes(targetText)), `${viewport.id}/${format}/${spec.id} missing visible ${targetText}`);
        }
        results.push({ ...evidence, pageErrors: errors, screenshot: `work/stage-layout-forced-${viewport.id}-${format}-${spec.id}.png` });
        await page.close();
      }
    }
  }
  fs.writeFileSync('work/stage-layout-results.json', JSON.stringify({
    generatedAt: new Date().toISOString(),
    baseUrl: BASE_URL,
    roomPrefix,
    forcedStates: true,
    note: 'Fixtures use authored default questions and synthetic participant labels; this is rendered QA, not full game-flow acceptance.',
    results,
  }, null, 2));
  assert.equal(results.length, VIEWPORTS.length * FORMATS.length * CASES.length);
  assert.ok(results.length > 0, 'stage-layout produced no screenshot coverage');
  assert.equal(results.reduce((count, result) => count + result.reconnectBannerCount, 0), 0, 'stage-layout screenshots contain reconnect banners');
  assert.equal(results.filter((result) => result.pageErrors.length > 0).length, 0, 'forced stage pages emitted browser errors');
  assert.equal(results.filter((result) => !result.formatReached).length, 0, 'selected format did not reach a rendered data-format attribute');
  assert.ok(results.filter((result) => result.stage).length >= 1, 'no ScaledStage rendered');
  assert.equal(results.filter((result) => result.stage && (
    result.focusProbe.afterScroll.stageScrollLeft !== 0 || result.focusProbe.afterScroll.stageScrollTop !== 0
    || result.focusProbe.afterScroll.contentRect.x < -0.5 || result.focusProbe.afterScroll.contentRect.y < -0.5
    || result.focusProbe.afterScroll.contentRect.right > result.viewport.width + 0.5
    || result.focusProbe.afterScroll.contentRect.bottom > result.viewport.height + 0.5
  )).length, 0, 'scrollIntoView panned or clipped the scaled stage');
  assert.equal(results.filter((result) => result.blockers.length > 0).length, 0, 'visible host controls missed the 44px rendered touch target');
});
