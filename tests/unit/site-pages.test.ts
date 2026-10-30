// VOF-45: About, legal and credits, each a route linked from the entry screen's footer and from
// every page's own footer. The branded 404 is a static root 404.html (see
// tests/integration/static-404-routing.test.mjs for that one), not an in-app route: no in-app
// navigation ever constructs an unknown URL, so there is nothing for an in-app 404 to catch.
// Renders each page for real (no jsdom needed, the same renderToStaticMarkup pattern
// tests/unit/react-memo-propagation.test.ts already uses) and checks the routing wiring in
// App.tsx structurally, the same AST approach tests/unit/app-error-boundaries.test.ts uses for
// its own ErrorBoundary coverage check.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { register } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

// TW-2 pattern (tests/unit/react-memo-propagation.test.ts): register the CSS-stub loader before
// any dynamic import of a component that imports its own stylesheet (SitePage.tsx, VOF-45 fix
// pass colocates site-page.css so it ships only in the site pages' own lazy chunks, not the
// game's entry bundle). Node's default --test-isolation is "process" (one child process per test
// file), so this affects only this file's own module graph, not the other unit test files
// npm test also runs.
register('./support/stub-css-loader.mjs', import.meta.url);

const { SITE_NAV_LINKS } = await import('../../src/screens/site/SitePage');
const { About } = await import('../../src/screens/site/About');
const { Disclaimer } = await import('../../src/screens/site/Disclaimer');
const { Privacy } = await import('../../src/screens/site/Privacy');
const { Terms } = await import('../../src/screens/site/Terms');
const { Credits } = await import('../../src/screens/site/Credits');

const EXPECTED_H1: Array<[string, React.FC, RegExp]> = [
  ['About', About, /What Vax or Fiction is/],
  ['Disclaimer', Disclaimer, /Disclaimer/],
  ['Privacy', Privacy, /Privacy/],
  ['Terms', Terms, /Terms of use/],
  ['Credits', Credits, /Credits and sources/],
];

for (const [name, Component, heading] of EXPECTED_H1) {
  test(`${name} renders its own <h1> heading`, () => {
    const html = renderToStaticMarkup(React.createElement(Component));
    const match = html.match(/<h1[^>]*>(.*?)<\/h1>/s);
    assert.ok(match, `${name} must render an <h1>: ${html.slice(0, 200)}`);
    assert.match(match![1], heading, `${name}'s <h1> text must match the expected heading`);
  });
}

test('every legal/about/credits page carries the shared footer nav with all five site pages, back to the game, and the unnamed byline', () => {
  for (const [name, Component] of EXPECTED_H1) {
    const html = renderToStaticMarkup(React.createElement(Component));
    for (const link of SITE_NAV_LINKS) {
      assert.ok(html.includes(`href="${link.href}"`), `${name} footer must link ${link.href}`);
    }
    assert.ok(html.includes('href="/"'), `${name} must link back to the game`);
    assert.ok(html.includes('made by a pharmacist'), `${name} footer must carry the unnamed byline (no name, no employer, no partner)`);
    const emails = html.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) ?? [];
    assert.deepEqual(emails.filter((email) => !email.toLowerCase().endsWith('@vaxorfiction.com')), [], `${name} must carry no personal email address`);
  }
});

test('About ends with only the unnamed byline, no other attribution (owner ruling)', () => {
  const html = renderToStaticMarkup(React.createElement(About));
  assert.match(html, /<p>Vax or Fiction was made by a pharmacist\.<\/p>\s*<\/div>/s, 'About must end its body with exactly one sentence, no follow-on credit line');
});

test('Privacy states the placeholder contact and never implies the mailbox already works', () => {
  const html = renderToStaticMarkup(React.createElement(Privacy));
  assert.ok(html.includes('hello@vaxorfiction.com'), 'Privacy must show the placeholder address');
  assert.ok(/placeholder/i.test(html), 'Privacy must say the address is a placeholder, per the owner’s ruling');
});

test('Privacy states the live recap-privacy facts: admin-only identity-checked reads, 30-day and 90-day deletion tied to the next save', () => {
  const html = renderToStaticMarkup(React.createElement(Privacy));
  assert.match(html, /30 days/, 'Privacy must state the 30-day recap window');
  assert.match(html, /90 days/, 'Privacy must state the 90-day session summary window');
  assert.match(html, /admin account/i, 'Privacy must say only the admin account can read saved recaps');
  assert.match(html, /signed-in|identity-checked/i, 'Privacy must say the admin read requires a signed-in, identity-checked request');
  assert.match(html, /nobody can list|no public lookup/i, 'Privacy must say the public connection can no longer list or read recaps');
  assert.match(html, /next time any game .* is saved|next saved game/i, 'Privacy must say deletion rides on the next save, not a schedule');
  assert.match(html, /if no games are played/i, 'Privacy must say plainly that nothing triggers deletion if no games are played');
});

test('Privacy states the live network-address, lazy-deletion and ack_history facts (fix pass)', () => {
  const html = renderToStaticMarkup(React.createElement(Privacy));
  assert.match(html, /IPv4|IPv6|network address/i, 'Privacy must state the host network address is stored (creating_network_key)');
  assert.match(html, /not.{0,20}cleared on a fixed schedule|not.{0,20}scheduled|no separate scheduled job/i, 'Privacy must say room deletion is not scheduled');
  assert.match(html, /next time anyone uses the relay|8 expired rooms/i, 'Privacy must describe the lazy, up-to-8-per-call deletion');
  assert.match(html, /128/, 'Privacy must state the 128-per-phone ack_history cap');
  assert.doesNotMatch(html, /order of minutes/i, 'Privacy must drop the old "on the order of minutes" framing');
});

test('Privacy lists every localStorage key by name and says none clear automatically', () => {
  const html = renderToStaticMarkup(React.createElement(Privacy));
  for (const key of ['vrc_device_id', 'vrc_audio_muted', 'vof-attendee-credential', 'vof-remote-device']) {
    assert.ok(html.includes(key), `Privacy must name the localStorage key ${key}`);
  }
  assert.match(html, /none of them clear themselves automatically|not cleared automatically/i, 'Privacy must say plainly these keys are not cleared automatically');
});

test('Privacy no longer carries the stale recap-migration marker comment, now that the migration has shipped', () => {
  const privacySource = readFileSync(path.resolve(process.cwd(), 'src/screens/site/Privacy.tsx'), 'utf8');
  assert.ok(
    !privacySource.includes('recap facts change with the recap privacy migration'),
    'Privacy.tsx must not carry the now-resolved recap-migration marker comment',
  );
});

test('Terms describes the automatic nickname filter, not a host-removal feature that does not exist', () => {
  const html = renderToStaticMarkup(React.createElement(Terms));
  assert.match(html, /automatic filter|filter/i, 'Terms must describe the automatic nickname filter');
  assert.doesNotMatch(html, /host may remove/i, 'Terms must not claim a host can remove a nickname or player, a feature that does not exist');
});

// App.tsx routing (structural, mirrors app-error-boundaries.test.ts's AST approach)
const appSource = readFileSync(path.resolve(process.cwd(), 'src/App.tsx'), 'utf8');
const ast = ts.createSourceFile('App.tsx', appSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

test('App.tsx routes all five site pages by exact pathname to their own lazy-loaded component', () => {
  const expected: Record<string, string> = {
    '/about': 'About',
    '/disclaimer': 'Disclaimer',
    '/privacy': 'Privacy',
    '/terms': 'Terms',
    '/credits': 'Credits',
  };
  for (const [pathname, component] of Object.entries(expected)) {
    assert.match(appSource, new RegExp(`'${pathname}':\\s*${component}\\b`), `SITE_PAGES must map ${pathname} to ${component}`);
    assert.match(appSource, new RegExp(`const ${component} = lazy\\(\\(\\) => import\\('./screens/site/${component}'\\)\\)`), `${component} must be its own lazy import so it ships as its own chunk`);
  }
});

test('App.tsx no longer carries an in-app NotFound route (VOF-45 follow-up): the static root 404.html is the only 404 surface', () => {
  assert.doesNotMatch(appSource, /NotFound/, 'no in-app navigation constructs an unknown URL, so there is nothing for an in-app 404 to catch; root 404.html covers real unknown paths');
  assert.doesNotMatch(appSource, /KNOWN_APP_PATHS/);
});

test('App.tsx never names another site (fix pass)', () => {
  assert.doesNotMatch(appSource, /DJ KMad/);
});

test('every footer link (SITE_NAV_LINKS) actually resolves to a real SITE_PAGES route', () => {
  for (const link of SITE_NAV_LINKS) {
    assert.match(appSource, new RegExp(`'${link.href}':\\s*[A-Za-z]+`), `${link.href} (from the shared footer) must be a real SITE_PAGES route`);
  }
});

test('the five site-page routes render inside the shared ErrorBoundary, like every other route', () => {
  const covered = new Set<string>();
  const visit = (node: ts.Node, insideBoundary = false): void => {
    const tag = ts.isJsxElement(node) ? node.openingElement.tagName.getText(ast)
      : ts.isJsxSelfClosingElement(node) ? node.tagName.getText(ast) : null;
    if (insideBoundary && tag) covered.add(tag);
    ts.forEachChild(node, (child) => visit(child, insideBoundary || tag === 'ErrorBoundary'));
  };
  visit(ast);
  assert.ok(covered.has('SitePageComponent'), 'SitePageComponent must render inside the shared ErrorBoundary');
});
