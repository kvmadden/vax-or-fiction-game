// VOF-86 audio trace. Builds the app for production (dev double-mounts under StrictMode, so dev is not what a host
// runs), serves the build with the local room relay, and drives the real host UI end to end on the room and Teams
// venues, plus solo, each in a fresh browser context so no storage carries over between runs.
// tests/integration/audio-trace/probe.js records every media element, gain and the true output level on each frame.
// Each run writes its raw trace and one timeline per transition to work/audio-trace/<run>/, and the owner's music
// rulings are checked against what the room would hear (tests/integration/audio-trace/analyze.mjs). Exits 1 when a
// ruling is broken, so the first run on the old engine is the RED evidence for each fix.
//
//   npm run test:audio-trace
//   VOF_TRACE_RUNS=room,teams npm run test:audio-trace      only these runs. The seven are room, teams, solo-default,
//                                                           solo-sound, room-slow, lyrics and lyrics-muted. solo-run, solo-climb
//                                                           and solo-best are the other solo paces, named here only
//   VOF_TRACE_SKIP_BUILD=1 npm run test:audio-trace         reuse the build in work/audio-trace/dist
//   VOF_TRACE_OUT=work/audio-trace-red npm run test:audio-trace   write the traces somewhere else
//   VOF_TRACE_REANALYZE=1 npm run test:audio-trace          judge the saved traces again, no build or browser
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { analyzeRun, dbText, tally } from './audio-trace/analyze.mjs';
import { serveBuild } from './audio-trace/serve.mjs';
import { answerKey as soloAnswerKey } from './solo-answer-key.mjs';
import { vaxOrFictionDeck } from '../../src/data/decks/vax-or-fiction.ts';
import { questionKind, rightToken } from '../../src/engine/kinds.ts';
import { CURATED8_QUESTION_IDS } from '../../src/store/game-store.ts';
import { WALKIN_LINE_STARTS } from '../../src/data/walkin-lyrics.ts';

const PORT = Number(process.env.VOF_TRACE_PORT || 5391);
const OUT = path.resolve(process.env.VOF_TRACE_OUT || 'work/audio-trace');
const DIST = path.resolve('work/audio-trace/dist');
const PROBE = path.resolve('tests/integration/audio-trace/probe.js');
const ALL_RUNS = ['room', 'teams', 'solo-default', 'solo-sound', 'room-slow', 'lyrics', 'lyrics-muted'];
/** The other solo paces (the default, today, is solo-sound). Named in VOF_TRACE_RUNS only, so a full run stays the seven above. */
const SOLO_PACE_RUNS = { 'solo-run': 'run', 'solo-climb': 'climb', 'solo-best': 'best' };
const RUNS = (process.env.VOF_TRACE_RUNS || ALL_RUNS.join(',')).split(',').map((run) => run.trim()).filter(Boolean);
for (const run of RUNS) if (!ALL_RUNS.includes(run) && !Object.hasOwn(SOLO_PACE_RUNS, run)) throw new Error(`unknown run ${run}, known: ${[...ALL_RUNS, ...Object.keys(SOLO_PACE_RUNS)].join(', ')}`);

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
/** Windows in which a run must make no music at all. */
const SILENT_WINDOWS = {
  teams: [{ label: 'Teams before the host unmutes', from: null, to: 'unmute with M' }],
  'solo-sound': [{ label: 'the topic list after a close', from: 'back to topics', graceMs: 1_500 }],
  'solo-run': [{ label: 'the topic list after a close', from: 'back to topics', graceMs: 1_500 }],
  'solo-climb': [{ label: 'the topic list after a close', from: 'back to topics', graceMs: 1_500 }],
  'solo-best': [{ label: 'the topic list after a close', from: 'back to topics', graceMs: 1_500 }],
};
/** The ruled checks. On a full run each must be judged (pass or fail) somewhere, or the trace proves nothing. */
const RULED_CHECKS = ['revealFade', 'stingDuck', 'stingOverStart', 'noDuck', 'swaps', 'closingLoops', 'closingGap', 'silentWindow', 'silent', 'soloWarm', 'lyricSync', 'lyricAnchor', 'lyricRestsWhenSilent'];
const mark = (page, label) => page.evaluate((text) => window.__vofTraceMark?.(text), label).catch(() => {});

function build() {
  if (process.env.VOF_TRACE_SKIP_BUILD === '1' && existsSync(path.join(DIST, 'index.html'))) return;
  const result = spawnSync('npx', ['vite', 'build', '--outDir', DIST, '--emptyOutDir'], {
    env: { ...process.env, VITE_WS_URL: `http://127.0.0.1:${PORT}`, VITE_PRODUCTION_RELAY: 'false' },
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    process.stderr.write(`${result.stdout}\n${result.stderr}\n`);
    throw new Error('the production build for the trace failed');
  }
}

const roomKey = new Map(vaxOrFictionDeck.questions.map((question) => [question.id, { kind: questionKind(question), right: rightToken(question) }]));

async function newContext(browser, { viewport, storage = {} } = {}) {
  const context = await browser.newContext({ viewport: viewport ?? { width: 1440, height: 900 } });
  await context.addInitScript({ path: PROBE });
  if (Object.keys(storage).length) {
    await context.addInitScript((entries) => {
      for (const [key, value] of Object.entries(entries)) { try { localStorage.setItem(key, value); } catch { /* storage may be blocked */ } }
    }, storage);
  }
  return context;
}

function watchErrors(page, errors, label) {
  page.on('pageerror', (error) => errors.push(`${label}: ${error.message}`));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(`${label} console: ${message.text()}`); });
}

// A presenter's clicker sends the right arrow: lock, reveal, then on, the same beat as Space. The 400 ms gap stays
// outside the keyboard's own key-repeat debounce.
async function advance(host, label) {
  await pause(400);
  await mark(host, label);
  await host.keyboard.press('ArrowRight');
}

async function joinPhones(browser, url, room, errors) {
  const phones = [];
  for (const [index, name] of ['Trace North', 'Trace South'].entries()) {
    const context = await browser.newContext({ viewport: { width: 430, height: 932 } });
    const phone = await context.newPage();
    phone.setDefaultTimeout(20_000);
    watchErrors(phone, errors, `phone ${index}`);
    await phone.goto(`${url}/?vote=1&room=${room}`, { waitUntil: 'domcontentloaded' });
    await phone.locator('[data-role="phone-connection-status"]').filter({ hasText: 'connected' }).waitFor();
    await phone.locator('[data-role="nickname-input"]').fill(name);
    await phone.locator('[data-role="join-submit-btn"]').click();
    await phone.locator('[data-role="phone-waiting"]').waitFor();
    phones.push({ phone, context });
  }
  return phones;
}

async function voteRight(phone, id) {
  const vote = phone.locator(`[data-role="phone-vote-container"][data-question-id="${id}"]`);
  await vote.waitFor();
  if (await vote.locator('[data-action="show-answer-options"]').count()) await vote.locator('[data-action="show-answer-options"]').click();
  const entry = roomKey.get(id);
  if (!entry) throw new Error(`${id} is not in the show deck key`);
  await vote.locator(`[data-choice="${entry.right}"]`).filter({ visible: true }).first().click();
  await vote.locator('[data-role="vote-confirmation-badge"][data-state="in"]').waitFor();
}

async function tapReaction(phone, which) {
  const buttons = phone.locator('[data-role="phone-reactions"] button[data-reaction]').filter({ visible: true });
  await buttons.first().waitFor({ timeout: 8_000 });
  const target = which === 'last' ? buttons.last() : buttons.first();
  const reaction = await target.getAttribute('data-reaction');
  await target.click();
  return reaction;
}

async function questionPhase(host) {
  return host.evaluate(() => document.querySelector('.question-shell')?.getAttribute('data-phase') ?? null);
}

/**
 * The whole hosted show, the way a presenter runs it: lobby, title, instructions, then each question (open, votes,
 * lock, reveal, explanation), standings when the deck puts them in, and the closing. `fullClockAt` lets that one
 * question run out its own clock so the timer ticks play, every other question locks a few seconds in.
 */
async function hostShow(host, phones, { fullClockAt, reactions, lockAfterMs, questionCount, closingHoldMs, notes }) {
  await mark(host, 'lobby hold');
  await pause(6_000);
  await advance(host, 'to title');
  await host.locator('[data-screen="title"]').waitFor();
  await pause(3_500);
  await advance(host, 'to instructions');
  await host.locator('[data-screen="instructions"]').waitFor();
  await pause(3_500);
  const ids = CURATED8_QUESTION_IDS.slice(0, questionCount);
  for (const [index, id] of ids.entries()) {
    await advance(host, `open ${id}`);
    await pause(250);
    if (await host.locator('[data-screen="leaderboard"]').count()) {
      notes.push(`standings before ${id}`);
      await mark(host, 'standings hold');
      await pause(3_500);
      await advance(host, `open ${id} after standings`);
      await host.locator('[data-screen="leaderboard"]').waitFor({ state: 'detached' });
    }
    await host.locator(`.question-shell[data-question-id="${id}"], [data-question-id="${id}"]`).first().waitFor();
    // The question opens on an `entering` beat, then voting opens. Nothing is timed until it does.
    await host.waitForFunction(() => document.querySelector('.question-shell')?.getAttribute('data-phase') === 'deliberating');
    await Promise.all(phones.map(({ phone }) => voteRight(phone, id)));
    if (index === fullClockAt) {
      await mark(host, `run out the clock on ${id}`);
      const started = Date.now();
      const clock = await host.locator('[data-role="status-rail-timer"]').first().innerText().catch(() => 'no clock on the rail');
      while (Date.now() - started < 50_000) {
        if ((await questionPhase(host)) !== 'deliberating') break;
        await pause(250);
      }
      notes.push(`${id} showed ${JSON.stringify(clock.trim())} and left voting after ${((Date.now() - started) / 1000).toFixed(1)} s, phase ${await questionPhase(host)}`);
      await pause(2_500);
    } else {
      await pause(lockAfterMs);
      if ((await questionPhase(host)) === 'deliberating') {
        await advance(host, `lock ${id}`);
        await host.waitForFunction(() => document.querySelector('.question-shell')?.getAttribute('data-phase') !== 'deliberating');
      }
      await pause(2_500);
    }
    await advance(host, `reveal ${id}`);
    await host.locator(`[data-stage-beat="result"][data-question-id="${id}"]`).waitFor();
    await pause(3_500);
    await advance(host, `explain ${id}`);
    await host.locator(`[data-stage-beat="explanation"][data-question-id="${id}"]`).waitFor();
    const reaction = reactions.find((entry) => entry.at === index);
    if (reaction) {
      await pause(1_800);
      const sent = await tapReaction(phones[reaction.phone].phone, reaction.which).catch((error) => `none (${error.message.split('\n')[0]})`);
      await mark(host, `reaction ${sent} on ${id}`);
      notes.push(`reaction ${sent} during the explanation of ${id}`);
      await pause(2_800);
    } else {
      await pause(4_000);
    }
  }
  if (questionCount < CURATED8_QUESTION_IDS.length) {
    // A short run (the slow-network one) ends on its last explanation. Advancing would open the next question.
    await mark(host, 'short run ends');
    await pause(closingHoldMs);
    return;
  }
  await advance(host, 'to closing');
  await pause(300);
  if (await host.locator('[data-screen="leaderboard"]').count()) {
    notes.push('standings before the closing');
    await pause(3_500);
    await advance(host, 'to closing after standings');
  }
  await host.locator('[data-screen="closing"]').waitFor();
  await mark(host, 'closing hold');
  await pause(closingHoldMs);
}

async function runHosted(browser, url, venue, { slowMedia = false } = {}) {
  const errors = [];
  const notes = [];
  const room = `TRACE${venue.toUpperCase()}${Date.now().toString(36).toUpperCase()}`.replace(/[^A-Z0-9]/g, '').slice(0, 24);
  const context = await newContext(browser);
  if (slowMedia) {
    // A slow venue network: every audio fetch waits 1.5 s (routing also turns off the HTTP cache).
    await context.route('**/*.mp3', async (route) => { await pause(1_500); await route.continue(); });
  }
  const host = await context.newPage();
  host.setDefaultTimeout(25_000);
  watchErrors(host, errors, 'host');
  await host.goto(`${url}/?room=${room}&host=1&preset=curated8&venue=${venue}`, { waitUntil: 'domcontentloaded' });
  await host.getByRole('heading', { name: /Your game is ready/ }).waitFor();
  if (await host.locator('[data-role="presenter-pairing"]').isVisible()) await host.keyboard.press('Escape');
  await mark(host, 'setup hold');
  await pause(2_500);
  await mark(host, 'open the lobby');
  await host.getByRole('button', { name: 'Open the lobby', exact: true }).click();
  await host.locator('[data-screen="lobby"]').waitFor();
  const phones = await joinPhones(browser, url, room, errors);
  if (venue === 'teams') {
    // Teams starts muted (VOF-25). The host turns sound on with M before sharing, as on game day.
    await pause(1_000);
    await mark(host, 'unmute with M');
    await host.keyboard.press('m');
  }
  try {
    await hostShow(host, phones, slowMedia
      ? { fullClockAt: -1, reactions: [], lockAfterMs: 1_200, questionCount: 3, closingHoldMs: 4_000, notes }
      : { fullClockAt: 0, reactions: [{ at: 1, phone: 0, which: 'first' }, { at: 3, phone: 1, which: 'last' }, { at: 5, phone: 0, which: 'last' }], lockAfterMs: 3_000, questionCount: CURATED8_QUESTION_IDS.length, closingHoldMs: 42_000, notes });
  } catch (error) {
    const dir = path.join(OUT, `failed-${venue}${slowMedia ? '-slow' : ''}`);
    await fs.mkdir(dir, { recursive: true });
    await host.screenshot({ path: path.join(dir, 'host.png') }).catch(() => {});
    for (const [index, { phone }] of phones.entries()) await phone.screenshot({ path: path.join(dir, `phone-${index}.png`) }).catch(() => {});
    const partial = await host.evaluate(() => window.__vofTrace).catch(() => null);
    if (partial) await fs.writeFile(path.join(dir, 'trace.json'), JSON.stringify(partial));
    const tail = (partial?.events ?? []).filter((event) => event.type === 'ui' || event.type === 'mark').slice(-12);
    error.message += `\nlast ui and marks: ${JSON.stringify(tail)}\nnotes: ${notes.join('. ')}\nscreenshots in ${dir}`;
    throw error;
  }
  const trace = await host.evaluate(() => ({ ...window.__vofTrace, buildSha: document.documentElement.getAttribute('data-build-sha') }));
  for (const { context: phoneContext } of phones) await phoneContext.close();
  await context.close();
  return { trace, errors, notes };
}

/**
 * The walk-in and its lyric scroll. The room lobby holds a full 60 s pass of the walk-in and its wrap, then the title
 * beat, which keeps the same song. The muted Teams lobby shows what the scroll does when the room hears nothing.
 */
async function runLyrics(browser, url, { muted }) {
  const errors = [];
  const notes = [];
  const venue = muted ? 'teams' : 'room';
  const room = `LYRICS${venue.toUpperCase()}${Date.now().toString(36).toUpperCase()}`.replace(/[^A-Z0-9]/g, '').slice(0, 24);
  const context = await newContext(browser);
  const host = await context.newPage();
  host.setDefaultTimeout(25_000);
  watchErrors(host, errors, 'host');
  await host.goto(`${url}/?room=${room}&host=1&preset=curated8&venue=${venue}`, { waitUntil: 'domcontentloaded' });
  await host.getByRole('heading', { name: /Your game is ready/ }).waitFor();
  if (await host.locator('[data-role="presenter-pairing"]').isVisible()) await host.keyboard.press('Escape');
  await pause(1_500);
  await mark(host, 'open the lobby');
  await host.getByRole('button', { name: 'Open the lobby', exact: true }).click();
  await host.locator('[data-screen="lobby"]').waitFor();
  await mark(host, 'lobby hold');
  await pause(muted ? 20_000 : 64_000);
  if (!muted) {
    await advance(host, 'to title');
    await host.locator('[data-screen="title"]').waitFor();
    await pause(6_000);
  }
  notes.push(muted ? 'Teams lobby, left muted, 20 s' : 'room lobby 64 s, then the title beat 6 s');
  const trace = await host.evaluate(() => ({ ...window.__vofTrace, buildSha: document.documentElement.getAttribute('data-build-sha') }));
  await context.close();
  return { trace, errors, notes };
}

async function runSolo(browser, url, { sound, pace = null }) {
  const errors = [];
  const notes = [];
  const context = await newContext(browser, { viewport: { width: 430, height: 932 }, storage: sound ? { vrc_audio_muted: 'false' } : {} });
  const page = await context.newPage();
  page.setDefaultTimeout(20_000);
  watchErrors(page, errors, 'solo');
  const key = await soloAnswerKey();
  let lastTap = 0;
  const tap = async (locator) => {
    const wait = 350 - (Date.now() - lastTap);
    if (wait > 0) await pause(wait);
    await locator.click();
    lastTap = Date.now();
  };
  await page.goto(`${url}/play${pace ? `?soloPace=${pace}` : ''}`, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-role="solo-topics"]').waitFor();
  await mark(page, 'topics');
  await pause(1_500);
  await tap(page.locator('[data-topic="flu"]'));
  for (let number = 1; number <= 25; number += 1) {
    const vote = page.locator('[data-role="phone-vote-container"]');
    await vote.waitFor();
    const id = await vote.getAttribute('data-question-id');
    const entry = key.get(id);
    if (!entry) throw new Error(`solo ${id} is not in the answer key`);
    await pause(1_200);
    if (entry.kind === 'order') {
      for (let slot = 0; slot < entry.steps.length; slot += 1) {
        for (let guard = 0; guard < entry.steps.length; guard += 1) {
          const labels = (await page.locator('.phone-order-step__label').allInnerTexts()).map((text) => text.trim());
          const at = labels.indexOf(entry.steps[slot].trim());
          if (at <= slot) break;
          await page.locator('.phone-order-step').nth(at).locator('[data-role="order-move-up"]').click();
        }
      }
      await mark(page, `answer ${id}`);
      await tap(page.locator('[data-action="submit-order"]').filter({ visible: true }).first());
    } else {
      await mark(page, `answer ${id}`);
      await tap(vote.locator(`[data-choice="${entry.right}"]`).filter({ visible: true }).first());
    }
    await page.locator('[data-role="phone-reveal"][data-screen="combined"]').waitFor();
    await pause(3_000);
    const next = page.locator('[data-action="solo-next"]');
    const step = await next.getAttribute('data-step');
    await mark(page, `next from ${id}`);
    await tap(next);
    if (step === 'score') { notes.push(`${number} questions`); break; }
    if (!sound && number >= 3) { notes.push('three questions, then out'); break; }
  }
  await mark(page, 'closing hold');
  await pause(sound ? 36_000 : 3_000);
  if (sound) {
    // Leaving the close for the topics must end the looping closing bed (the topic list plays no bed).
    await mark(page, 'back to topics');
    await tap(page.locator('[data-action="solo-topics"]'));
    await page.locator('[data-role="solo-topics"]').waitFor();
    await pause(4_000);
  }
  const trace = await page.evaluate(() => ({ ...window.__vofTrace, buildSha: document.documentElement.getAttribute('data-build-sha') }));
  await context.close();
  return { trace, errors, notes };
}

function fmtAmp(value) {
  return value > 0 ? dbText(value).replace(' dB', '') : '-';
}

function timelineMarkdown(run, result, analysis) {
  const lines = [`# Audio trace: ${run}`, '', `Frames ${result.trace.frames.length}, events ${result.trace.events.length}. Levels are element volume times path gain, in dB relative to full scale (- is silent).`, ''];
  if (result.notes.length) lines.push(`Notes: ${result.notes.join('. ')}.`, '');
  lines.push('## Transitions', '');
  for (const row of analysis.transitions) {
    lines.push(`### ${(row.t / 1000).toFixed(2)} s  ${row.from ?? 'start'}  to  ${row.to}`, '');
    if (!row.beds.length) { lines.push('No bed sounding within 3 s.', ''); continue; }
    lines.push(`| ms | ${row.beds.join(' | ')} | output dB |`, `|---|${row.beds.map(() => '---').join('|')}|---|`);
    for (const sample of row.samples) lines.push(`| ${sample.offset} | ${sample.cells.map(fmtAmp).join(' | ')} | ${sample.outputDb ?? ''} |`);
    lines.push('');
  }
  lines.push('## Checks', '');
  for (const [name, results] of Object.entries(analysis.checks)) {
    const count = tally(results);
    lines.push(`### ${name}: ${count.pass} pass, ${count.fail} fail, ${count.skip} skip`, '');
    for (const entry of results) {
      const at = entry.t === undefined ? '' : `${(entry.t / 1000).toFixed(2)} s `;
      const what = [entry.cue, entry.cluster && entry.cluster.length > 1 ? `(with ${entry.cluster.slice(1).join(', ')})` : '', entry.from ? `${entry.from} to ${entry.to}` : '', entry.bed ? `over ${entry.bed}` : ''].filter(Boolean).join(' ');
      const detail = entry.verdict === 'skip' ? entry.why : entry.failures?.join('. ') || [entry.ratio !== undefined ? `dip ${dbText(entry.ratio)}` : '', entry.fadeMs != null ? `fade ${entry.fadeMs.toFixed(0)} ms` : '', entry.startLagMs != null ? `sounded +${entry.startLagMs.toFixed(0)} ms, floor ${dbText(entry.minSumRatio)}${entry.releaseHeld != null ? `, old bed at ${entry.releaseHeld.toFixed(2)} when it sounded` : ''}` : ''].filter(Boolean).join(', ');
      lines.push(`- ${entry.verdict.toUpperCase()} ${at}${what}: ${detail}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

const summaryFile = path.join(OUT, 'summary.json');
const summary = existsSync(summaryFile) ? JSON.parse(await fs.readFile(summaryFile, 'utf8')) : {};
let broken = 0;
/** Runs judged in this invocation. A summary.json left from an earlier run never counts toward coverage. */
const recorded = new Set();

async function record(run, result, seconds) {
  recorded.add(run);
  const analysis = analyzeRun(result.trace, { expectSilent: run === 'solo-default', silentWindows: SILENT_WINDOWS[run] ?? [], soloWarm: run === 'solo-sound' || Object.hasOwn(SOLO_PACE_RUNS, run), lyricCues: WALKIN_LINE_STARTS });
  const dir = path.join(OUT, run);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'trace.json'), JSON.stringify(result.trace));
  await fs.writeFile(path.join(dir, 'timeline.md'), timelineMarkdown(run, result, analysis));
  const counts = Object.fromEntries(Object.entries(analysis.checks).map(([name, results]) => [name, tally(results)]));
  const failures = Object.entries(analysis.checks).flatMap(([name, results]) => results.filter((entry) => entry.verdict === 'fail').map((entry) => `${name} ${entry.t === undefined ? '' : `${(entry.t / 1000).toFixed(2)} s `}${entry.cue ?? (entry.from ? `${entry.from} to ${entry.to}` : '')}: ${entry.failures.join('. ')}`));
  // VOF_TRACE_ASSUME_SHA names the build of a trace saved before traces carried their own sha.
  const buildSha = result.trace.buildSha ?? summary[run]?.buildSha ?? process.env.VOF_TRACE_ASSUME_SHA ?? null;
  const windows = (analysis.checks.silentWindow ?? []).map(({ label, verdict }) => ({ label, verdict }));
  summary[run] = { seconds, buildSha, frames: result.trace.frames.length, cues: analysis.timeline.cues.length, bedStarts: analysis.timeline.bedPlays.length, counts, windows, failures, errors: result.errors, notes: result.notes };
  broken += failures.length + result.errors.length;
  console.log(`\n== ${run}: ${summary[run].frames} frames, ${summary[run].cues} cues, ${summary[run].bedStarts} bed starts, ${seconds} s, build ${buildSha ?? 'unknown'}`);
  for (const [name, count] of Object.entries(counts)) console.log(`   ${name.padEnd(14)} ${count.pass} pass  ${count.fail} fail  ${count.skip} skip`);
  for (const line of failures) console.log(`   FAIL ${line}`);
  for (const line of result.errors) console.log(`   PAGE ERROR ${line}`);
}

if (process.env.VOF_TRACE_REANALYZE === '1') {
  // Judge saved traces again (after an analyzer change) without a build or a browser.
  for (const run of RUNS) {
    const file = path.join(OUT, run, 'trace.json');
    if (!existsSync(file)) continue;
    const trace = JSON.parse(await fs.readFile(file, 'utf8'));
    await record(run, { trace, errors: summary[run]?.errors ?? [], notes: summary[run]?.notes ?? [] }, summary[run]?.seconds ?? null);
  }
} else {
  build();
  const served = await serveBuild(DIST, { port: PORT });
  const browser = await chromium.launch({ headless: true });
  try {
    for (const run of RUNS) {
      const started = Date.now();
      const result = run === 'room' ? await runHosted(browser, served.url, 'room')
        : run === 'teams' ? await runHosted(browser, served.url, 'teams')
          : run === 'room-slow' ? await runHosted(browser, served.url, 'room', { slowMedia: true })
            : run === 'lyrics' || run === 'lyrics-muted' ? await runLyrics(browser, served.url, { muted: run === 'lyrics-muted' })
              : await runSolo(browser, served.url, Object.hasOwn(SOLO_PACE_RUNS, run) ? { sound: true, pace: SOLO_PACE_RUNS[run] } : { sound: run === 'solo-sound' });
      await record(run, result, Math.round((Date.now() - started) / 1000));
    }
  } finally {
    await browser.close();
    await served.close();
  }
}
await fs.writeFile(summaryFile, JSON.stringify(summary, null, 2));
console.log(`\ntraces and timelines in ${path.relative(process.cwd(), OUT)}/<run>/, summary in summary.json`);
// Coverage: an all-skipped check, or a run set that judged nothing, proves nothing, so neither counts as a pass.
const judgedRuns = RUNS.filter((run) => recorded.has(run));
if (!judgedRuns.length) {
  console.log('no run was judged (nothing saved to re-analyze, or every run failed to start)');
  process.exit(1);
}
const missingRuns = RUNS.filter((run) => !recorded.has(run));
if (missingRuns.length) {
  console.log(`asked to judge ${missingRuns.join(', ')}, but no trace was judged for them`);
  broken += missingRuns.length;
}
// Each silence window must be judged on its own, since one run's window passing says nothing about another's.
for (const run of judgedRuns) {
  for (const window of SILENT_WINDOWS[run] ?? []) {
    const verdict = summary[run].windows?.find((entry) => entry.label === window.label)?.verdict;
    if (verdict !== 'pass' && verdict !== 'fail') {
      console.log(`${run}: the silence window "${window.label}" was not judged`);
      broken += 1;
    }
  }
}
const judgedPerCheck = Object.fromEntries(RULED_CHECKS.map((name) => [name, judgedRuns.reduce((total, run) => total + (summary[run].counts[name] ? summary[run].counts[name].pass + summary[run].counts[name].fail : 0), 0)]));
console.log(`coverage over ${judgedRuns.length} run(s): ${Object.entries(judgedPerCheck).map(([name, count]) => `${name} ${count}`).join(', ')}`);
const unjudged = Object.entries(judgedPerCheck).filter(([, count]) => count === 0).map(([name]) => name);
if (ALL_RUNS.every((run) => RUNS.includes(run)) && unjudged.length) {
  console.log(`not judged anywhere on a full run: ${unjudged.join(', ')}`);
  broken += unjudged.length;
} else if (unjudged.length) {
  console.log(`not judged in this subset: ${unjudged.join(', ')} (a full run must judge every ruled check)`);
}
if (broken) {
  console.log(`${broken} ruling breaks or page errors`);
  process.exit(1);
}
console.log('every VOF-86 check passed on every run');
