// Solo play (VOF-44, 2026-09-15; two-tap loop VOF-W7, 2026-09-27): one person on /play, with the game
// running in the page. A tap on an answer reveals it right away, on one screen carrying the verdict and the reason
// together, then a single Next moves on -- two taps a question, never four. At 390x844, 430x932 and desktop it plays
// real rounds until the show deck has dealt every question kind, then a round of the offers. It fails on any room
// connection, any control under 44px, any sideways scroll, or a round that does not end on a score.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import test from 'node:test';
import { chromium } from 'playwright';
import { wrapBrowserAgainstViteAutoReload } from './render-harness.mjs';
// The engine's own scoring rules (VOF-44 rewrite, 2026-09-26): every question's points come from
// score(isRight, kind, streak), the same function settleCurrentQuestion calls for room and solo alike.
// The suite tracks kind and streak question by question and asks the engine for the expected result,
// rather than copying its constants, so a real change to scoring shows up here as a mismatch, not silence.
import { score } from '../../src/engine/scoring.ts';
// The Easter eggs (2026-09-28): the answer key for playing a round all right, and the band-aid's own timings, read
// from the app's own modules so a change to either shows up here as a mismatch.
import { answerKey, playKeyedRound } from './solo-answer-key.mjs';
import { SETTLE_MS, TAP_GAP_MS } from '../../src/eggs/band-aid/five-tap.ts';
// A whole-topic round's real length (VOF-68), read the same way the dealer itself computes it, so the browser
// round's own header count can be checked against it rather than just against an arbitrary ceiling.
import { SOLO_TOPICS } from '../../src/data/decks/topics/index.ts';
import { loadSoloPool } from '../../src/solo/solo-game.ts';

const EVIDENCE = process.env.VOF_SOLO_EVIDENCE_DIR ?? 'work/solo-play';
// VOF_BASE_URL runs the same checks against a deployed site (a preview, or vaxorfiction.com after a promote).
const BASE_URL = process.env.VOF_BASE_URL?.replace(/\/$/, '') || null;
const KINDS = ['binary', 'estimate', 'myth-among-three', 'order', 'which-patient'];
const CANONICAL = [
  { name: '390x844', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
  { name: '430x932', viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true },
  { name: '1440x900', viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false },
];
// VOF_SOLO_VIEWPORTS=375x667,844x390 runs other sizes instead. Anything narrower than 768 plays as a touch phone.
const VIEWPORTS = process.env.VOF_SOLO_VIEWPORTS
  ? process.env.VOF_SOLO_VIEWPORTS.split(',').map((size) => {
    const [width, height] = size.trim().split('x').map(Number);
    return { name: `${width}x${height}`, viewport: { width, height }, isMobile: width < 768, hasTouch: width < 768 };
  })
  : CANONICAL;
// A request that could reach a room: the production relay, the local relay, Supabase, or the presentation's code.
const ROOM_TRAFFIC = /\/rest\/v1\/|\/api\/rooms|supabase\.co|\/src\/presentation\/|PresentationSuite/;

async function startVite() {
  const probe = net.createServer();
  await new Promise((resolve) => probe.listen(0, '127.0.0.1', resolve));
  const port = probe.address().port;
  await new Promise((resolve) => probe.close(resolve));
  const child = spawn(path.resolve('node_modules/.bin/vite'), ['--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  // The same bound and cleanup as render-harness.mjs's own startVite: 20s, since a loaded machine can take more
  // than 10s to start Vite, and a start that fails or times out kills its child, which would otherwise outlive the
  // test and hold the runner open.
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Vite did not start: ${output}`)), 20_000);
      const inspect = (chunk) => { output += chunk.toString(); if (output.includes(`127.0.0.1:${port}`)) { clearTimeout(timer); resolve(); } };
      child.stdout.on('data', inspect); child.stderr.on('data', inspect);
      child.once('exit', (code) => { clearTimeout(timer); reject(new Error(`Vite exited ${code}: ${output}`)); });
    });
  } catch (error) {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
    throw error;
  }
  return { child, origin: `http://127.0.0.1:${port}` };
}

// Runs in the page before any app code: records every WebSocket and BroadcastChannel the page opens, except Vite's own
// development reload socket, and mutes audio the way every harness does. Also records every state the phone's own vote
// badge ever reaches, so "solo never shows the locked room states" is proved by what actually rendered, not by timing
// a wait around the beat.
function watchConnections() {
  const opened = [];
  Object.defineProperty(window, '__soloOpened', { value: opened });
  const NativeSocket = window.WebSocket;
  window.WebSocket = new Proxy(NativeSocket, {
    construct(target, args) {
      if (![args[1]].flat().includes('vite-hmr')) opened.push(`WebSocket ${String(args[0])}`);
      return Reflect.construct(target, args);
    },
  });
  if (window.BroadcastChannel) {
    const NativeChannel = window.BroadcastChannel;
    window.BroadcastChannel = new Proxy(NativeChannel, {
      construct(target, args) { opened.push(`BroadcastChannel ${String(args[0])}`); return Reflect.construct(target, args); },
    });
  }
  const badgeStates = [];
  Object.defineProperty(window, '__soloBadgeStates', { value: badgeStates });
  const record = (node) => {
    const badge = node.matches?.('[data-role="vote-confirmation-badge"]') ? node : node.querySelector?.('[data-role="vote-confirmation-badge"]');
    if (badge?.dataset?.state) badgeStates.push(badge.dataset.state);
  };
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'attributes') { record(mutation.target); continue; }
      for (const node of mutation.addedNodes) if (node instanceof Element) record(node);
    }
  });
  document.addEventListener('DOMContentLoaded', () => {
    observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-state'] });
  });
  try { localStorage.setItem('vrc_audio_muted', 'true'); } catch { /* storage can be unavailable */ }
}

// The solo controls ignore a second tap within 300ms, so the suite taps them no faster than a person could.
let lastSoloTap = 0;
async function soloTap(locator) {
  const wait = 350 - (Date.now() - lastSoloTap);
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  await locator.click();
  lastSoloTap = Date.now();
}

// Words a room or its stage uses that one person alone should never see or hear, plus the room's own locked-vote
// receipt copy (VOF-W7): a solo tap reveals right away, so neither ever belongs on a solo screen. innerText includes
// screen-reader-only text. Revealed counts as the stage's status word, never as the first word of a sentence.
const ROOM_WORDS = /Voting open|Votes locked|\bRevealed\b(?! [a-z])|\bEXPLANATION\b|Answer recorded|Sent to the room|The room got|You placed|Waiting for the (?:session|facilitator)|Your answer is in|Your order is in|Change answer/;

async function checkLayout(page, where) {
  const said = (await page.locator('body').innerText()).match(ROOM_WORDS);
  assert.equal(said, null, `${where}: no room words shown or spoken, saw "${said?.[0]}"`);
  // Fonts land and two frames paint before measuring, so a half-styled first paint in development cannot decide it.
  await page.evaluate(() => document.fonts.ready.then(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))));
  const report = await page.evaluate(() => {
    const small = [];
    const covered = [];
    const label = (element) => (element.getAttribute('aria-label') || element.textContent || '').trim().slice(0, 32);
    const describe = (element) => `${element.tagName.toLowerCase()}.${String(element.className).trim().split(/\s+/)[0]}`;
    // The part of a control its scrolling ancestors actually show, so one scrolled out of view is not called covered.
    const shown = (element) => {
      const box = element.getBoundingClientRect();
      let rect = { top: box.top, bottom: box.bottom, left: box.left, right: box.right };
      for (let parent = element.parentElement; parent; parent = parent.parentElement) {
        const style = getComputedStyle(parent);
        if (!/(auto|scroll|hidden)/.test(style.overflowX + style.overflowY)) continue;
        const clip = parent.getBoundingClientRect();
        rect = { top: Math.max(rect.top, clip.top), bottom: Math.min(rect.bottom, clip.bottom), left: Math.max(rect.left, clip.left), right: Math.min(rect.right, clip.right) };
      }
      return rect;
    };
    for (const element of document.querySelectorAll('button, a[href], [role="button"], input, select, textarea')) {
      const style = getComputedStyle(element);
      if (style.display === 'none' || style.visibility === 'hidden' || element.closest('[hidden]')) continue;
      const box = element.getBoundingClientRect();
      if (box.width === 0 && box.height === 0) continue;
      if (box.width < 44 || box.height < 44) small.push(`${element.tagName.toLowerCase()} "${label(element)}" ${Math.round(box.width)}x${Math.round(box.height)}`);
      // Whatever sits on top of a control's middle takes the tap instead of it.
      const rect = shown(element);
      if (rect.bottom - rect.top < 4 || rect.right - rect.left < 4) continue;
      const x = (rect.left + rect.right) / 2;
      const y = (rect.top + rect.bottom) / 2;
      if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) continue;
      const hit = document.elementFromPoint(x, y);
      if (hit && !element.contains(hit) && !hit.contains(element)) covered.push(`"${label(element)}" under ${describe(hit)}`);
    }
    const root = document.scrollingElement;
    const wide = [root, ...document.querySelectorAll('[data-role="phone-layout"], [data-role="phone-content"]')]
      .filter((element) => element.scrollWidth > element.clientWidth + 1)
      .map((element) => `${element.getAttribute?.('data-role') ?? 'page'} ${element.scrollWidth}>${element.clientWidth}`);
    // Name what sticks out, so a failure says where to look.
    const offenders = wide.length === 0 ? [] : [...document.querySelectorAll('body *')]
      .map((element) => ({ element, box: element.getBoundingClientRect() }))
      .filter((item) => item.box.right > root.clientWidth + 0.5)
      .sort((a, b) => b.box.right - a.box.right).slice(0, 4)
      .map((item) => `${item.element.tagName.toLowerCase()}.${String(item.element.className).trim().split(/\s+/)[0]} right ${Math.round(item.box.right)}`);
    return { small, covered, wide: [...wide, ...offenders] };
  });
  assert.deepEqual(report.small, [], `${where}: every control is at least 44px`);
  assert.deepEqual(report.covered, [], `${where}: nothing sits on top of a control`);
  assert.deepEqual(report.wide, [], `${where}: no sideways scroll`);
}

// One question, two taps: the answer (a choice, or an order's Submit order), then Next -- straight to the combined
// reveal-and-reason screen and back. `taps` counts only those two decisive actions, never a short-viewport paging
// tap (show-answer-options, next-order-page), which exists to fit a tiny screen rather than to play the game.
async function playRound(page, where, seen, shot, { doubleTap = false } = {}) {
  const kinds = [];
  // A round starts every device's streak at 0 (CONFIRM_RESTART_RUN resets seenDevices), so the round's own
  // running streak and total start fresh here too, question by question, the same way settleCurrentQuestion
  // folds one answer at a time.
  let streak = 0;
  let total = 0;
  let bestStreak = 0;
  let at = `${where} q1`;
  try {
    for (let guard = 0; guard < 25; guard += 1) {
      const vote = page.locator('[data-role="phone-vote-container"]');
      await vote.waitFor();
      const kind = await vote.getAttribute('data-kind');
      const first = !seen.has(kind);
      seen.add(kind);
      kinds.push(kind);
      at = `${where} q${kinds.length} ${kind}`;
      let taps = 0;
      // Solo counts the round in its header, since no stage does, in full from 390px and short below (2026-09-15).
      const headerCount = await readCount(page);
      // A round plays the whole topic in one go (VOF-68), so its length is the topic's own rotation, not a fixed
      // number -- from The big picture's 6 up to What to say's low twenties.
      assert.ok(headerCount && headerCount.number === kinds.length && headerCount.total <= 25, `${where}: the header counts question ${kinds.length} of the round, saw ${JSON.stringify(headerCount)}`);
      const narrowHeader = await page.evaluate(() => innerWidth < 390);
      assert.equal(headerCount.shown, narrowHeader ? `${headerCount.number}/${headerCount.total}` : `${headerCount.number} of ${headerCount.total}`, `${where}: the header shows the count ${narrowHeader ? 'short' : 'in full'}`);
      if (kind === 'which-patient' && where.includes('what to say')) {
        assert.equal((await page.locator('[data-role="phone-question-kicker"]').first().innerText()).trim(), 'WHICH REPLY IS BETTER?', `${where}: an offer asks which reply is better`);
      }
      if (kinds.length === 1) {
        // The bar's mark reads VAX or above FICTION? and stays narrow, so the topic keeps its room (2026-09-15).
        const mark = await page.locator('[data-role="phone-branding"][data-mark="stacked"]').evaluate((node) => {
          const box = (selector) => node.querySelector(selector).getBoundingClientRect();
          const or = node.querySelector('.show-wordmark__or');
          return {
            word: getComputedStyle(or).display === 'none' ? '' : or.textContent.trim(),
            beside: box('.show-wordmark__or').top < box('.show-wordmark__fiction').top,
            under: box('.show-wordmark__fiction').top >= box('.show-wordmark__vax').bottom - 2,
            width: Math.round(node.getBoundingClientRect().width),
          };
        });
        assert.equal(mark.word, 'OR', `${where}: the bar's mark says the word`);
        assert.ok(mark.beside && mark.under, `${where}: the mark reads VAX or above FICTION, saw ${JSON.stringify(mark)}`);
        assert.ok(mark.width <= 120, `${where}: the mark stays narrow, saw ${mark.width}px`);
      }
      // A short or medium question balances its lines, and a long one wraps pretty, on every phone.
      const stemWrap = await page.locator('.phone-vote-stem').first().evaluate((node) => ({ length: node.dataset.length, wrap: getComputedStyle(node).textWrapStyle || getComputedStyle(node).textWrap }));
      assert.equal(stemWrap.wrap, stemWrap.length === 'long' ? 'pretty' : 'balance', `${where}: a ${stemWrap.length} question stem keeps its wrap`);
      // A short screen (under 700px tall, PhoneVote's own rule) puts the question on its own page first and pages an order
      // two steps at a time. The vote screen settles into that after its first paint, so wait for the button itself.
      if (await page.evaluate(() => innerHeight < 700)) await page.locator('[data-action="show-answer-options"]').click();
      await checkLayout(page, `${where} q${kinds.length} ${kind} before answering`);
      if (kind === 'order') {
        for (let turn = 0; turn < 6; turn += 1) {
          const submit = page.locator('[data-action="submit-order"]').filter({ visible: true });
          // The answer tap shares solo's one 300ms debounce with the footer's own button (VOF-W7 review),
          // so this waits the same way soloTap does: no faster than a person could actually tap twice.
          if (await submit.count()) { await soloTap(submit.first()); taps += 1; break; }
          await page.locator('[data-action="next-order-page"]').filter({ visible: true }).first().click();
        }
      } else { await soloTap(vote.locator('[data-choice]').filter({ visible: true }).first()); taps += 1; }
      // The one tap above both answers and reveals (VOF-W7): no locked "Your answer is in" screen sits between
      // them, so the combined reveal-and-reason screen is already the next thing to wait for.
      await page.locator('[data-role="phone-reveal"][data-screen="combined"]').waitFor();
      await checkLayout(page, `${where} q${kinds.length} ${kind}`);
      // Accessibility (VOF-W7): the tap above both answers and reveals, with no lead-in screen to have
      // already put a person's attention on the verdict, so focus moves to it and it announces itself.
      // checkLayout already waited two animation frames, so PhoneReveal's own focus effect has run.
      const verdict = page.locator('[data-role="canonical-verdict"]');
      const a11y = await verdict.evaluate((node) => ({
        focused: document.activeElement === node,
        ariaLive: node.getAttribute('aria-live'),
        role: node.getAttribute('role'),
        text: (node.textContent ?? '').trim(),
      }));
      assert.equal(a11y.focused, true, `${where} q${kinds.length} ${kind}: focus lands on the verdict heading on reveal`);
      assert.equal(a11y.role, 'heading', `${where} q${kinds.length} ${kind}: the verdict reads as a heading`);
      assert.equal(a11y.ariaLive, 'polite', `${where} q${kinds.length} ${kind}: the verdict announces itself politely`);
      assert.ok(a11y.text.length > 0, `${where} q${kinds.length} ${kind}: the verdict has words to announce`);
      assert.equal(await page.locator('[data-role="phone-reactions"]').count(), 0, `${where}: no reactions in solo`);
      const said = page.locator('[data-role="phone-reveal-said"]');
      const isRight = (await said.getAttribute('data-outcome')) === 'right';
      // The engine's own rule: kind-weighted base points plus a streak bonus, never a flat right/wrong tally.
      const expected = score(isRight, kind, streak);
      streak = expected.nextStreak;
      total += expected.points;
      bestStreak = Math.max(bestStreak, expected.nextStreak);
      const earned = (await said.locator('.solo-points').innerText()).trim();
      const wantPoints = expected.points > 0 ? `+${expected.points} pts` : expected.points < 0 ? `−${Math.abs(expected.points)} pts` : '0 pts';
      // F-35 (fresh-review correction): the verdict pill above already names the answer on a hit,
      // so this chip carries only the points, on every path, not a repeated "TRUE · +100 pts".
      assert.equal(earned, wantPoints, `${where} q${kinds.length} ${kind}: the reveal shows this answer's kind-weighted points`);
      const bonusPill = said.locator('[data-role="streak-bonus-pill"]');
      if (expected.streakBonus > 0) {
        assert.equal((await bonusPill.innerText()).trim(), `+${expected.streakBonus} Streak Bonus!`, `${where} q${kinds.length} ${kind}: the streak bonus shows`);
      } else {
        assert.equal(await bonusPill.count(), 0, `${where} q${kinds.length} ${kind}: no streak bonus pill without a bonus`);
      }
      // The ✓ or × sits against the words it marks, never out in the middle of the line.
      const markGap = await said.evaluate((node) => {
        const mark = node.querySelector('[aria-hidden="true"]');
        const words = node.querySelector('.phone-reveal-said__text')?.firstChild ?? node.firstChild;
        if (!mark || !words) return 0;
        const range = document.createRange();
        range.setStart(words, 0);
        range.setEndBefore(mark);
        const rects = [...range.getClientRects()];
        const last = rects[rects.length - 1];
        return last ? mark.getBoundingClientRect().left - last.right : 0;
      });
      assert.ok(markGap <= 12, `${where}: the reveal mark sits against its words, ${Math.round(markGap)}px away`);
      assert.equal(await page.locator('[data-role="phone-vote-status"]').filter({ visible: true }).count(), 0, `${where}: no stage status word in solo`);
      // The reveal keeps the question on screen, since no stage shows it. A short phone keeps it for true or false and
      // estimates, whose cards leave room, and drops it where an order or a reply pages.
      const stemShown = (await page.evaluate(() => innerHeight >= 700)) || kind === 'binary' || kind === 'estimate';
      assert.equal(await page.locator('[data-role="solo-reveal-stem"]').count(), stemShown ? 1 : 0, `${where}: the question ${stemShown ? 'stays' : 'gives way to paging'} on the reveal`);
      assert.equal(await page.locator('[data-role="phone-reveal"]').evaluate((node) => getComputedStyle(node).justifyContent), 'flex-start', `${where}: the reveal sits at the top, not the middle`);
      if (stemShown) {
        const [stem, banner] = await Promise.all([page.locator('[data-role="solo-reveal-stem"]').boundingBox(), page.locator('[data-role="outcome-banner"]').boundingBox()]);
        // A phone stacks the question above its verdict. A wide screen keeps the question screen's two columns, so the question
        // sits left of its verdict and starts level with it.
        if (await page.evaluate(() => innerWidth >= 900)) {
          assert.ok(stem.x + stem.width <= banner.x && stem.y < banner.y + banner.height, `${where}: the question sits beside its verdict, saw ${JSON.stringify({ stem, banner })}`);
          const kicker = await page.locator('.phone-combined-screen > .phone-reveal-meta').boundingBox();
          assert.ok(kicker && stem.y - (kicker.y + kicker.height) <= 24, `${where}: the question sits right under its kicker, saw ${JSON.stringify({ kicker, stem })}`);
        } else {
          assert.ok(stem.y + stem.height <= banner.y, `${where}: the question sits above its verdict`);
        }
      }
      if (kind === 'order') {
        // "Correct order" keeps one line on any phone 340px or wider, in rooms and solo alike (2026-09-15), and at any
        // width it stays inside its card's padding.
        const pill = await page.locator('[data-role="outcome-banner"]').evaluate((card) => {
          const verdict = card.querySelector('[data-role="canonical-verdict"]');
          const range = document.createRange();
          range.selectNodeContents(verdict);
          const style = getComputedStyle(card);
          const contentRight = card.getBoundingClientRect().right - parseFloat(style.paddingRight) - parseFloat(style.borderRightWidth);
          return { lines: new Set([...range.getClientRects()].map((rect) => Math.round(rect.top))).size, spare: contentRight - verdict.getBoundingClientRect().right, wide: innerWidth >= 340 };
        });
        if (pill.wide) assert.equal(pill.lines, 1, `${where}: the order pill keeps "Correct order" on one line`);
        assert.ok(pill.spare >= 0, `${where}: the order pill stays inside its card, ${pill.spare.toFixed(1)}px to spare`);
      }
      // The reason comes with the reveal (VOF-W7): the takeaway card is already up, on the same screen as the
      // verdict, with no separate "See why" step to reach it.
      const takeaway = page.locator('[data-role="takeaway-card"]');
      await takeaway.waitFor();
      assert.ok((await takeaway.innerText()).trim().length > 0, `${where} q${kinds.length} ${kind}: the reveal screen carries the reason`);
      const again = await readCount(page);
      assert.equal(again && `${again.number} of ${again.total}`, `${headerCount.number} of ${headerCount.total}`, `${where}: the count stays through the reveal`);
      if (first && shot) await shot(`reveal-${kind}`);
      const next = page.locator('[data-action="solo-next"]');
      const last = await next.getAttribute('data-step');
      if (last === 'score') assert.equal(headerCount.total, kinds.length, `${where}: the last question reads ${kinds.length} of ${kinds.length}`);
      if (doubleTap && kinds.length === 1) {
        // A double tap on Next takes one step, never two, so the round does not skip a question.
        assert.equal(await next.getAttribute('data-step'), last);
        await new Promise((resolve) => setTimeout(resolve, 350));
        await next.dblclick();
        lastSoloTap = Date.now();
        taps += 1;
      } else {
        await soloTap(next);
        taps += 1;
      }
      assert.equal(taps, 2, `${where} q${kinds.length} ${kind}: the question took two taps, an answer and ${last === 'score' ? 'See your score' : 'Next question'}`);
      if (last === 'score') return { kinds, score: total, bestStreak };
      assert.equal(last, 'next', `${where}: the reveal leads to the next question`);
    }
    throw new Error(`${where}: the round never reached its score`);

  } catch (error) {
    // Name the size, question and kind, and keep what the screen showed.
    await page.screenshot({ path: path.join(EVIDENCE, `failure-${at.replace(/[^a-z0-9]+/gi, "-")}.png`) }).catch(() => {});
    error.message = `${at}: ${error.message}`;
    throw error;
  }
}

// The header's count: what a screen reader hears, and what shows, which is "2 of 8" from 390px and "2/8" below.
async function readCount(page) {
  const counted = page.locator('[data-role="solo-progress"]');
  if (!(await counted.count())) return null;
  const spoken = /Question (\d+) of (\d+)/.exec(await counted.locator('.sr-only').innerText());
  const shown = (await counted.locator('[aria-hidden="true"]').filter({ visible: true }).innerText()).trim();
  return spoken ? { number: Number(spoken[1]), total: Number(spoken[2]), shown } : null;
}

// The stem of the question on screen, read once the vote screen is up.
async function firstStem(page) {
  await page.locator('[data-role="phone-vote-container"]').waitFor();
  return (await page.locator('[data-role="question-stem"]').innerText()).trim();
}

async function checkClosing(page, where, count, expected) {
  await page.locator('[data-role="phone-closing"]').waitFor();
  const headline = (await page.locator('[data-role="phone-closing-room-line"]').innerText()).trim();
  const scoreLine = /^(\d+) of (\d+) right$/.exec(headline);
  assert.ok(scoreLine, `${where}: the close leads with the score, saw "${headline}"`);
  assert.equal(Number(scoreLine[2]), count, `${where}: out of the ${count} played`);
  const right = Number(scoreLine[1]);
  const points = (await page.locator('[data-role="phone-closing-personal"] [data-stat="points"] strong').innerText()).trim();
  assert.match(points, /^-?\d+$/, `${where}: the close shows points, saw "${points}"`);
  // The engine's own kind-weighted, streak-bonused total (score() folded question by question in playRound),
  // never a flat right/wrong tally.
  assert.equal(Number(points), expected.score, `${where}: the close's points match the engine's own scoring`);
  const streakText = (await page.locator('[data-role="phone-closing-personal"] [data-stat="streak"] strong').innerText()).trim();
  assert.equal(Number(streakText), expected.bestStreak, `${where}: the close's longest streak matches the round played`);
  const strip = await page.locator('[data-role="solo-closing-strip"] [data-outcome]').evaluateAll((items) => items.map((item) => item.getAttribute('data-outcome')));
  assert.equal(strip.length, count, `${where}: the strip shows every question played`);
  assert.equal(strip.filter((outcome) => outcome === 'right').length, right, `${where}: the strip agrees with the score`);
  const rowCounts = await page.locator('[data-role="solo-closing-strip"] [data-outcome]').evaluateAll((marks) => {
    const rows = new Map();
    for (const mark of marks) {
      const top = Math.round(mark.getBoundingClientRect().top);
      rows.set(top, (rows.get(top) ?? 0) + 1);
    }
    return [...rows.entries()].sort(([a], [b]) => a - b).map(([top, count]) => ({ top, count }));
  });
  const rows = rowCounts.length;
  // A round of eight or fewer (today's own length) still holds one row. Past eight, the whole-topic round (VOF-68)
  // steps its marks down a size and switches to a fixed column count -- half the marks, rounded up (solo.css) --
  // so it always balances into exactly two rows, never the three or four flex-wrap's greedy packing left ragged.
  const maxRows = count <= 8 ? 1 : 2;
  assert.ok(rows <= maxRows, `${where}: the strip holds its ${count} marks in ${maxRows} row(s) or fewer, saw ${rows}`);
  if (count > 8) {
    const lastRowCount = rowCounts.at(-1)?.count ?? 0;
    const minimumLastRow = Math.floor(count / 2);
    assert.ok(lastRowCount >= minimumLastRow, `${where}: the last row holds at least half the marks rounded down, expected ${minimumLastRow}, saw ${lastRowCount}`);
  }
  const [band, tiles] = await Promise.all([page.locator('[data-role="solo-closing-strip"]').boundingBox(), page.locator('[data-role="phone-closing-personal"]').boundingBox()]);
  assert.ok(Math.round(tiles.y - band.y - band.height) >= 24, `${where}: the score block stands 24px clear of the cards`);
  assert.equal(await page.getByText(/The room got|You placed|Waiting for the session|Sent to the room/).count(), 0, `${where}: no room wording`);
  assert.equal(await page.locator('[data-role="phone-room-chip"], [data-role="phone-connection-status"]').count(), 0, `${where}: no room chrome`);
  assert.equal(await page.locator('[data-role="solo-progress"]').count(), 0, `${where}: the close drops the question count`);
  // The perfect-round reward (2026-09-28) shows on this close exactly when every question was answered right.
  const perfect = right === count && count > 0;
  assert.equal(await page.locator('[data-role="perfect-round-reward"]').count(), perfect ? 1 : 0, `${where}: ${right} of ${count} right ${perfect ? 'earns' : 'does not earn'} the reward`);
  await checkLayout(page, `${where} closing`);
}

test('solo play runs real rounds at every canonical size with no room, 44px controls, no sideways scroll and two taps a question', async () => {
  const { child, origin } = BASE_URL ? { child: null, origin: BASE_URL } : await startVite();
  // Playwright's own bundled headless Chromium, never the installed Google Chrome.app, which
  // auto-updates out from under a pinned test (NIT-10).
  const browser = wrapBrowserAgainstViteAutoReload(await chromium.launch({ headless: true }));
  await fs.mkdir(EVIDENCE, { recursive: true });
  try {
    for (const size of VIEWPORTS) {
      const context = await browser.newContext({ viewport: size.viewport, isMobile: size.isMobile, hasTouch: size.hasTouch, reducedMotion: 'reduce' });
      await context.addInitScript(watchConnections);
      const page = await context.newPage();
      const errors = [];
      const traffic = [];
      page.on('pageerror', (error) => errors.push(String(error)));
      page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
      page.on('request', (request) => { if (ROOM_TRAFFIC.test(request.url())) traffic.push(request.url()); });
      const shot = (name) => page.screenshot({ path: path.join(EVIDENCE, `${size.name}-${name}.png`) });

      // The entry screen offers solo beside the two room choices, and /play opens the topics.
      await page.goto(`${origin}/`, { waitUntil: 'load' });
      const solo = page.getByRole('button', { name: 'Play on your own' });
      await solo.waitFor();
      await checkLayout(page, `${size.name} entry`);
      if (size.viewport.width >= 1024) {
        const tops = await page.locator('.entry-actions button').evaluateAll((buttons) => buttons.map((button) => Math.round(button.getBoundingClientRect().top)));
        assert.equal(new Set(tops).size, 1, `${size.name}: the three ways in share one row, saw tops ${tops}`);
      }
      await shot('entry');
      await solo.click();
      await page.waitForURL(`${origin}/play`);
      await page.locator('[data-role="solo-topics"]').waitFor();
      assert.equal(await page.locator('[data-topic]').count(), 10, `${size.name}: ten topics`);
      await checkLayout(page, `${size.name} topics`);
      await shot('topics');

      // Leaving mid-round goes back to the topics.
      await page.locator('[data-topic="hpv"]').click();
      await page.locator('[data-role="phone-vote-container"]').waitFor();
      await soloTap(page.locator('[data-action="solo-leave"]'));
      await page.locator('[data-role="solo-topics"]').waitFor();

      // A round plays the whole topic in one go (VOF-68): flu's own round already deals every kind it has, and
      // At the counter's own round brings in the one kind flu does not (order), so one round of each, not several
      // partial ones, covers the whole set.
      const seen = new Set();
      let firstRound = true;
      let lastFluStem = null;
      for (const theme of ['flu', 'at-the-counter']) {
        await page.locator(`[data-topic="${theme}"]`).click();
        if (theme === 'flu') lastFluStem = await firstStem(page);
        const { kinds, score: roundScore, bestStreak } = await playRound(page, `${size.name} ${theme} round`, seen, shot, { doubleTap: firstRound });
        if (theme === 'flu') {
          // VOF-68's own promise: a round plays the whole topic, not a slice of it. Checked once, against the
          // dealer's own rotation, rather than trusted from the header alone.
          const wholeTopic = SOLO_TOPICS.find((topic) => topic.id === 'flu');
          const pool = await loadSoloPool(wholeTopic);
          assert.equal(kinds.length, pool.rotation.length, `${size.name}: flu's round played its whole rotation of ${pool.rotation.length}, not a slice of it`);
        }
        await checkClosing(page, `${size.name} ${theme} round`, kinds.length, { score: roundScore, bestStreak });
        if (firstRound) await shot('closing');
        if (theme === 'flu' && kinds.length === 15 && (size.name === '430x932' || size.name === '360x780')) await shot('closing-15-flu');
        firstRound = false;
        const again = page.locator('[data-action="solo-play-again"]');
        assert.equal((await again.innerText()).trim(), 'Play again', `${size.name} ${theme}: a whole-topic round always offers a full replay`);
        // Flu leaves its close by the header's X and At the counter by More topics. Both keep the topic's own
        // play count moving, so a later return to flu is its second play (9.5), never a repeat of this round.
        await soloTap(page.locator(theme === 'flu' ? '[data-action="solo-leave"]' : '[data-action="solo-topics"]'));
        await page.locator('[data-role="solo-topics"]').waitFor();
      }
      assert.deepEqual([...seen].sort(), KINDS, `${size.name}: the topics dealt every kind`);

      // Then a round of What to say: the offers as which-reply questions, with the show's conversation questions.
      await page.locator('[data-topic="what-to-say"]').click();
      const offers = await playRound(page, `${size.name} what to say`, new Set(['binary', 'estimate', 'myth-among-three', 'order']), shot);
      assert.ok(offers.kinds.every((kind) => kind === 'which-patient' || kind === 'order'), `${size.name}: What to say is reply and conversation questions`);
      await checkClosing(page, `${size.name} what to say`, offers.kinds.length, { score: offers.score, bestStreak: offers.bestStreak });

      // Flu's second play (9.5): a new take, opening on a different first question than its first play did.
      await soloTap(page.locator('[data-action="solo-topics"]'));
      await page.locator('[data-role="solo-topics"]').waitFor();
      await page.locator('[data-topic="flu"]').click();
      assert.notEqual(await firstStem(page), lastFluStem, `${size.name}: flu's second play opens differently from its first`);

      assert.deepEqual(await page.evaluate(() => [...window.__soloOpened]), [], `${size.name}: no WebSocket or BroadcastChannel during solo play`);
      assert.deepEqual(traffic, [], `${size.name}: no request toward a room or the presentation`);
      assert.deepEqual(errors, [], `${size.name}: no page errors`);
      // A solo tap reveals immediately (VOF-W7): the phone's own vote badge, watched from the moment the page
      // loaded, never once reached the room's locked "in" state or its "locked" state, in any round just played.
      const badgeStates = await page.evaluate(() => [...window.__soloBadgeStates]);
      assert.ok(badgeStates.length > 0, `${size.name}: the badge watch saw the vote badge render at least once`);
      assert.ok(!badgeStates.includes('in'), `${size.name}: solo's vote badge never reaches "Your answer is in", saw ${JSON.stringify(badgeStates)}`);
      assert.ok(!badgeStates.includes('locked'), `${size.name}: solo's vote badge never locks, saw ${JSON.stringify(badgeStates)}`);
      // Control: the watch does see a socket and a channel when one opens.
      await page.evaluate(() => {
        try { new WebSocket('ws://127.0.0.1:9/solo-control').close(); } catch { /* recorded before it throws */ }
        new BroadcastChannel('solo-control').close();
      });
      assert.deepEqual(await page.evaluate(() => window.__soloOpened.map((entry) => entry.split(' ')[0])), ['WebSocket', 'BroadcastChannel'], 'the watch sees what it guards');
      await context.close();
    }
  } finally {
    await browser.close();
    child?.kill('SIGTERM');
  }
});

// A double tap is one gesture (VOF-W7 review): PhoneVote's own choice buttons carry no debounce of their own,
// so without SoloSuite's own guard, tapping the answer and immediately tapping Next -- the same excited
// double-tap, just landing on two different controls a person's second finger reaches after the screen
// changes -- would record the vote, reveal it, and ADVANCE a second time before anyone reads the reason. A
// dblclick on the answer itself does not reach this: Playwright's second click lands on the reveal screen
// that already replaced the vote screen, not on a vote button or Next, so it proves nothing either way.
test('an answer tap immediately followed by a Next tap does not also skip the reason', async () => {
  const { child, origin } = BASE_URL ? { child: null, origin: BASE_URL } : await startVite();
  const browser = wrapBrowserAgainstViteAutoReload(await chromium.launch({ headless: true }));
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
    const page = await context.newPage();
    await page.goto(`${origin}/play`, { waitUntil: 'load' });
    await page.locator('[data-role="solo-topics"]').waitFor();
    await page.locator('[data-topic="flu"]').click();
    const vote = page.locator('[data-role="phone-vote-container"]');
    await vote.waitFor();
    if (await page.evaluate(() => innerHeight < 700)) await page.locator('[data-action="show-answer-options"]').click();
    const before = await readCount(page);
    await vote.locator('[data-choice]').filter({ visible: true }).first().click();
    const next = page.locator('[data-action="solo-next"]');
    await next.waitFor();
    // No wait here on purpose: the same 300ms window the answer tap itself just started.
    await next.click();
    await page.waitForTimeout(400);
    const after = await readCount(page);
    assert.deepEqual(after, before, 'the header count has not moved on: the immediate Next tap was debounced, not a second real step');
    const takeaway = page.locator('[data-role="takeaway-card"]');
    await takeaway.waitFor();
    assert.ok((await takeaway.innerText()).trim().length > 0, 'the reason is still on screen after the debounced tap');
    await context.close();
  } finally {
    await browser.close();
    child?.kill('SIGTERM');
  }
});

// No test ran a pace variant end to end (VOF-W7 review). One round each, at 390x844, through the same layout
// gate every other screen answers to -- including the header's own pace readout beside a topic label long
// enough to test its truncation, and Best's own write landing exactly once.
test('each pace variant plays a real round at 390x844 with no layout break', async () => {
  const { child, origin } = BASE_URL ? { child: null, origin: BASE_URL } : await startVite();
  const browser = wrapBrowserAgainstViteAutoReload(await chromium.launch({ headless: true }));
  try {
    for (const pace of ['run', 'climb', 'best']) {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
      const page = await context.newPage();
      // Counts every localStorage.setItem the page makes, so Best's own write can be proved to land exactly
      // once a round even though the closing screen re-renders more than once (streak/HUD updates, etc).
      await context.addInitScript(() => {
        const writes = [];
        Object.defineProperty(window, '__soloStorageWrites', { value: writes });
        const native = Storage.prototype.setItem;
        Storage.prototype.setItem = function patchedSetItem(key, value) {
          writes.push(key);
          return native.call(this, key, value);
        };
      });
      await page.goto(`${origin}/play?soloPace=${pace}`, { waitUntil: 'load' });
      await page.locator('[data-role="solo-topics"]').waitFor();
      await checkLayout(page, `${pace} topics`);
      // Tetanus and whooping cough: a long enough topic label, beside the pace readout, to exercise the
      // header's own truncation rather than the shortest topic on the list.
      await page.locator('[data-topic="tetanus"]').click();
      await page.locator('[data-role="phone-vote-container"]').waitFor();
      // The pace readout and the topic label are not controls, so checkLayout's own overlap check (buttons,
      // links, inputs) never sees them sit on top of each other -- check it directly here.
      const [pillBox, topicBox] = await Promise.all([page.locator('.solo-pace-hud').boundingBox(), page.locator('.solo-header__topic').boundingBox()]);
      assert.ok(pillBox.x + pillBox.width <= topicBox.x, `${pace}: the pace readout and the topic label do not overlap, saw ${JSON.stringify({ pillBox, topicBox })}`);
      await playRound(page, `${pace} round`, new Set(), null);
      await page.locator('[data-role="phone-closing"]').waitFor();
      await checkLayout(page, `${pace} closing`);
      assert.equal(await page.locator('[data-role="solo-pace-recap-headline"]').count(), 1, `${pace}: the pace's own recap headline shows`);
      if (pace === 'best') {
        const writes = await page.evaluate(() => window.__soloStorageWrites.filter((key) => key.startsWith('vof-solo-best:')));
        assert.equal(writes.length, 1, `Best writes its target exactly once a round, saw ${JSON.stringify(writes)}`);
      }
      const nextButton = page.locator('[data-action="solo-play-next-topic"]');
      if (await nextButton.count()) {
        // "Next up" is a real control (VOF-W7 review), not just a line of text.
        const label = (await nextButton.innerText()).trim();
        assert.match(label, /^Play /, `${pace}: the next-topic control reads "Play <topic>"`);
        await checkLayout(page, `${pace} closing (next-topic control)`);
      }
      await context.close();
    }
  } finally {
    await browser.close();
    child?.kill('SIGTERM');
  }
});

// Play <topic> advances the play count the same as More topics and the header's own X (VOF-W7 review, 9.5), so
// a later return to a topic already played this visit is its second play, not a repeat of the first.
test('Play <topic> counts as a play, so a later return deals a second play, not a repeat', async () => {
  const { child, origin } = BASE_URL ? { child: null, origin: BASE_URL } : await startVite();
  const browser = wrapBrowserAgainstViteAutoReload(await chromium.launch({ headless: true }));
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
    const page = await context.newPage();
    await page.goto(`${origin}/play?soloPace=run`, { waitUntil: 'load' });
    await page.locator('[data-role="solo-topics"]').waitFor();
    await page.locator('[data-topic="flu"]').click();
    const firstFluStem = await firstStem(page);
    await playRound(page, 'flu round', new Set(), null);
    await page.locator('[data-role="phone-closing"]').waitFor();
    const nextButton = page.locator('[data-action="solo-play-next-topic"]');
    await nextButton.waitFor();
    // Play <topic> shares the same 300ms debounce every other solo control does, and playRound's own last
    // tap (See your score) only just fired -- soloTap paces this one the same way a person's own next tap
    // would land.
    await soloTap(nextButton);
    // Now playing the next topic's own round -- leave it, and flu must have moved on from the round Play
    // <topic> left it at, not repeat the round just played.
    await page.locator('[data-role="phone-vote-container"]').waitFor();
    await soloTap(page.locator('[data-action="solo-leave"]'));
    await page.locator('[data-role="solo-topics"]').waitFor();
    await page.locator('[data-topic="flu"]').click();
    assert.notEqual(await firstStem(page), firstFluStem, "flu opens on its second play (9.5): Play <topic> counted flu's first round the same as More topics and the header X");
    await context.close();
  } finally {
    await browser.close();
    child?.kill('SIGTERM');
  }
});

// ── The Easter eggs (2026-09-28): the perfect-round reward on the recap, and the landing syringe's band-aid ──────

// The reward's own layout. It rides in the stat list: on a phone with room, a band across the top of the tiles, no
// taller than what it holds, and on a short one the tile beside the points, in the longest streak's place and exactly
// as tall as the points tile. Either way it sits under the score, inside the screen, with every word whole and at
// least 12px, the sticker clear of the strip above and of the points tile, and still under reduced motion.
async function checkReward(page, where) {
  await page.evaluate(() => document.fonts.ready);
  const report = await page.locator('[data-role="perfect-round-reward"]').evaluate((reward) => {
    const box = (node) => node.getBoundingClientRect();
    const band = box(reward);
    const surface = reward.closest('[data-role="phone-closing"]');
    const header = surface.querySelector(':scope > .solo-closing__header');
    const stats = surface.querySelector(':scope > [data-role="phone-closing-personal"]');
    const points = box(stats.querySelector(':scope > [data-stat="points"]'));
    const streak = stats.querySelector(':scope > [data-stat="streak"]');
    const compact = innerHeight < 820;
    const art = reward.querySelector('.perfect-round-reward__art');
    const copy = reward.querySelector('.perfect-round-reward__copy');
    const sticker = box(reward.querySelector('svg.perfect-sticker'));
    const strip = surface.querySelector('[data-role="solo-closing-strip"]');
    const content = reward.closest('[data-role="phone-content"]');
    // Each word on the sticker sits inside its gold face: its full width within the face's, and its middle within the
    // face's height. A text box is the font's whole em box, taller than the ink, so its top and bottom are not the
    // test. And it is set at its natural width: no textLength squeezes it to fit.
    const plate = reward.querySelector('.perfect-sticker__face');
    const within = plate ? box(plate) : band;
    const words = [...reward.querySelectorAll('svg text')].map((text) => {
      const rect = box(text);
      const ctm = text.getScreenCTM();
      const middle = (rect.top + rect.bottom) / 2;
      return {
        text: text.textContent,
        px: Math.round(parseFloat(getComputedStyle(text).fontSize) * Math.hypot(ctm.a, ctm.b) * 10) / 10,
        inside: rect.left >= within.left && rect.right <= within.right && middle >= within.top && middle <= within.bottom,
        squeezed: text.hasAttribute('textLength') || text.hasAttribute('lengthAdjust'),
      };
    });
    // A copy line is whole when every rect of its text sits inside the band and it is no wider than its column.
    const clippedCopy = [...copy.children].filter((line) => {
      const range = document.createRange();
      range.selectNodeContents(line);
      const rects = [...range.getClientRects()];
      return rects.length === 0 || line.scrollWidth > line.clientWidth + 1
        || rects.some((rect) => rect.left < band.left || rect.right > band.right || rect.top < band.top || rect.bottom > band.bottom);
    }).map((line) => line.textContent);
    return {
      compact,
      underScore: box(header).bottom <= band.top,
      // Tall: above the tiles, the streak tile still showing. Short: in the points tile's row, to its right, as tall
      // as it, with the streak tile out of sight.
      placed: compact
        ? Math.abs(band.top - points.top) <= 1 && Math.abs(band.height - points.height) <= 1 && band.left >= points.right
        : band.bottom <= points.top,
      // The row stretches the two tiles to match, so "as tall as the points tile" alone would pass a reward whose copy
      // outgrew the tile and grew the whole row. Its height with the reward taken out, read in the same frame and put
      // straight back, is the points tile's own, and the row must be no taller than that. Showing the reward again
      // would restart its arrival, which is why every caller runs under reduced motion.
      pointsStretch: compact ? (() => {
        const item = reward.closest('li');
        item.style.display = 'none';
        const natural = box(stats.querySelector(':scope > [data-stat="points"]')).height;
        item.style.display = '';
        return Math.round((points.height - natural) * 10) / 10;
      })() : 0,
      streakVisible: box(streak).width > 1 && box(streak).height > 1,
      // The phone's content clips sideways overflow, so the page's own scroll width cannot see a sticker run off the
      // edge. Its box is checked directly.
      inScreen: band.left >= 0 && band.right <= innerWidth && sticker.left >= 0 && sticker.right <= innerWidth && band.bottom <= box(content).bottom,
      words,
      clippedCopy,
      slack: Math.round(band.height - Math.max(box(art).height, box(copy).height)),
      clearAbove: Math.round(sticker.top - box(strip ?? header).bottom),
      clearPoints: Math.round(compact ? sticker.left - points.right : points.top - sticker.bottom),
      motion: getComputedStyle(reward.querySelector('.perfect-sticker__body')).animationName,
    };
  });
  assert.equal(report.underScore, true, `${where}: the reward sits under the score`);
  assert.equal(report.placed, true, report.compact
    ? `${where}: on a short screen the reward is the tile beside the points, as tall as it`
    : `${where}: the reward is a band across the top of the tiles`);
  assert.equal(report.streakVisible, !report.compact, `${where}: the longest streak tile ${report.compact ? 'gives its place to the reward' : 'stays'}`);
  // Out of sight on a short screen, but never out of the accessibility tree: the list still reads its longest streak.
  // getByRole leaves out anything hidden from assistive tech, so display none would drop the item here.
  const streakItem = page.locator('[data-role="phone-closing"] [data-role="phone-closing-personal"]').getByRole('listitem').filter({ hasText: /longest streak/ });
  assert.equal(await streakItem.count(), 1, `${where}: a screen reader still hears the longest streak`);
  assert.ok(report.pointsStretch <= 0.5, `${where}: the reward never makes the stat row taller than the points tile's own ${report.pointsStretch}px`);
  assert.equal(report.inScreen, true, `${where}: the reward is whole on screen, with no sideways overflow`);
  assert.ok(report.words.length >= 1, `${where}: the reward's own words are there to check`);
  for (const word of report.words) {
    assert.equal(word.inside, true, `${where}: "${word.text}" stays inside its own surface on the art`);
    assert.equal(word.squeezed, false, `${where}: "${word.text}" is set at its natural width`);
    assert.ok(word.px >= 12, `${where}: "${word.text}" renders at ${word.px}px, at least 12px`);
  }
  assert.deepEqual(report.clippedCopy, [], `${where}: no line of the reward's copy is clipped`);
  // The band's own padding and border only (8px a side and the border): it never holds an empty strip above or
  // below. The short screen's tile takes its height from the points tile it sits beside instead, checked above.
  if (!report.compact) assert.ok(report.slack <= 18, `${where}: the band is no taller than what it holds, ${report.slack}px of slack, at most 18`);
  assert.ok(report.clearAbove >= 8, `${where}: the sticker stays ${report.clearAbove}px clear of the strip above it, at least 8`);
  assert.ok(report.clearPoints >= 8, `${where}: the sticker stays ${report.clearPoints}px clear of the points tile, at least 8`);
  assert.equal(report.motion, 'none', `${where}: under reduced motion the reward holds still`);
}

test('a perfect solo round earns the Perfect round sticker on every pace, and one miss does not', async () => {
  const key = await answerKey();
  const { child, origin } = BASE_URL ? { child: null, origin: BASE_URL } : await startVite();
  const browser = wrapBrowserAgainstViteAutoReload(await chromium.launch({ headless: true }));
  await fs.mkdir(EVIDENCE, { recursive: true });
  try {
    // Every pace, each on a topic whose round deals more than true or false (between them, every kind), at all three
    // phone sizes. The Climb plan opens an old options link (?taste=reward-pin): the look switch is gone, so it
    // still earns the sticker, the owner's pick.
    const plans = [
      { pace: 'today', topic: 'flu', viewport: { width: 390, height: 844 } },
      { pace: 'run', topic: 'tetanus', viewport: { width: 360, height: 780 } },
      { pace: 'climb', topic: 'at-the-counter', viewport: { width: 360, height: 780 }, oldLink: 'taste=reward-pin' },
      { pace: 'best', topic: 'what-to-say', viewport: { width: 430, height: 932 } },
    ];
    for (const plan of plans) {
      const where = `${plan.pace} ${plan.topic} ${plan.viewport.width}x${plan.viewport.height}`;
      const context = await browser.newContext({ viewport: plan.viewport, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
      await context.addInitScript(watchConnections);
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (error) => errors.push(String(error)));
      page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
      const query = new URLSearchParams();
      query.set('soloPace', plan.pace);
      for (const [name, value] of new URLSearchParams(plan.oldLink ?? '')) query.set(name, value);
      await page.goto(`${origin}/play${query.size ? `?${query}` : ''}`, { waitUntil: 'load' });
      await page.locator(`[data-topic="${plan.topic}"]`).click();

      const perfect = await playKeyedRound(page, `${where} all right`, key, { tap: soloTap });
      await page.locator('[data-role="phone-closing"]').waitFor();
      assert.equal((await page.locator('[data-role="phone-closing-room-line"]').innerText()).trim(), `${perfect.length} of ${perfect.length} right`, `${where}: the close counts a perfect round`);
      const reward = page.locator('[data-role="perfect-round-reward"]');
      assert.equal(await reward.count(), 1, `${where}: a perfect round earns the reward`);
      assert.equal(await reward.locator('svg.perfect-sticker').count(), 1, `${where}: the reward is the Perfect round sticker`);
      assert.equal((await reward.locator('.perfect-round-reward__kicker').textContent()).trim(), `${perfect.length} for ${perfect.length}`, `${where}: the reward counts the round`);
      await checkReward(page, where);
      await checkLayout(page, `${where} perfect closing`);
      await page.screenshot({ path: path.join(EVIDENCE, `reward-${plan.pace}-${plan.viewport.width}x${plan.viewport.height}.png`) });

      // The next round has one miss, and earns nothing.
      await soloTap(page.locator('[data-action="solo-play-again"]'));
      const missed = await playKeyedRound(page, `${where} one miss`, key, { tap: soloTap, missAt: 2 });
      await page.locator('[data-role="phone-closing"]').waitFor();
      assert.equal(missed.filter((outcome) => outcome === 'missed').length, 1, `${where}: exactly one miss`);
      assert.equal((await page.locator('[data-role="phone-closing-room-line"]').innerText()).trim(), `${missed.length - 1} of ${missed.length} right`);
      assert.equal(await page.locator('[data-role="perfect-round-reward"]').count(), 0, `${where}: one miss means no reward`);
      await checkLayout(page, `${where} closing with a miss`);
      assert.deepEqual(errors, [], `${where}: no page errors`);
      await context.close();
    }
  } finally {
    await browser.close();
    child?.kill('SIGTERM');
  }
});

// Answers every question of the round on screen right, through the page's own game store and the same calls the
// phone's taps make (the vote, its reveal, the step on), and returns how many it answered. Fast enough to check every
// topic at every size and pace. It needs the dev server, which serves the app's modules by path, the same way
// audio-retry.test.mjs reaches the store.
function answerRoundRightInPage(page) {
  return page.evaluate(async () => {
    const [{ useGameStore }, game, kinds] = await Promise.all([import('/src/store/game-store.ts'), import('/src/solo/solo-game.ts'), import('/src/engine/kinds.ts')]);
    let answered = 0;
    for (let guard = 0; guard < 40 && useGameStore.getState().phase !== 'closing'; guard += 1) {
      const state = useGameStore.getState();
      const view = game.projectSolo(state);
      const token = view.questionProjection?.encodeChoice(kinds.rightToken(state.run[state.slideIndex]));
      if (!token || !game.recordSoloVote(view, token, 'certain')) throw new Error(`question ${state.slideIndex + 1} could not be answered`);
      game.revealSoloAnswer();
      const step = game.soloStep(useGameStore.getState(), game.projectSolo(useGameStore.getState()));
      if (!step) throw new Error(`question ${state.slideIndex + 1} did not lead on`);
      game.takeSoloStep(step);
      answered += 1;
    }
    return answered;
  });
}

// How the recap sits in the phone's scrolling content: whether it scrolls, how far its last card sits above the
// footer (the page keeps 16px of its own padding there), and whether anything runs off sideways.
async function recapFit(page) {
  await page.evaluate(() => document.fonts.ready.then(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))));
  return page.evaluate(() => {
    const content = document.querySelector('[data-role="phone-content"]');
    const closing = content.querySelector('[data-role="phone-closing"]');
    const lowest = Math.max(...[...closing.children].map((child) => child.getBoundingClientRect().bottom));
    return {
      scroll: content.scrollHeight - content.clientHeight,
      clearance: Math.round((content.getBoundingClientRect().bottom - lowest) * 10) / 10,
      sideways: document.scrollingElement.scrollWidth > document.scrollingElement.clientWidth,
    };
  });
}

const FIT_SIZES = [{ width: 360, height: 780 }, { width: 390, height: 844 }, { width: 430, height: 932 }];
// Every pace, and Best twice: once as it plays, and once on a device that cannot save a best, where its card carries
// its longest line ("... but this device can't save a best to beat next time.").
const FIT_PASSES = [
  { pace: 'today', label: 'today' },
  { pace: 'run', label: 'run' },
  { pace: 'climb', label: 'climb' },
  { pace: 'best', label: 'best' },
  { pace: 'best', label: 'best, no storage', blockBest: true },
];
const needsDevServer = BASE_URL ? 'drives the page\'s own store, which only the dev server serves by path' : false;
// What the old band added to a recap at 360x780, before the reward moved into the stat list: a 106px band and the
// 16px gap under it.
const OLD_BAND = 106;
const OLD_BAND_EXTRA = OLD_BAND + 16;

test('the perfect-round recap never scrolls, on any topic or round, at 360x780, 390x844 and 430x932, on every pace', { skip: needsDevServer }, async () => {
  const topics = SOLO_TOPICS.map((topic) => topic.id);
  assert.equal(topics.length, 10, 'the sweep covers the ten solo topics');
  const { child, origin } = await startVite();
  const browser = wrapBrowserAgainstViteAutoReload(await chromium.launch({ headless: true }));
  const rows = [];
  const oldBandScrolled = [];
  try {
    for (const viewport of FIT_SIZES) {
      const size = `${viewport.width}x${viewport.height}`;
      for (const pass of FIT_PASSES) {
        const context = await browser.newContext({ viewport, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
        await context.addInitScript(watchConnections);
        if (pass.blockBest) {
          await context.addInitScript(() => {
            const native = Storage.prototype.setItem;
            Storage.prototype.setItem = function refuseBest(key, value) {
              if (String(key).startsWith('vof-solo-best:')) throw new DOMException('storage is off', 'SecurityError');
              return native.call(this, key, value);
            };
          });
        }
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', (error) => errors.push(String(error)));
        page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
        await page.goto(`${origin}/play?soloPace=${pass.pace}`, { waitUntil: 'load' });
        for (const topic of topics) {
          await page.locator('[data-role="solo-topics"]').waitFor();
          await page.locator(`[data-topic="${topic}"]`).click();
          // Every round of the topic, until it wraps: each round's close carries its own takeaways and its own count.
          for (let round = 1; round <= 5; round += 1) {
            const where = `${size} ${pass.label} ${topic} round ${round}`;
            await page.locator('[data-role="phone-vote-container"]').waitFor();
            const answered = await answerRoundRightInPage(page);
            await page.locator('[data-role="perfect-round-reward"]').waitFor();
            const fit = await recapFit(page);
            rows.push({ size, pass: pass.label, topic, round, ...fit });
            // The scroll check alone would pass a recap sitting flush on the footer, because the content's own bottom
            // padding is not part of its scroll height. The clearance check is what keeps that padding clear.
            assert.equal(fit.scroll, 0, `${where}: the recap does not scroll, saw ${fit.scroll}px more than fits`);
            assert.ok(fit.clearance >= 16, `${where}: the last card sits ${fit.clearance}px above the footer, clear of the page's own 16px padding`);
            assert.equal(fit.sideways, false, `${where}: nothing runs off sideways`);
            assert.equal((await page.locator('.perfect-round-reward__kicker').textContent()).trim(), `${answered} for ${answered}`, `${where}: the reward counts the ${answered} questions played`);
            if (pass.blockBest) {
              assert.match(await page.locator('[data-role="solo-pace-recap-best"]').innerText(), /can't save a best/, `${where}: the Best card says it could not save`);
            }
            await checkReward(page, where);
            await checkLayout(page, `${where} perfect closing`);
            if (size === '360x780' && pass.pace === 'today') {
              // Control: put the old band's footprint back, 106px and its gap pushed in above the stat list, which is
              // what scrolled. The page's scroll then has to agree with this sweep's own clearance to the pixel: it
              // scrolls by exactly what the band takes past the room there was, and not at all where there was room.
              const oldBand = await page.addStyleTag({ content: `[data-role="phone-closing"] > [data-role="phone-closing-personal"] { margin-top: ${OLD_BAND_EXTRA}px !important; }` });
              const old = await recapFit(page);
              const expected = Math.max(0, OLD_BAND_EXTRA - fit.clearance);
              assert.ok(Math.abs(old.scroll - expected) <= 1, `${where}: with the old band back the recap scrolls ${old.scroll}px, and the clearance predicts ${expected.toFixed(1)}px`);
              if (old.scroll > 0) oldBandScrolled.push(`${topic} round ${round} by ${old.scroll}px`);
              await oldBand.evaluate((node) => node.remove());
              assert.deepEqual(await recapFit(page), fit, `${where}: the control came off cleanly`);
            }
            const again = page.locator('[data-action="solo-play-again"]');
            if ((await again.innerText()).trim() === 'Play again') break;
            await soloTap(again);
          }
          // More topics is debounced (300ms), and a round played through the store can close inside that window, so
          // soloTap spaces it from the last tap the way a person's own taps would be.
          await soloTap(page.locator('[data-action="solo-topics"]'));
        }
        assert.deepEqual(await page.evaluate(() => [...window.__soloOpened]), [], `${size} ${pass.label}: no WebSocket or BroadcastChannel`);
        assert.deepEqual(errors, [], `${size} ${pass.label}: no page errors`);
        await context.close();
      }
    }
  } finally {
    await browser.close();
    child.kill('SIGTERM');
  }
  // Every topic was played to its end on every pass at every size: a round always deals the whole topic in one go
  // now (VOF-68), in every pace, so every topic measures exactly one round -- a loop that stopped before its first
  // round's own close, or that kept going past it, cannot pass.
  for (const pass of FIT_PASSES) {
    for (const topic of SOLO_TOPICS) {
      for (const viewport of FIT_SIZES) {
        const size = `${viewport.width}x${viewport.height}`;
        const measured = rows.filter((row) => row.size === size && row.pass === pass.label && row.topic === topic.id).length;
        assert.equal(measured, 1, `${size} ${pass.label} ${topic.id}: ${measured} rounds measured, a whole-topic round is always exactly one`);
      }
    }
  }
  assert.ok(oldBandScrolled.length > 0, 'control: with the old 106px band, the same sweep sees the recap scroll');
  // The table: today's close, the tallest of the recaps, topic by size, as the least room in px left between the
  // last card and the footer on any of the topic's rounds. The other passes' lowest figure at each size follows.
  const sizes = FIT_SIZES.map((viewport) => `${viewport.width}x${viewport.height}`);
  const least = (filter) => Math.min(...rows.filter(filter).map((row) => row.clearance));
  const rounds = (topic) => rows.filter((row) => row.size === sizes[0] && row.pass === 'today' && row.topic === topic).length;
  console.log(`recap fit: ${rows.length} perfect recaps measured, none scrolls. Least room in px between the last card and the footer, on any round (the page's own padding is 16):`);
  console.log(`${'topic'.padEnd(20)}${'rounds'.padStart(7)}${sizes.map((size) => size.padStart(10)).join('')}`);
  for (const topic of topics) {
    console.log(`${topic.padEnd(20)}${String(rounds(topic)).padStart(7)}${sizes.map((size) => String(least((row) => row.pass === 'today' && row.topic === topic && row.size === size)).padStart(10)).join('')}`);
  }
  for (const pass of FIT_PASSES.slice(1)) {
    console.log(`${`${pass.label}, lowest`.padEnd(27)}${sizes.map((size) => String(least((row) => row.pass === pass.label && row.size === size)).padStart(10)).join('')}`);
  }
  console.log(`control, the old 106px band at 360x780 scrolled on ${oldBandScrolled.length} of ${rows.filter((row) => row.size === sizes[0] && row.pass === 'today').length} rounds: ${oldBandScrolled.join(', ')}`);
});

// Solo rounds play the whole topic in one go (VOF-68): the reward's count comes from the round the close actually
// drew, never a pace's round size, and What to say's own whole rotation is the longest one shipped -- nineteen, not
// a manufactured twenty. This is the whole-topic change's own proof that the reward counts what was really dealt.
test('the reward counts the real round: What to say\'s own nineteen-question round says 19 for 19', { skip: needsDevServer }, async () => {
  const { child, origin } = await startVite();
  const browser = wrapBrowserAgainstViteAutoReload(await chromium.launch({ headless: true }));
  try {
    const whatToSay = SOLO_TOPICS.find((topic) => topic.id === 'what-to-say');
    const wholeRotation = (await loadSoloPool(whatToSay)).rotation.length;
    for (const viewport of FIT_SIZES) {
      const where = `${viewport.width}x${viewport.height} what to say`;
      const context = await browser.newContext({ viewport, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (error) => errors.push(String(error)));
      page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
      await page.goto(`${origin}/play`, { waitUntil: 'load' });
      await page.locator('[data-topic="what-to-say"]').click();
      await page.locator('[data-role="phone-vote-container"]').waitFor();
      const count = await readCount(page);
      assert.equal(count && `${count.number} of ${count.total}`, `1 of ${wholeRotation}`, `${where}: the header counts the whole rotation`);
      assert.equal(await answerRoundRightInPage(page), wholeRotation, `${where}: every question in the rotation was answered`);
      await page.locator('[data-role="perfect-round-reward"]').waitFor();
      assert.equal((await page.locator('[data-role="phone-closing-room-line"]').innerText()).trim(), `${wholeRotation} of ${wholeRotation} right`, `${where}: the close scores the whole round`);
      assert.equal(await page.locator('[data-role="solo-closing-strip"] [data-outcome="right"]').count(), wholeRotation, `${where}: the strip draws the whole round`);
      assert.equal((await page.locator('.perfect-round-reward__kicker').textContent()).trim(), `${wholeRotation} for ${wholeRotation}`, `${where}: the reward counts the whole round, never a pace's own figure`);
      await checkReward(page, where);
      const fit = await recapFit(page);
      assert.equal(fit.scroll, 0, `${where}: the recap does not scroll, saw ${fit.scroll}px more than fits`);
      assert.equal(fit.sideways, false, `${where}: nothing runs off sideways`);
      assert.deepEqual(errors, [], `${where}: no page errors`);
      await context.close();
    }
  } finally {
    await browser.close();
    child.kill('SIGTERM');
  }
});

// The wordmark's layout boxes, to the hundredth of a pixel, plus the page's own scroll size.
function wordmarkBoxes(page) {
  return page.evaluate(() => {
    const at = (selector) => {
      const rect = document.querySelector(selector).getBoundingClientRect();
      return [rect.x, rect.y, rect.width, rect.height].map((value) => Math.round(value * 100) / 100);
    };
    return {
      hero: at('.entry-hero-art'), mark: at('.show-wordmark'), vax: at('.show-wordmark__vax'), or: at('.show-wordmark__or'),
      fiction: at('.show-wordmark__fiction'), syringe: at('.show-wordmark__syringe'), card: at('.entry-card'),
      scroll: [document.scrollingElement.scrollWidth, document.scrollingElement.scrollHeight],
    };
  });
}

test('the landing syringe wears a band-aid after five quick taps, sheds it with one more, and never moves the wordmark', async () => {
  const { child, origin } = BASE_URL ? { child: null, origin: BASE_URL } : await startVite();
  const browser = wrapBrowserAgainstViteAutoReload(await chromium.launch({ headless: true }));
  await fs.mkdir(EVIDENCE, { recursive: true });
  // The phone opens an old options link (?taste=bandaid-teal): the style switch is gone, so it still gets the gold
  // band-aid, the owner's pick.
  const sizes = [
    { name: '1440x900', viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false },
    { name: '390x844', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, oldLink: 'taste=bandaid-teal' },
  ];
  try {
    for (const size of sizes) {
      // The wordmark with nothing of the egg's: its stylesheet request is refused, so neither its rules nor its tap
      // target (which waits for them) ever arrive. Every reading with the egg on must match this one.
      const bare = await browser.newContext({ viewport: size.viewport, isMobile: size.isMobile, hasTouch: size.hasTouch, reducedMotion: 'reduce' });
      const barePage = await bare.newPage();
      let refused = 0;
      await barePage.route((url) => url.pathname.includes('band-aid-egg'), (route) => { refused += 1; return route.abort(); });
      const refusedRequest = barePage.waitForEvent('requestfailed', { predicate: (request) => request.url().includes('band-aid-egg'), timeout: 15_000 });
      await barePage.goto(`${origin}/`, { waitUntil: 'load' });
      await refusedRequest;
      await barePage.evaluate(() => document.fonts.ready.then(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))));
      assert.ok(refused > 0, `${size.name}: the egg's stylesheet was asked for, and refused`);
      assert.equal(await barePage.locator('[data-role="band-aid-egg-target"]').count(), 0, `${size.name}: without its styles the egg never renders a target`);
      // Reduced motion removes the jab outright. While it still ran (for a hundredth of a millisecond) a
      // reading could land on its first frame, two degrees off rest, and the two pages' boxes would differ.
      assert.equal(await barePage.locator('.entry-hero-art .show-wordmark__syringe').evaluate((node) => getComputedStyle(node).animationName), 'none', `${size.name}: reduced motion leaves the landing syringe no animation at all`);
      const eggless = await wordmarkBoxes(barePage);
      await bare.close();

      const where = size.name;
      const context = await browser.newContext({ viewport: size.viewport, isMobile: size.isMobile, hasTouch: size.hasTouch, reducedMotion: 'reduce' });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (error) => errors.push(String(error)));
      page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
      await page.goto(`${origin}/${size.oldLink ? `?${size.oldLink}` : ''}`, { waitUntil: 'load' });
      const target = page.locator('[data-role="band-aid-egg-target"]');
      await target.waitFor();
      await page.evaluate(() => document.fonts.ready.then(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))));
      const tap = () => (size.hasTouch ? target.tap() : target.click());
      const bandAid = page.locator('.show-wordmark__syringe [data-role="syringe-band-aid"]');
      const mark = page.locator('[data-show-wordmark]');

      // The target: a fingertip or larger, no text selection, no zoom, and the plain cursor of a decoration.
      const feel = await target.evaluate((node) => {
        const rect = node.getBoundingClientRect();
        const style = getComputedStyle(node);
        return { width: rect.width, height: rect.height, touchAction: style.touchAction, userSelect: style.userSelect, cursor: style.cursor, hidden: node.getAttribute('aria-hidden'), markSelect: getComputedStyle(node.closest('[data-show-wordmark]')).userSelect };
      });
      assert.ok(feel.width >= 44 && feel.height >= 44, `${where}: the tap target is at least 44px each way, saw ${Math.round(feel.width)}x${Math.round(feel.height)}`);
      assert.deepEqual([feel.touchAction, feel.userSelect, feel.cursor, feel.hidden, feel.markSelect], ['manipulation', 'none', 'default', 'true', 'none'], `${where}: the target neither selects nor zooms`);

      const before = await wordmarkBoxes(page);
      assert.deepEqual(before, eggless, `${where}: the egg's styles and tap target move nothing in the wordmark`);
      for (let count = 0; count < 4; count += 1) await tap();
      assert.equal(await bandAid.count(), 0, `${where}: four taps do nothing`);
      await page.waitForTimeout(TAP_GAP_MS + 400);
      await tap();
      assert.equal(await bandAid.count(), 0, `${where}: a slow fifth tap does nothing`);
      // That slow tap started a new run: four more quick ones make five.
      for (let count = 0; count < 4; count += 1) await tap();
      await bandAid.waitFor();
      assert.equal(await mark.getAttribute('data-band-aid-egg'), 'on');
      assert.equal(await bandAid.locator('.syringe-band-aid__check').count(), 6, `${where}: the gold band-aid, with its check print`);
      assert.equal(await bandAid.locator('.syringe-band-aid__slap').evaluate((node) => getComputedStyle(node).animationName), 'none', `${where}: under reduced motion it is simply placed`);
      const after = await wordmarkBoxes(page);
      assert.deepEqual(after, before, `${where}: the wordmark's boxes do not move by a pixel with the band-aid on`);
      await page.screenshot({ path: path.join(EVIDENCE, `band-aid-${size.name}.png`) });

      // Control: a one pixel shift in the wordmark is a failure this comparison does see. Two frames let the
      // injected rule land before measuring, the same as the real measurements above.
      const settle = () => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const nudge = await page.addStyleTag({ content: '.entry-hero-art .show-wordmark__vax { margin-inline-start: 1px !important; }' });
      await settle();
      assert.notDeepEqual(await wordmarkBoxes(page), before, `${where}: the box comparison sees a 1px shift`);
      await nudge.evaluate((node) => node.remove());
      await settle();
      assert.deepEqual(await wordmarkBoxes(page), before, `${where}: and the wordmark is back where it was`);

      // A tap on the band-aid peels it off, once it has had a moment to stick.
      await page.waitForTimeout(SETTLE_MS + 100);
      await tap();
      await bandAid.waitFor({ state: 'detached' });
      assert.equal(await mark.getAttribute('data-band-aid-egg'), 'off', `${where}: a tap on the band-aid removes it`);
      assert.deepEqual(await wordmarkBoxes(page), before, `${where}: and the wordmark still has not moved`);
      assert.deepEqual(errors, [], `${where}: no page errors`);
      await context.close();
    }

    // With motion allowed, it slaps on and peels away rather than blinking in and out.
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'no-preference' });
    const page = await context.newPage();
    await page.goto(`${origin}/`, { waitUntil: 'load' });
    const target = page.locator('[data-role="band-aid-egg-target"]');
    await target.waitFor();
    for (let count = 0; count < 5; count += 1) await target.tap();
    const bandAid = page.locator('[data-role="syringe-band-aid"]');
    await bandAid.waitFor();
    assert.equal(await bandAid.locator('.syringe-band-aid__slap').evaluate((node) => getComputedStyle(node).animationName), 'band-aid-slap', 'the band-aid slaps on with a squash and settle');
    // The peel lasts a fraction of a second, so the page itself records the band-aid it mounts for it, rather than
    // a read racing the timer that takes it away.
    await page.evaluate(() => {
      const seen = [];
      Object.defineProperty(window, '__bandAidSeen', { value: seen });
      new MutationObserver((records) => {
        for (const record of records) {
          for (const node of record.addedNodes) {
            if (node.getAttribute?.('data-role') !== 'syringe-band-aid') continue;
            seen.push({ phase: node.getAttribute('data-phase'), animation: getComputedStyle(node.querySelector('.syringe-band-aid__slap')).animationName });
          }
        }
      }).observe(document.querySelector('.show-wordmark__syringe'), { childList: true });
    });
    await page.waitForTimeout(SETTLE_MS + 100);
    await target.tap();
    await bandAid.waitFor({ state: 'detached', timeout: 3000 });
    assert.deepEqual(await page.evaluate(() => window.__bandAidSeen), [{ phase: 'peeling', animation: 'band-aid-peel' }], 'a tap peels it off, with the peel');

    // The other screens that draw the wordmark never carry the egg: the solo header's mark has none.
    await page.goto(`${origin}/play`, { waitUntil: 'load' });
    await page.locator('[data-topic="flu"]').click();
    await page.locator('[data-role="phone-vote-container"]').waitFor();
    assert.ok(await page.locator('[data-show-wordmark]').count() > 0, 'the solo screen draws the wordmark');
    assert.equal(await page.locator('[data-show-wordmark][data-band-aid-egg], [data-role="band-aid-egg-target"]').count(), 0, 'and carries no egg');
    await context.close();
  } finally {
    await browser.close();
    child?.kill('SIGTERM');
  }
});

test('plain /play defaults to Run at desktop and both canonical phones', async () => {
  const { child, origin } = BASE_URL ? { child: null, origin: BASE_URL } : await startVite();
  const browser = wrapBrowserAgainstViteAutoReload(await chromium.launch({ headless: true }));
  await fs.mkdir(EVIDENCE, { recursive: true });
  try {
    for (const size of CANONICAL) {
      const context = await browser.newContext({ ...size, reducedMotion: 'reduce' });
      try {
        await context.addInitScript(watchConnections);
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', (error) => errors.push(String(error)));
        await page.goto(`${origin}/play`, { waitUntil: 'load' });
        await page.locator('[data-topic="tetanus"]').click();
        await page.locator('[data-role="solo-pace-hud"][data-pace="run"]').waitFor();
        await checkLayout(page, `default Run ${size.name}`);
        assert.deepEqual(await page.evaluate(() => window.__soloOpened), [], 'solo opens no room connection');
        assert.deepEqual(errors, [], 'default Run has no page errors');
        await page.screenshot({ path: path.join(EVIDENCE, `default-run-${size.name}.png`) });
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
    child?.kill('SIGTERM');
  }
});
