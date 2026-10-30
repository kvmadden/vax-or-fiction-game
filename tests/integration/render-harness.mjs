import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { appendFileSync, mkdirSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import test from 'node:test';
import { chromium } from 'playwright';

// TB1 (round 3) / TB-1 (round 5). Every suite that spins up its own Vite dev server as a CHILD
// PROCESS shares withViteAndBrowser/startVite below instead of hand-rolling startVite/browser-launch.
// Before TB1, three copies of startVite gave up after 20s without killing Vite, two suites launched
// the browser outside their try (so a browser that fails to launch leaves Vite running with nothing
// to stop it), and one suite's `after` hook called `browser.close()` on an undefined browser when
// `before` never reached the assignment, throwing before it could reach `child.kill`. With the
// browser missing, `npm run check` never exited. Every path here kills Vite and reports the failure
// promptly instead.
//
// Two suites (keyboard-single-owner.test.mjs, facilitator-focus.test.mjs) start Vite a third way:
// IN-PROCESS, via Vite's own createServer() JS API, sharing one instance across every test in the
// file instead of restarting per test. They do not use withViteAndBrowser (there is no child
// process for it to manage), and instead race that startup against a bound with startInProcessVite
// below (TW-5): a hung config or plugin used to hang the whole file, and so `check`, with no output.
//
// So the true, single guarantee that NO suite `check` runs can hang or orphan a process on a
// missing browser, regardless of which of these patterns it uses, is
// tests/integration/missing-browser-check.test.mjs: it runs every rendered suite's own npm script
// exactly as `check` does, with no usable browser, strips NODE_TEST_CONTEXT first (round 7,
// NO-HANG-VACUOUS: left in place, node:test's own recursion guard skipped every spawned suite
// without running it, so a bound and a clean process tree held trivially on a suite that never
// ran at all), and asserts a bound, a clean process tree, AND real evidence the suite actually
// ran. That test also calls testHarnessNeverOrphansViteOnMissingBrowser() once, in one place, to prove
// this file's own finally-block wiring is correct. It used to be registered separately in 9 suites,
// which proved the same thing 9 times over while staying blind to any suite that never called this
// helper at all (exactly the gap presenter-remote.test.mjs's hand-rolled startVite fell into).
//
// Folds NIT-10 for every caller of this file: withViteAndBrowser and startVite never accept an
// executablePath by default, so every suite listed in missing-browser-check.test.mjs's
// RENDERED_SUITES_IN_CHECK launches Playwright's own bundled headless Chromium, never the
// installed Google Chrome.app, which auto-updates out from under a pinned test (as
// presenter-remote.test.mjs already did before this fix). closing-scored.test.mjs (test:closing),
// audio-retry.test.mjs and host-format-fit.test.mjs (test:host-format) were moved onto this file's
// startVite/withViteAndBrowser the same way on 2026-09-26, even though only test:host-format is
// part of `check`. This is a claim about this file's callers, not the whole repo: several
// standalone scripts that never adopted this harness (app-flow.mjs, stage-layout.mjs,
// library-layout.mjs, full-bank-visual.mjs, show-evidence-details.test.mjs,
// editorial-review-safety.test.mjs, solo-play.test.mjs)
// were simply out of scope for that pass. No suite in this repo pins the installed Chrome.app
// anymore, so that is no longer a reason any of them are excluded.

async function openPort() {
  const probe = net.createServer();
  await new Promise((resolve) => probe.listen(0, '127.0.0.1', resolve));
  const port = probe.address().port;
  await new Promise((resolve) => probe.close(resolve));
  return port;
}

/**
 * FLAKE (phone-short-viewport.test.mjs). Every rendered suite's own
 * throwaway Vite dev server is never edited mid-run, so nothing here ever needs a real Vite HMR
 * reload. Vite's own client (node_modules/vite/dist/client/client.mjs) still calls
 * window.location.reload() unconditionally whenever its HMR WebSocket, having been open once,
 * later reconnects, on the assumption that a reconnect means the dev server restarted. Killing and
 * restarting the dev server mid-test reproduces the failure seen in busy `npm run check` runs
 * ("Execution context was destroyed, most likely because of a navigation") on demand, because the
 * reload destroys whatever Playwright evaluate() call is in flight. What dropped the socket in those
 * real runs was never caught by an instrumented run. A dependency re-optimization that sends Vite's
 * full-reload message would destroy the context the same way. The stub below closes both paths,
 * because none of the real client's code runs at all.
 *
 * Three narrower fixes were tried and rejected, in order:
 * 1. server.hmr: false alone still lets the socket open and reconnect (measured: still reproduced
 *    the destroyed context under the same forcing).
 * 2. server.ws: false stops Vite's own client from ever completing its handshake, but the upgrade
 *    request it leaves permanently unanswered was measured to also break the app's own unrelated
 *    room-relay WebSocket (the join flow hung on "Joining…" forever, both in the full suite and in
 *    an isolated one-page repro).
 * 3. Overriding window.location.reload from an init script silently does nothing: Location's
 *    methods are unforgeable in Chromium (measured directly: the assignment neither throws nor
 *    takes effect, `location.reload` still reports as native code afterward).
 *
 * What actually works, with no server-side or app-side change at all: intercept the one request for
 * `/@vite/client` itself and serve an inert stub in its place. Every other transformed module's
 * auto-injected `import { createHotContext } from "/@vite/client"` (and, for classic workers,
 * `injectQuery`) still resolves, so nothing errors, but the real client's top-level code (the one
 * that opens the HMR WebSocket and reloads on reconnect) never runs at all. This app's own source
 * never calls `import.meta.hot.*` (only src/components/ErrorBoundary.tsx calls
 * window.location.reload(), and only from a fallback UI's Reload button that no test here clicks),
 * so nothing here loses real functionality. Playwright's own page.reload() (used deliberately by
 * this file's own W4 "reloading onto an already-acknowledged vote" test) is a separate,
 * DevTools-Protocol-driven navigation and is untouched by this.
 */
const INERT_VITE_CLIENT_STUB = `
import '/@vite/env';
const noop = () => {};
export function createHotContext() {
  return { accept: noop, acceptExports: noop, dispose: noop, decline: noop, invalidate: noop, on: noop, off: noop, send: noop, prune: noop, data: {} };
}
export function injectQuery(url) { return url; }
// updateStyle/removeStyle: every CSS import gets one of these calls in dev mode (a plain
// <style data-vite-dev-id> insert), adapted from node_modules/vite/dist/client/client.mjs's own
// updateStyle/removeStyle so CSS still renders normally with no hot reload involved at all. Three
// things the real client does are left out here, and none of them are exercised by this app:
// the lastInsertedStyle ordering that keeps concurrently updated style tags in a deterministic
// order relative to each other (this stub always appends at the end of head, which only matters
// across repeated HMR updates to the same page, never exercised here since nothing here reloads
// styles mid-test), cspNonce (only needed when the page serves a Content-Security-Policy nonce
// meta tag, which this dev harness never sets), and linkSheetsMap (tracks CSS imported as an
// external link stylesheet rather than an inlined style tag, a path this app's CSS imports never
// take). Vite 8's real client also opens with an import of @vite/env, which applies define
// values (see node_modules/vite/dist/client/env.mjs). This stub imports that same /@vite/env
// module too, probed directly: it loads cleanly and opens no WebSocket of its own, so app code
// that reads a defined global still sees it, with none of the reload-on-reconnect behavior this
// whole stub exists to remove.
const sheetsMap = new Map();
export function updateStyle(id, content) {
  let style = sheetsMap.get(id);
  if (!style) {
    style = document.createElement('style');
    style.setAttribute('type', 'text/css');
    style.setAttribute('data-vite-dev-id', id);
    style.textContent = content;
    document.head.appendChild(style);
  } else style.textContent = content;
  sheetsMap.set(id, style);
}
export function removeStyle(id) {
  const style = sheetsMap.get(id);
  if (style) { document.head.removeChild(style); sheetsMap.delete(id); }
}
`;

export async function neutralizeViteAutoReload(contextOrPage) {
  await contextOrPage.route('**/@vite/client*', (route) => route.fulfill({
    contentType: 'application/javascript',
    body: INERT_VITE_CLIENT_STUB,
  }));
}

// FLAKE-EVIDENCE. tests/integration/phone-short-viewport.test.mjs has failed twice under heavy
// machine load with "Execution context was destroyed, most likely because of a navigation", after
// the Vite-auto-reload stub above already closed the one known cause. No run has ever captured
// what actually navigated the page, so every wrapped browser now keeps its own in-memory log of
// what happened to each of its pages, and prints that log to stderr only when a test using it
// fails. A passing run never touches stderr for this.
const pendingPageEventLogs = [];
let exitListenerRegistered = false;
const recordedPages = new WeakSet();

function createPageEventLog() {
  return { startedAt: process.hrtime.bigint(), events: [], printed: false };
}

function elapsedMs(log) {
  return Number(process.hrtime.bigint() - log.startedAt) / 1e6;
}

function safeUrl(page) {
  try { return page.url(); } catch { return '<unknown>'; }
}

function formatPageEvent(event) {
  const t = `${event.t.toFixed(1)}ms`;
  switch (event.type) {
    case 'framenavigated':
      return `[page-events] ${t} framenavigated -> ${event.url}`;
    case 'pageerror':
      return `[page-events] ${t} pageerror on ${event.url}: ${event.message}`;
    case 'crash':
      return `[page-events] ${t} crash on ${event.url}`;
    case 'close':
      return `[page-events] ${t} close on ${event.url}`;
    case 'requestfailed':
      return `[page-events] ${t} requestfailed (${event.resourceType}) ${event.requestUrl} on ${event.pageUrl}: ${event.failure ?? 'unknown reason'}`;
    default:
      if (event.type.startsWith('console:')) return `[page-events] ${t} ${event.type} on ${event.url}: ${event.text}`;
      return `[page-events] ${t} ${event.type}`;
  }
}

function printPageEventLog(log) {
  if (log.printed) return;
  log.printed = true;
  if (log.events.length === 0) return;
  const lines = log.events.map(formatPageEvent).join('\n');
  process.stderr.write(`\n[page-events] ${log.events.length} page event(s) recorded before this failure:\n${lines}\n`);
  // Reruns overwrite gate logs, and twice the only evidence of a flake was lost that way. So every
  // printed log is also appended to work/page-events.log, which the repo ignores and nothing
  // truncates. Best effort only, because evidence must never turn a test result into a crash.
  try {
    mkdirSync(path.resolve('work'), { recursive: true });
    const suite = process.argv[1] ? path.basename(process.argv[1]) : 'unknown suite';
    appendFileSync(path.resolve('work/page-events.log'), `\n[${new Date().toISOString()}] ${suite}\n${lines}\n`);
  } catch {
    // Nothing to do. The stderr copy above still carries the evidence.
  }
}

function ensureExitPrinter() {
  if (exitListenerRegistered) return;
  exitListenerRegistered = true;
  // Suites that only call wrapBrowserAgainstViteAutoReload directly (the in-process-Vite suites,
  // which never route their tests through withViteAndBrowser) have no single call site to catch a
  // thrown error. node:test sets a non-zero process.exitCode when any of its tests failed, so this
  // is the one place left to print for them. withViteAndBrowser already prints and marks each log
  // `printed` on its own failure, so this loop is a no-op for logs it already handled.
  process.on('exit', () => {
    if (!process.exitCode) return;
    for (const log of pendingPageEventLogs) printPageEventLog(log);
  });
}

function recordPageEvents(page, log) {
  if (recordedPages.has(page)) return;
  recordedPages.add(page);
  let sawFirstNavigation = false;
  page.on('framenavigated', (frame) => {
    if (frame !== page.mainFrame()) return;
    // The first framenavigated a page ever fires is its own initial page.goto(), which every
    // suite already expects. Only navigations after that one are the suspicious kind this log
    // exists to name (an HMR full reload, a redirect, anything else nobody asked for).
    if (!sawFirstNavigation) { sawFirstNavigation = true; return; }
    log.events.push({ t: elapsedMs(log), type: 'framenavigated', url: frame.url() });
  });
  page.on('pageerror', (error) => {
    log.events.push({ t: elapsedMs(log), type: 'pageerror', message: error.message, url: safeUrl(page) });
  });
  page.on('crash', () => {
    log.events.push({ t: elapsedMs(log), type: 'crash', url: safeUrl(page) });
  });
  page.on('close', () => {
    log.events.push({ t: elapsedMs(log), type: 'close', url: safeUrl(page) });
  });
  page.on('console', (message) => {
    const kind = message.type();
    if (kind !== 'error' && kind !== 'warning') return;
    log.events.push({ t: elapsedMs(log), type: `console:${kind}`, text: message.text(), url: safeUrl(page) });
  });
  page.on('requestfailed', (request) => {
    const resourceType = request.resourceType();
    if (resourceType !== 'document' && resourceType !== 'script') return;
    log.events.push({
      t: elapsedMs(log), type: 'requestfailed', resourceType, requestUrl: request.url(),
      failure: request.failure()?.errorText, pageUrl: safeUrl(page),
    });
  });
}

const PAGE_EVENT_LOG = Symbol('pageEventLog');

/**
 * Patches `browser.newContext` in place so every context it creates from here on (including the
 * ones `browser.newPage()` creates internally under the hood) gets neutralizeViteAutoReload for
 * free, with no change needed at each individual page/context creation site. Safe to call more
 * than once on the same browser (each call re-wraps the current newContext, so nothing is lost).
 *
 * Also attaches the FLAKE-EVIDENCE page-event log described above: every page in every wrapped
 * context (via `context.on('page')`), plus every page `browser.newPage()` returns directly (belt
 * and suspenders, since recordPageEvents is idempotent per page), gets its navigations, errors,
 * crashes, close and failed document/script requests recorded in memory under `browser[PAGE_EVENT_LOG]`.
 */
export function wrapBrowserAgainstViteAutoReload(browser) {
  const log = createPageEventLog();
  pendingPageEventLogs.push(log);
  ensureExitPrinter();
  browser[PAGE_EVENT_LOG] = log;

  const originalNewContext = browser.newContext.bind(browser);
  browser.newContext = async (...args) => {
    const context = await originalNewContext(...args);
    await neutralizeViteAutoReload(context);
    context.on('page', (page) => recordPageEvents(page, log));
    return context;
  };

  const originalNewPage = browser.newPage.bind(browser);
  browser.newPage = async (...args) => {
    const page = await originalNewPage(...args);
    recordPageEvents(page, log);
    return page;
  };

  return browser;
}

export async function startVite(env = {}) {
  const port = await openPort();
  const child = spawn(path.resolve('node_modules/.bin/vite'), ['--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
    cwd: process.cwd(), env: { ...process.env, VITE_PRODUCTION_RELAY: 'false', ...env }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Vite did not start:\n${output}`)), 20_000);
      const inspect = (chunk) => {
        output += chunk.toString();
        if (output.includes(`127.0.0.1:${port}`)) { clearTimeout(timer); resolve(); }
      };
      child.stdout.on('data', inspect);
      child.stderr.on('data', inspect);
      child.once('exit', (code) => { clearTimeout(timer); reject(new Error(`Vite exited ${code}:\n${output}`)); });
    });
  } catch (error) {
    // A start that fails or times out still leaves the spawned process alive. Kill it here
    // rather than leaving it to the caller, which never receives a child reference when this
    // throws (the timeout branch never resolved the promise this awaits).
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
    throw error;
  }
  return { child, url: `http://127.0.0.1:${port}` };
}

/**
 * Start Vite, launch a browser against it, run `fn({ url, browser })`, then tear both down.
 * `launchOptions` may set anything the chosen engine's `launch` accepts (including a test's own
 * `executablePath`, for example the orphan-on-missing-browser regression test below). Chromium
 * callers should leave it unset so the bundled headless Chromium is used. The WebKit caller
 * (stat-slot-layout.test.mjs) sets it only when Playwright's pinned WebKit build is missing.
 * `onChild` is a test-only seam letting a caller observe the spawned Vite process without this
 * helper exposing it on the normal success path.
 * `browserType` defaults to Chromium. A suite that must also prove behavior in another engine
 * (STAT-SLOT-ENGINES runs stat-slot-layout.test.mjs in WebKit too) passes Playwright's `webkit`
 * here and gets the same teardown guarantees.
 */
export async function withViteAndBrowser(launchOptions, fn, { onChild, env, browserType = chromium } = {}) {
  let child;
  let browser;
  try {
    const started = await startVite(env);
    child = started.child;
    onChild?.(child);
    browser = await browserType.launch({ headless: true, ...launchOptions });
    // FLAKE: every context (and so every page, including ones browser.newPage() creates
    // internally) this suite creates gets the stubbed /@vite/client route above, with no
    // change required in the suite itself.
    wrapBrowserAgainstViteAutoReload(browser);
    try {
      return await fn({ url: started.url, browser });
    } catch (error) {
      // FLAKE-EVIDENCE: print what happened to each of this test's pages, so the next
      // "Execution context was destroyed" run finally names its cause instead of hiding it.
      // A destroyed-context rejection can reach this catch a tick before Playwright's own
      // framenavigated event for the same navigation has been dispatched (measured: an
      // immediate print raced it and missed the event entirely), so this waits one short beat
      // for that in-flight event to land before printing.
      await new Promise((resolve) => setTimeout(resolve, 250));
      printPageEventLog(browser[PAGE_EVENT_LOG]);
      throw error;
    }
  } finally {
    // Each cleanup step runs even when the other throws, so a browser that refuses to close
    // (or a Vite process already gone) never skips killing the other resource.
    if (browser) { try { await browser.close(); } catch { /* best-effort teardown */ } }
    if (child) { try { child.kill('SIGTERM'); } catch { /* best-effort teardown */ } }
  }
}

/**
 * Registers one regression test (via the module-scope `test` import, so call this at module
 * scope) proving a given suite's use of `withViteAndBrowser` never orphans its Vite process
 * when the browser fails to launch. Every rendered suite that adopted the shared helper calls
 * this once so `npm run check` shows each suite RED and prompt, never hung, on a missing
 * browser.
 */
export function testHarnessNeverOrphansViteOnMissingBrowser() {
  test('the Vite process this suite starts is never orphaned when the browser fails to launch', { timeout: 30_000 }, async () => {
    let viteChild;
    let bodyRan = false;
    let caught;
    try {
      await withViteAndBrowser(
        { executablePath: '/nonexistent/not-a-real-chrome-binary' },
        async () => { bodyRan = true; },
        { onChild: (child) => { viteChild = child; } },
      );
    } catch (error) {
      caught = error;
    }
    assert.ok(caught instanceof Error, 'a missing browser executable must reject, not resolve');
    assert.match(
      caught.message,
      /Failed to launch|Executable doesn't exist|ENOENT|not-a-real-chrome-binary/,
      `expected a browser-launch failure, got: ${caught.message}`,
    );
    assert.equal(bodyRan, false, 'the test body must not run when the browser cannot launch');
    assert.ok(viteChild, 'Vite must have been started before the browser launch was attempted');
    const exited = await new Promise((resolve) => {
      if (viteChild.exitCode !== null || viteChild.signalCode !== null) { resolve(true); return; }
      viteChild.once('exit', () => resolve(true));
      setTimeout(() => resolve(false), 5_000);
    });
    assert.ok(exited, 'the Vite process must exit, not linger as an orphan, when the browser fails to launch');
  });
}

function raceTimeout(promise, timeoutMs, message) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${message} within ${timeoutMs}ms`)), timeoutMs);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); },
    );
  });
}

/**
 * TW-5. Starts Vite's own in-process dev server (its JS API, not a spawned child) for a suite that
 * shares one Vite instance across every test in the file rather than restarting per test. Before
 * this fix, keyboard-single-owner.test.mjs and facilitator-focus.test.mjs awaited createServer()
 * and server.listen() with no startup bound at module scope: a hung plugin or a config that never
 * resolves (proven with a scratch vite.config.mjs exporting `new Promise(() => {})`) hung the file's
 * very first top-level await forever, with no output, so `check` never reached a later suite either.
 * Races both awaits against `timeoutMs` and, if `listen()` is what hangs, closes the server object
 * createServer() already produced rather than leaving it to the caller (which never receives a
 * server reference when this throws).
 */
export async function startInProcessVite(options, timeoutMs = 20_000) {
  const { createServer } = await import('vite');
  let server;
  try {
    server = await raceTimeout(createServer(options), timeoutMs, 'Vite (in-process) did not finish resolving its config');
    await raceTimeout(server.listen(), timeoutMs, 'Vite (in-process) did not finish listening');
  } catch (error) {
    if (server) { try { await server.close(); } catch { /* best-effort teardown */ } }
    throw error;
  }
  return server;
}

/**
 * Registers one regression test (call at module scope) proving startInProcessVite actually bounds
 * a config that never resolves, using tests/integration/fixtures/never-ready-vite/vite.config.mjs
 * (a config exporting `new Promise(() => {})`, standing in for a hung plugin). Before TW-5, the
 * equivalent bare `await createServer(...)` hung indefinitely against this exact fixture (proved by
 * running it under an external wall-clock bound and observing zero output, ever).
 */
export function testInProcessViteBoundsAHungStartup() {
  test('startInProcessVite rejects promptly instead of hanging when Vite never finishes starting', { timeout: 10_000 }, async () => {
    const fixtureRoot = new URL('./fixtures/never-ready-vite/', import.meta.url).pathname;
    const t0 = Date.now();
    await assert.rejects(
      startInProcessVite({ root: fixtureRoot, server: { port: 0, host: '127.0.0.1' }, logLevel: 'silent' }, 500),
      /did not finish resolving its config within 500ms/,
      'a Vite config that never resolves must reject with a bounded, named timeout, not hang',
    );
    assert.ok(Date.now() - t0 < 5_000, 'the rejection must arrive promptly, not after node:test’s own outer timeout');
  });
}
