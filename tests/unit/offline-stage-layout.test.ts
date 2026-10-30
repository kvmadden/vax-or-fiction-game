import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('Preflight renders Facilitator Run-of-Show Card when activeVenue is offline', () => {
  const tsx = fs.readFileSync(path.resolve('src/screens/Preflight.tsx'), 'utf8');
  assert.match(tsx, /setup-facilitator-card/);
  // HB-11 (premium-host pass): the card used to say "hands-up play" three times across a
  // separate badge, a kicker and a footer status line. The badge and kicker merged into one
  // line. The footer line is sr-only rather than removed, so the phrase is still present, just
  // not visually redundant.
  assert.match(tsx, /Run of show · in-person/i);
  assert.match(tsx, /Hands-up play is selected/);
});

test('Lobby keys its layout to one phonesVote flag, not venue alone', () => {
  const tsx = fs.readFileSync(path.resolve('src/screens/Lobby.tsx'), 'utf8');
  const css = fs.readFileSync(path.resolve('src/styles/preshow-stage.css'), 'utf8');
  // B1 (premium-host pass 2): venue and interaction mode are independent state. Lobby.tsx derives
  // one flag from both and exposes it as data-phones, so a desynced room (venue offline, mode
  // still polling from earlier in the session) never shows a code phones cannot join, and a
  // facilitator-mode room in venue teams or room never reserves an empty join column.
  // WARNING-3 (premium-host-fix-3): Lobby.tsx now calls the shared phonesCanVote instead of
  // carrying its own copy of the same rule.
  assert.match(tsx, /import\s*\{\s*phonesCanVote\s*\}\s*from\s*["']\.\/setup-polling["']/);
  assert.match(tsx, /phonesVote\s*=\s*phonesCanVote\(activeVenue,\s*activeInteractionMode\)/);
  assert.match(tsx, /data-phones=\{phonesVote/);
  assert.doesNotMatch(css, /data-venue="offline"\]:not\(/);
  assert.match(css, /\.preshow-lobby\[data-phones="false"\]/);
  assert.match(css, /margin:\s*0 auto/);
  // Offline hero bump is widescreen-only. Square/portrait keep native mark sizes.
  assert.match(css, /\.preshow-lobby\[data-phones="false"\]\[data-format="portrait"\]/);
  assert.match(css, /\.preshow-lobby\[data-phones="false"\]\[data-format="square"\]/);
  // WARNING-8 (premium-host-fix-3), corrected BLOCKER-1 (premium-host-fix-4): 190px overflowed
  // span.show-wordmark past its own parent by 129.9px real (a Playwright sweep against the real
  // dev server found 139px is the first size that overflows at all, 2px). 138px used, one px of
  // margin below that measured edge.
  assert.match(css, /\.preshow-lobby\[data-phones="false"\]\[data-format="portrait"\]\s*\{[^}]*--lobby-mark-size:\s*138px/);
  assert.doesNotMatch(css, /45cqi/);
  // Square pad tokens must resolve on the approved scale. Missing --kit-space-40
  // invalidated the whole padding shorthand and flushed the mark to the frame edge.
  assert.doesNotMatch(css, /--kit-space-40|--kit-space-20|--kit-space-6\b/);
  assert.match(css, /\.preshow-lobby\[data-format="square"\]\s*\{[^}]*--lobby-pad-x:\s*var\(--kit-space-32\)/);
});

test('ShowChrome renders quiet offline badge in footer when offlineMode is true', () => {
  const tsx = fs.readFileSync(path.resolve('src/components/show/ShowChrome.tsx'), 'utf8');
  assert.match(tsx, /show-footer__offline-badge/);
  assert.match(tsx, /HANDS-UP PLAY/);
});

test('Closing renders 2-column takeaway recap grid in offline mode with two-digit padding, paginated with no scroll box', () => {
  const tsx = fs.readFileSync(path.resolve('src/screens/Closing.tsx'), 'utf8');
  const css = fs.readFileSync(path.resolve('src/styles/closing-critique.css'), 'utf8');
  assert.match(tsx, /closing-offline-recap/);
  assert.match(tsx, /closing-offline-grid/);
  // HB-23 (premium-host pass): the grid used to be a max-height scroll box on a screen nobody
  // can scroll, cutting cards mid-line. It paginates now, so the card number accounts for the
  // current page's offset rather than just its index within one unpaginated list.
  assert.match(tsx, /String\(offlinePage \* offlinePageSize \+ idx \+ 1\)\.padStart\(2, '0'\)/);
  assert.match(tsx, /offlinePageSize/);
  assert.match(tsx, /closing-offline-pager/);
  const gridRule = css.slice(css.indexOf('.closing-offline-grid {'), css.indexOf('.closing-offline-grid {') + 400);
  assert.doesNotMatch(gridRule, /max-height/);
  assert.doesNotMatch(gridRule, /overflow-y/);
});

test('Closing offline pager pages by format and caps at the real page count', () => {
  const tsx = fs.readFileSync(path.resolve('src/screens/Closing.tsx'), 'utf8');
  // W4 (premium-host pass 2), corrected WARNING-1 (premium-host-fix-3): the facilitator advance
  // (keyboard and clicker, never the remote, which cannot pair while the venue is offline) turns
  // pages too, with the on-screen buttons kept as a fallback.
  assert.match(tsx, /OFFLINE_RECAP_PAGE_SIZE.*widescreen:\s*6.*square:\s*4.*portrait:\s*3/s);
  assert.match(tsx, /offlinePageCount\s*=\s*Math\.max\(1, Math\.ceil\(offlineRecap\.length \/ offlinePageSize\)\)/);
  assert.match(tsx, /Math\.min\([^)]*offlinePageCount - 1\)/);
  // BLOCKER-3 (premium-host-fix-3): a bare /closingAdvanceStep/ regex matched this very comment,
  // so it stayed green against a component with the paging effect deleted entirely. Requiring the
  // exact useEffect dependency array and the guard inside its body cannot pass from prose alone.
  // It needs the real hook wired to the real field. The actual paging BEHAVIOR (dispatch ADVANCE,
  // watch the page turn) is proven as a mounted, effect-running Playwright test in
  // tests/integration/question-lifecycle.test.mjs, "Closing offline recap pager advances on a
  // real ADVANCE dispatch, not just a click", this file's own renderToStaticMarkup/regex tier
  // never runs effects (SSR does not), so it cannot prove the behavior directly.
  assert.match(tsx, /if \(closingAdvanceStep === lastClosingAdvanceStep\.current\) return;/);
  // BLOCKER-2 (premium-host-fix-4): the dependency array now also carries pagerVisible, the exact
  // condition (!recap.hasAnswers && offlineMode && offlinePageCount > 1) the pager's own nav
  // renders under, so this effect never silently turns a page nobody can see.
  assert.match(tsx, /\}, \[closingAdvanceStep, pagerVisible, offlinePageCount, offlinePage\]\);/);
  const store = fs.readFileSync(path.resolve('src/store/game-store.ts'), 'utf8');
  assert.match(store, /closingAdvanceStep: state\.closingAdvanceStep \+ 1/);
});
