import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Lobby } from '../../src/screens/Lobby';
import { InstructionsSlide } from '../../src/screens/InstructionsSlide';
import { ROOM_MAX_PHONES, ROSTER_FIT_ORDER, ROSTER_PLATE_STEPS, lobbyArrivals } from '../../src/screens/LobbyArrivals';
import { LOBBY_EMPTY_LINE, LOBBY_JOINED_LINE } from '../../src/engine/room-flavor';
import { WALKIN_LYRIC_DATA } from '../../src/data/walkin-lyrics';
import { RoomContext } from '../../src/presentation/RoomContext';
import { declaration } from './css-declarations';

// VOF-88, the pre-show pass: who is in, the start clock, the step lines, and the chrome rules the
// rendered suite (tests/integration/preshow-layout.test.mjs) measures on real screens.

const room = { roomId: 'KQ7M', connectionStatus: 'connected' as const, error: null };
const joinUrl = 'https://vaxorfiction.com/join/KQ7M';

function lobby(props: Record<string, unknown>): string {
  return renderToStaticMarkup(
    React.createElement(RoomContext.Provider, { value: room },
      React.createElement(Lobby, { roomCode: 'KQ7M', pollingUrl: joinUrl, format: 'widescreen', ...props }),
    ),
  );
}

test('arrivals list the newest name first, ties in a stable order', () => {
  const devices = {
    b: { nickname: 'Priya', joinedAt: 2000 },
    a: { nickname: 'Jordan', joinedAt: 1000 },
    c: { nickname: '  Sam  ', joinedAt: 3000 },
    d: { nickname: 'Morgan', joinedAt: 3000 },
    e: { nickname: '', joinedAt: 500 },
  };
  assert.deepEqual(lobbyArrivals(devices).map((arrival) => arrival.name), ['Sam', 'Morgan', 'Priya', 'Jordan', 'Player']);
  assert.deepEqual(lobbyArrivals(devices, 2).map((arrival) => arrival.id), ['c', 'd']);
});

test('every joined phone is listed, up to the most phones a room seats (VOF-97: a joined name is never hidden)', () => {
  const relay = fs.readFileSync(new URL('../../server/room-relay.mjs', import.meta.url), 'utf8');
  assert.equal(Number((relay.match(/maxClients = (\d+)/) ?? [])[1]), ROOM_MAX_PHONES, 'the lobby lists as many names as the relay seats');
  const production = fs.readFileSync(new URL('../../supabase/migrations/20260926140000_vax_or_fiction_production_relay_anonymous_room_budget.sql', import.meta.url), 'utf8');
  assert.match(production, new RegExp(`where room_id = v_room_id\\) >= ${ROOM_MAX_PHONES} then`), 'and as many as the production relay seats');
  const devices = Object.fromEntries(Array.from({ length: ROOM_MAX_PHONES }, (_, i) => [`d-${i}`, { nickname: `Player ${i}`, joinedAt: i }]));
  const arrivals = lobbyArrivals(devices);
  assert.equal(arrivals.length, ROOM_MAX_PHONES, 'every one of a full room');
  assert.equal(arrivals[0].name, `Player ${ROOM_MAX_PHONES - 1}`, 'the newest first');
});

test("the roster gives the wordmark's room before a single plate steps down, and the walk-in band last (VOF-97, option B)", () => {
  const firstPlate = ROSTER_FIT_ORDER.findIndex((state) => state.plate > 0);
  assert.deepEqual(ROSTER_FIT_ORDER.slice(0, firstPlate), [{ plate: 0, room: 0 }, { plate: 0, room: 1 }, { plate: 0, room: 2 }], "today's plates hold while the wordmark and the hype line make room");
  const firstBand = ROSTER_FIT_ORDER.findIndex((state) => state.room === 3);
  assert.ok(firstBand > firstPlate, 'the walk-in band stays until the plates have stepped down');
  assert.deepEqual(ROSTER_FIT_ORDER.slice(firstPlate, firstBand).map((state) => state.plate), Array.from({ length: ROSTER_PLATE_STEPS - 1 }, (_, i) => i + 1), 'every plate size, smaller each time, with the band still in');
  assert.ok(ROSTER_FIT_ORDER.slice(firstBand).every((state) => state.room === 3), 'only the biggest rooms lose the band');
  assert.deepEqual(ROSTER_FIT_ORDER.at(-1), { plate: ROSTER_PLATE_STEPS - 1, room: 3 }, 'the last state is the densest the lobby has');
});

test('a phone-voting lobby shows the arrivals row, a ghost seat before anyone joins', () => {
  const html = lobby({ venue: 'teams', interactionMode: 'polling', joinedCount: 0 });
  assert.match(html, /data-role="lobby-arrivals"/);
  assert.match(html, /lobby-arrival--ghost/);
  assert.match(html, /Your name here/);
});

test('with Top 5 scores off the lobby keeps names off the shared screen and grows the count', () => {
  const html = lobby({ venue: 'teams', interactionMode: 'polling', joinedCount: 3, showNames: false });
  assert.doesNotMatch(html, /data-role="lobby-arrivals"/);
  assert.match(html, /data-names="false"/);
  assert.match(html, /data-role="joined-count-number"[^>]*>3</);
  const css = fs.readFileSync(new URL('../../src/styles/preshow-stage.css', import.meta.url), 'utf8');
  assert.match(css, /\.preshow-lobby\[data-names="false"\] \{\s*--lobby-count-number: 132px;/);
  assert.match(lobby({ venue: 'teams', interactionMode: 'polling', joinedCount: 3 }), /data-names="true"/);
});

test('a lobby without phone voting shows no arrivals row', () => {
  for (const props of [{ venue: 'offline', interactionMode: 'polling' }, { venue: 'teams', interactionMode: 'facilitator' }]) {
    assert.doesNotMatch(lobby(props), /data-role="lobby-arrivals"/, JSON.stringify(props));
  }
});

test('a start time puts the big clock where the hype line sits, and never both', () => {
  const withClock = lobby({ venue: 'teams', interactionMode: 'polling', joinedCount: 4, countdownText: 'STARTS IN 04:31' });
  assert.match(withClock, /data-role="lobby-countdown"[^>]*>STARTS IN 04:31</);
  assert.doesNotMatch(withClock, /data-role="lobby-hype"/);
  const withoutClock = lobby({ venue: 'teams', interactionMode: 'polling', joinedCount: 4 });
  assert.match(withoutClock, /data-role="lobby-hype"/);
  assert.doesNotMatch(withoutClock, /data-role="lobby-countdown"/);
});

test('no hype line repeats a line of the walk-in lyric the same lobby shows', () => {
  const sung = new Set(WALKIN_LYRIC_DATA.lines.map((line) => line.text.toLowerCase().replace(/[^a-z ]/g, '').trim()));
  for (const hype of [LOBBY_JOINED_LINE, LOBBY_EMPTY_LINE]) {
    const words = hype.toLowerCase().replace(/[^a-z ]/g, '').trim();
    for (const line of sung) {
      assert.ok(!line.startsWith(words) && !words.startsWith(line), `"${hype}" repeats the lyric "${line}"`);
    }
  }
});

test('the step lines describe phone voting, so only a phone-voting game shows them', () => {
  const render = (venue: string) => renderToStaticMarkup(
    React.createElement(RoomContext.Provider, { value: room },
      React.createElement(InstructionsSlide, { venue: venue as 'teams', interactive: false }),
    ),
  );
  // The store's own default is phone voting (interactionMode 'polling').
  const teams = render('teams');
  assert.match(teams, /Vote on your phone\./);
  assert.match(teams, /class="instructions-step-description"/);
  const offline = render('offline');
  assert.doesNotMatch(offline, /Vote on your phone\./);
  assert.match(offline, /Make your call/);
});

test('inside the show the pre-show screens let the stage atmosphere through', () => {
  const css = fs.readFileSync(new URL('../../src/styles/preshow-stage.css', import.meta.url), 'utf8');
  // The helper splits selector lists on commas, which would cut this :is() apart, so read the rule whole.
  assert.match(css, /\.screen-router-root :is\(\.preshow-lobby, \.preshow-title, \.preshow-instructions\) \{\s*background-color: transparent;/);
});

test('the join address keeps its brand casing inside the capitalised join card', () => {
  const css = fs.readFileSync(new URL('../../src/styles/preshow-stage.css', import.meta.url), 'utf8');
  assert.equal(declaration(css, '.lobby-join-host', 'text-transform'), 'none');
});
