import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import fs from 'node:fs';
import { Lobby } from '../../src/screens/Lobby';
import { RoomContext } from '../../src/presentation/RoomContext';
import { LOBBY_EMPTY_LINE, LOBBY_JOINED_LINE } from '../../src/engine/room-flavor';
import { declaration, pixels } from './css-declarations';

const room = { roomId: 'LEDQ', connectionStatus: 'connected' as const, error: null };
const joinUrl = 'https://vaxorfiction.com/join/LEDQ';

test('VOF-89 call 16: once a phone is in, the lobby carries the one playful line, and nobody in keeps the warm-up line', () => {
  assert.equal(LOBBY_JOINED_LINE, 'Phones keep landing. The room is filling up.');
  assert.equal(LOBBY_EMPTY_LINE, 'Phones are warming up. Rumors welcome.');
  for (const line of [LOBBY_JOINED_LINE, LOBBY_EMPTY_LINE]) {
    assert.doesNotMatch(line, /[\u2014;]/);
  }
});

test('A11Y-05: the hype line is not its own free-running live region', () => {
  const html = renderToStaticMarkup(
    React.createElement(RoomContext.Provider, { value: room },
      React.createElement(Lobby, {
        venue: 'room',
        interactionMode: 'polling',
        roomCode: 'LEDQ',
        joinedCount: 3,
        pollingUrl: joinUrl,
        format: 'widescreen',
      }),
    ),
  );
  const hypeParagraph = html.match(/<p class="lobby-hype"[^>]*>/)?.[0];
  assert.ok(hypeParagraph, 'the hype paragraph renders');
  assert.doesNotMatch(hypeParagraph!, /aria-live/, 'the hype line is decoration, and the joined count carries the live change');
  // The joined count is the meaningful live change and must keep its own region.
  const countRegion = html.match(/<div class="lobby-count"[^>]*>/)?.[0];
  assert.ok(countRegion, 'the joined-count region renders');
  assert.match(countRegion!, /aria-live="polite"/);
});

test('polling lobby always shows a live joined count and a hype line', () => {
  const html = renderToStaticMarkup(
    React.createElement(RoomContext.Provider, { value: room },
      React.createElement(Lobby, {
        venue: 'room',
        interactionMode: 'polling',
        roomCode: 'LEDQ',
        joinedCount: 0,
        pollingUrl: joinUrl,
        format: 'widescreen',
      }),
    ),
  );
  assert.match(html, /data-role="joined-count"/);
  assert.match(html, /data-role="joined-count-number"[^>]*>0</);
  assert.match(html, /data-role="lobby-hype"/);
  assert.match(html, /Phones are warming up/);

  const joined = renderToStaticMarkup(
    React.createElement(RoomContext.Provider, { value: room },
      React.createElement(Lobby, {
        venue: 'room',
        interactionMode: 'polling',
        roomCode: 'LEDQ',
        joinedCount: 7,
        pollingUrl: joinUrl,
        format: 'widescreen',
      }),
    ),
  );
  assert.match(joined, /data-role="joined-count-number"[^>]*>7</);
  assert.match(joined, /phones in/);
  assert.match(joined, /data-role="lobby-hype"/);
  assert.match(joined, /Phones keep landing\. The room is filling up\./);
  assert.doesNotMatch(joined, /Phones are warming up/);

  // The count and the hype are bands of the lobby grid, sized from the surface's own tokens.
  const css = fs.readFileSync(new URL('../../src/styles/preshow-stage.css', import.meta.url), 'utf8');
  assert.ok(pixels(css, '.preshow-lobby', '--lobby-count-number') >= 64, 'the joined count is readable without opening a hole in the plate');
  assert.ok(pixels(css, '.preshow-lobby', '--lobby-hype-size') >= 32, 'the hype line must read from the back of the room');
  assert.equal(declaration(css, '.lobby-count strong', 'font-size'), 'var(--lobby-count-number)');
  assert.equal(declaration(css, '.lobby-hype', 'font-size'), 'var(--lobby-hype-size)');
  // The hype sits in the copy column's first row and the walk-in lyric owns the row under it, so the
  // two cannot share a band.
  assert.equal(declaration(css, '.lobby-copy', 'grid-area'), '1 / 1');
  assert.equal(declaration(css, '.lobby-footer', 'grid-area'), '2 / 1');
});
