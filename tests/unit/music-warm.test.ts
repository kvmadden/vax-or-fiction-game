// The early music warm (src/engine/music-warm.ts, from the parked wip/music-warm branch) fetches a show's opening beds
// while its suite chunk loads. Host mode is what a bare address resolves to (src/network/room.ts), so the branch's
// own test, host or solo mode, would have fetched about 1.8 MB of show music on the landing page and every site page.
// These addresses go through the real route resolver, the way App.tsx does.
import assert from 'node:assert/strict';
import test from 'node:test';
import { LANDING_WALKIN_PATH } from '../../src/engine/landing-music';
import { earlyWarmRoles, earlyWarmSurface, soundtrack, unlockWarmRoles } from '../../src/engine/music-warm';
import { hasHostIntent, resolveAppRoute } from '../../src/network/room';

const SITE_PATHS = ['/about', '/disclaimer', '/privacy', '/terms', '/credits', '/admin'];

function surfaceFor(address: string) {
  const url = new URL(address, 'https://vaxorfiction.com');
  const route = resolveAppRoute(url, { hostedInThisTab: false });
  const undecided = route.mode === 'host' && !url.searchParams.has('room');
  return earlyWarmSurface({
    mode: route.mode,
    undecided,
    redirecting: undecided && hasHostIntent(url),
    sitePage: SITE_PATHS.includes(url.pathname),
  });
}

test('a bare address and the site pages resolve to host mode, which is why host mode alone cannot decide the warm', () => {
  for (const address of ['/', ...SITE_PATHS]) {
    assert.equal(resolveAppRoute(new URL(address, 'https://vaxorfiction.com'), { hostedInThisTab: false }).mode, 'host', address);
  }
});

test('only a hosted show and solo warm the show music', () => {
  const expected: Array<[string, ReturnType<typeof earlyWarmSurface>]> = [
    ['/', 'none'],
    ...SITE_PATHS.map((path): [string, 'none'] => [path, 'none']),
    ['/join?room=ABC', 'none'],
    ['/?vote=1&room=ABC', 'none'],
    ['/remote?room=ABC', 'none'],
    // A one-click preset reloads itself with a room, so this first load is about to redirect.
    ['/?preset=curated8', 'none'],
    ['/play', 'solo'],
    ['/?room=ABC&host=1', 'host-show'],
    ['/?room=ABC&host=1&preset=curated8&venue=room', 'host-show'],
  ];
  for (const [address, surface] of expected) assert.equal(surfaceFor(address), surface, address);
});

test('a hosted show warms walk-in and menu-soft, solo only menu-soft (it never plays walk-in), anything else nothing', () => {
  assert.deepEqual([...earlyWarmRoles('host-show')], ['walkin', 'menu-soft']);
  assert.deepEqual([...earlyWarmRoles('solo')], ['menu-soft']);
  assert.deepEqual([...earlyWarmRoles('none')], []);
});

test('the first tap warms the beds the surface plays: solo only menu-soft and closing, a hosted show all five', () => {
  // The audio trace plays only menu-soft and closing in solo on every pace (Today, Run, Climb, Best). Solo has no
  // timer and no showdown, so warming deliberate, countdown and showdown cost about 1.2 MB it never used.
  assert.deepEqual([...unlockWarmRoles(true)], ['menu-soft', 'closing']);
  assert.deepEqual([...unlockWarmRoles(false)], ['menu-soft', 'deliberate', 'countdown', 'showdown', 'closing']);
  for (const role of unlockWarmRoles(true)) assert.ok(role in soundtrack, `${role} is a soundtrack bed`);
});

test('the landing teaser and the show play the same walk-in file', () => {
  const walkin = soundtrack.walkin as { path: string };
  assert.equal(LANDING_WALKIN_PATH, walkin.path);
});
