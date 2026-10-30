import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import test from 'node:test';
import { testHarnessNeverOrphansViteOnMissingBrowser, testInProcessViteBoundsAHungStartup } from './render-harness.mjs';

// TB-1. Every suite `npm run check` runs that spins up a real Vite dev server and a real browser
// used to prove that with just one narrow trick: give withViteAndBrowser a deliberately bogus
// executablePath and confirm ITS OWN finally kills Vite (testHarnessNeverOrphansViteOnMissingBrowser,
// called once below). That proved the shared helper's internals are correct, but it is blind to any
// suite that never calls the helper at all, in-process Vite suites included, and it never actually
// invokes a suite the way `check` does. presenter-remote.test.mjs hand-rolled its own startVite and
// called chromium.launch() before its try, so a missing browser there orphaned Vite AND kept
// `node --test` itself alive (the child's still-open stdout/stderr pipes reference the parent's
// event loop), and nothing here would have caught it until check itself hung.
//
// This is the real per-suite check instead: for every suite `check` runs that touches a browser, run
// its own npm script exactly as check does, with PLAYWRIGHT_BROWSERS_PATH pointed at a directory
// with nothing in it, and prove the whole invocation exits within a bound and leaves no process of
// its own running behind. That is suite-implementation-agnostic: it catches a suite that hand-rolls
// spawn(), one that uses withViteAndBrowser, and one that starts Vite in-process (createServer)
// alike, so it replaces the old pattern of registering the helper-only guard separately in each of
// 9 suites (see git history: render-harness.mjs still exports that helper-level proof, called once
// here instead of copy-pasted, and the suites no longer import it).
//
// NO-HANG-VACUOUS (round 7). node:test sets NODE_TEST_CONTEXT in its own child process's env when
// it runs this file as part of `node --test`. runSuiteWithNoBrowser below used to spawn each
// suite with `...process.env`, so that value rode along into the grandchild. The grandchild's own
// `node --test` (or the in-process node:test callers, test:keyboard and test:facilitator-focus)
// then saw NODE_TEST_CONTEXT already set, concluded it was itself already running inside a
// test-runner child, printed "run() is being called recursively within a test file. skipping
// running files." to stderr, and exited 0 in under a second without running a single test,
// starting Vite, or touching a browser. The two checks that existed here (timedOut, survivors)
// both passed trivially on that skip, so this file could not tell "ran cleanly with no browser"
// from "silently skipped everything," which means a genuine hang planted in a suite would have
// been just as invisible: a local evidence file spawns a suite that hangs on a real
// pending timer (not the idle unsettled-top-level-await case node:test flags on its own) through
// both envs. With NODE_TEST_CONTEXT leaked it reports a clean 49ms pass. Stripped, the same hang
// correctly times out. runSuiteWithNoBrowser now strips it, and the per-suite test below asserts
// real evidence the suite ran (a reported test count or a browser-launch error) and a nonzero
// exit, not just a fast clean return.

testHarnessNeverOrphansViteOnMissingBrowser();
// TW-5's harness-level proof (a hung Vite config bounded instead of hanging check) lives beside
// TB-1's (a missing browser bounded instead of orphaning Vite): both are "prove render-harness.mjs's
// own shared helpers are correct" checks, ahead of the real per-suite sweep below.
testInProcessViteBoundsAHungStartup();

const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const checkScript = packageJson.scripts.check;

// Every rendered suite `npm run check` runs: one that starts a real Vite dev server and launches a
// real Playwright browser somewhere in its run, whether through render-harness.mjs's
// withViteAndBrowser, a hand-rolled spawn()+chromium.launch(), or Vite's in-process createServer API.
// Derived by grepping every file check's script list touches for chromium.launch, withViteAndBrowser
// and Vite's createServer import. test:security and the plain-mock half of test:relay
// (room-relay.test.mjs) never touch a browser and are not listed. The drift guard below fails loudly
// if any name here stops being part of `check`, instead of silently narrowing coverage.
const RENDERED_SUITES_IN_CHECK = [
  'test:relay', // room-relay.test.mjs (no browser) + mounted-room.test.mjs (chromium.launch, own try/finally, and withViteAndBrowser for the JOIN-RACE tests)
  'test:keyboard', // keyboard-single-owner.test.mjs (in-process createServer + chromium.launch)
  'test:phone-voting-single-owner', // phone-voting-single-owner.test.mjs (withViteAndBrowser)
  'test:remote', // presenter-remote.test.mjs (withViteAndBrowser, this batch)
  'test:phone-fit', // phone-short-viewport.test.mjs (withViteAndBrowser)
  'test:ds-contrast', // ds-contrast.test.mjs (withViteAndBrowser)
  'test:phone-layout', // phone-layout-fixes.test.mjs (startVite + own chromium.launch, multi-browser)
  'test:phone-360', // phone-360-overflow.test.mjs (startVite + own chromium.launch, premium-phone-fix pass)
  'test:facilitator-focus', // facilitator-focus.test.mjs (in-process createServer + chromium.launch)
  'test:evidence-dialog-close', // evidence-dialog-close-fade.test.mjs (withViteAndBrowser)
  'test:stat-slot-layout', // stat-slot-layout.test.mjs (withViteAndBrowser)
  'test:showdown-meter-fill', // showdown-meter-fill.test.mjs (withViteAndBrowser)
  'test:status-rail-timer-size', // status-rail-timer-size.test.mjs (withViteAndBrowser)
  'test:presenter-pairing-escape', // presenter-pairing-escape.test.mjs (withViteAndBrowser)
  'test:mute-policy-round-trip', // mute-policy-round-trip.test.mjs (withViteAndBrowser)
  'test:hud-compact', // hud-compact.test.mjs (withViteAndBrowser)
  'test:host-format', // host-format-fit.test.mjs (withViteAndBrowser, moved off installed Chrome.app 2026-09-26)
  'test:landing-music', // landing-music.test.mjs (withViteAndBrowser, VOF-W9)
  'test:site-header-overflow', // site-header-overflow.test.mjs (VOF-45 fix pass; hand-rolled startVite + own chromium.launch)
  'test:site-touch-targets', // site-touch-targets.test.mjs (VOF-45 fix pass; hand-rolled startVite + own chromium.launch)
  'test:no-text-cursor', // no-text-cursor.test.mjs (no-text-cursor.md; startVite + own chromium.launch, registers testHarnessNeverOrphansViteOnMissingBrowser)
  'test:title-layout', // title-layout.test.mjs (withViteAndBrowser, the Teams title beat, 2026-09-29)
  'test:preshow-layout', // preshow-layout.test.mjs (withViteAndBrowser, the pre-show pass, VOF-88)
  'test:flavor', // flavor-rollout.test.mjs (withViteAndBrowser, Game night on every screen, VOF-89)
  'test:looks', // looks-options.test.mjs (withViteAndBrowser, the show looks as host options, VOF-93)
  'test:looks-contrast', // looks-contrast.test.mjs (withViteAndBrowser, every look reads at AA on every kind in the decks, VOF-93)
  'test:topic-patterns', // topic-patterns.test.mjs (withViteAndBrowser, the soft topic patterns behind the questions, VOF-94)
];

// NO-HANG-VACUOUS (round 7). The list above only ever proved itself in one direction: every name
// on it is still part of `check`. Nothing proved the reverse, so a NEW rendered suite added to
// `check` without ever being added above would silently narrow this file's coverage and nothing
// would fail. This second list names every OTHER step `check` runs, whether it is an `npm run
// <script>` step or one of the two trailing `node --import tsx <path>` steps (see stepsInCheck
// below, which parses both forms), so between the two lists every step is accounted for, and an
// unclassified addition (in neither list) fails loudly instead of passing quietly.
const NON_RENDERED_SUITES_IN_CHECK = [
  'test', // tests/unit/*.test.ts and *.test.mjs: unit tests, no Vite or browser
  'lint', // oxlint: static analysis, no Vite or browser
  'test:security', // tests/security_robustness/*.ts: no Vite or browser
  'test:missing-browser', // this file: spawns the suites above, never launches a browser itself
  'test:relay-client', // production-relay-client.test.ts: an in-process http.createServer fixture, no Vite or browser
  'test:archive-rpc-client', // game-archive-rpc-client.test.ts: an in-process http.createServer fixture, no Vite or browser
  'build', // tsc -b && vite build: compiles, does not launch a browser
  // check's last two steps run via `node --import tsx <path>` instead of an `npm run <script>`
  // wrapper, so they need their own path-keyed entries here rather than a script name. Neither
  // imports chromium, withViteAndBrowser or Vite's createServer (grepped, see above).
  'tests/integration/remote-cue-isolation.test.mjs', // reads the built manifest, no Vite or browser
  'tests/integration/site-pages-lazy-chunk.test.mjs', // reads the built manifest, no Vite or browser
  'tests/integration/static-404-routing.test.mjs', // its own in-process http.createServer fixture, no Vite or browser
  'tests/integration/manifest-gated.test.mjs', // reads the built manifest, no Vite or browser
  'tests/integration/no-admin-email-in-bundle.test.mjs', // reads dist/assets/*.js, no Vite or browser
];

test('the rendered-suite list actually matches npm run check, so this coverage cannot silently narrow', () => {
  assert.ok(RENDERED_SUITES_IN_CHECK.length >= 13, 'expected coverage of at least the 13 known rendered suites');
  for (const script of RENDERED_SUITES_IN_CHECK) {
    assert.ok(checkScript.includes(`npm run ${script}`), `${script} must still be part of the check script (package.json scripts.check)`);
    assert.ok(packageJson.scripts[script], `${script} must still exist as an npm script`);
  }
});

test('every step in check is classified as rendered or not, so a new one cannot silently narrow coverage', () => {
  const stepsInCheck = [
    ...[...checkScript.matchAll(/npm run ([\w:-]+)/g)].map((m) => m[1]),
    ...[...checkScript.matchAll(/node --import tsx ([\w./-]+)/g)].map((m) => m[1]),
  ];
  assert.ok(stepsInCheck.length >= 22, `expected to find at least 22 steps in check, found ${stepsInCheck.length}`);
  const rendered = new Set(RENDERED_SUITES_IN_CHECK);
  const nonRendered = new Set(NON_RENDERED_SUITES_IN_CHECK);
  const overlap = RENDERED_SUITES_IN_CHECK.filter((script) => nonRendered.has(script));
  assert.deepEqual(overlap, [], 'a script cannot be both rendered and non-rendered');
  const unclassified = stepsInCheck.filter((script) => !rendered.has(script) && !nonRendered.has(script));
  assert.deepEqual(unclassified, [],
    'every "npm run <script>" step check runs must be added to RENDERED_SUITES_IN_CHECK (if it ever touches a browser or Vite) or NON_RENDERED_SUITES_IN_CHECK (if it never does), so a new suite cannot silently narrow this file\'s coverage');
});

function processGroupAlive(pgid) {
  try {
    return execFileSync('ps', ['-axo', 'pid,ppid,pgid,stat,command'], { encoding: 'utf8' })
      .split('\n')
      .filter((line) => {
        const fields = line.trim().split(/\s+/);
        return fields[2] === String(pgid) && !/^Z/.test(fields[3] ?? '');
      });
  } catch {
    return [];
  }
}

/**
 * Runs `npm run <script>` exactly as `check` does, with no usable browser anywhere, in its own
 * process group. Resolves with whether it exited on its own within `boundMs` and whatever remained
 * in its process group two seconds after it stopped (killed by the bound or not).
 */
async function runSuiteWithNoBrowser(script, boundMs) {
  // NO-HANG-VACUOUS: strip NODE_TEST_CONTEXT before it reaches the grandchild. See the header
  // comment above testHarnessNeverOrphansViteOnMissingBrowser() for why: left in place, every
  // suite spawned here sees itself as "already inside a test-runner child" and skips running
  // entirely, so this file was checking that a skip exits cleanly, not that a suite runs cleanly.
  const { NODE_TEST_CONTEXT: _inheritedTestContext, ...envWithoutTestContext } = process.env;
  const child = spawn('npm', ['run', script], {
    env: { ...envWithoutTestContext, PLAYWRIGHT_BROWSERS_PATH: '/nonexistent-pw-browsers-missing-browser-check' },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  });
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk; });
  child.stderr.on('data', (chunk) => { output += chunk; });
  const t0 = Date.now();
  let timedOut = false;
  const exit = await new Promise((resolve) => {
    const timer = setTimeout(() => {
      timedOut = true;
      try { process.kill(-child.pid, 'SIGKILL'); } catch { /* already gone */ }
    }, boundMs);
    child.once('exit', (code, signal) => { clearTimeout(timer); resolve({ code, signal }); });
  });
  const elapsedMs = Date.now() - t0;
  // Give async teardown (Playwright's own browser.close/process cleanup, Vite's watcher shutdown)
  // a moment to finish before checking for survivors, matching the shared helper's own regression
  // test's grace window.
  await new Promise((resolve) => setTimeout(resolve, 2_000));
  const survivors = processGroupAlive(child.pid);
  // Best-effort: never leave anything of this run behind, timed out or not.
  try { process.kill(-child.pid, 'SIGKILL'); } catch { /* already gone */ }
  return { timedOut, elapsedMs, exit, survivors, output };
}

const BOUND_MS = 45_000;

for (const script of RENDERED_SUITES_IN_CHECK) {
  test(`${script} exits within ${BOUND_MS}ms and leaves no process behind when no browser is installed`, { timeout: BOUND_MS + 20_000 }, async () => {
    const result = await runSuiteWithNoBrowser(script, BOUND_MS);
    assert.equal(result.timedOut, false,
      `${script} did not exit within ${BOUND_MS}ms with no usable browser (still hangs check); tail:\n${result.output.slice(-2000)}`);
    assert.deepEqual(result.survivors, [],
      `${script} left process(es) running after it stopped: ${JSON.stringify(result.survivors)}`);
    // NO-HANG-VACUOUS: a fast, process-clean exit is exactly what node:test's own recursion-skip
    // produces too (see runSuiteWithNoBrowser's header comment), so the two checks above alone
    // prove nothing. Require real evidence the suite actually ran.
    const skippedRecursion = /run\(\) is being called recursively within a test file/.test(result.output);
    assert.equal(skippedRecursion, false,
      `${script} was skipped by node:test's own recursion guard instead of actually running ` +
      `(NODE_TEST_CONTEXT leaked into the child?); output:\n${result.output.slice(-2000)}`);
    const reportedTestCounts = [...result.output.matchAll(/ℹ tests (\d+)/g)].map((m) => Number(m[1]));
    const ranReportedTests = reportedTestCounts.some((count) => count > 0);
    // test:keyboard and test:facilitator-focus run via `node <file>`, not `node --test <file>`, so
    // they never print the --test CLI's own "ℹ tests N" summary trailer even when they genuinely
    // ran. A browser-launch error in their output is that case's real-execution evidence instead.
    const browserLaunchErrorSeen = /Executable doesn't exist|browserType\.launch/.test(result.output);
    assert.ok(ranReportedTests || browserLaunchErrorSeen,
      `${script} produced no evidence it actually ran (no reported test count, no browser-launch error); ` +
      `output:\n${result.output.slice(-2000)}`);
    // Every suite on this list touches a browser somewhere in its run, so with no usable browser
    // anywhere it must fail, not exit 0. A suite that silently "passes" here is either not really
    // exercising its browser path or has itself regressed to swallowing the failure.
    assert.notEqual(result.exit.code, 0,
      `${script} exited 0 with no usable browser; a suite that really launches a browser must ` +
      `fail here, not pass. output tail:\n${result.output.slice(-2000)}`);
  });
}
