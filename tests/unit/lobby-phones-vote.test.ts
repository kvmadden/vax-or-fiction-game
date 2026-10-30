import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Lobby } from '../../src/screens/Lobby';

// WARNING-3 (premium-host-fix-3): Lobby.tsx now derives phonesVote from the shared
// phonesCanVote (setup-polling.ts) instead of its own copy of the same rule. A render proof that
// the desynced case (venue offline, a stale interactionMode still carrying "polling") renders no
// join-card, matching phonesCanVote's own contract ("Offline stays off, including after a
// remount"). pollingUrl/pollingDisplay are passed explicitly: Lobby otherwise reads
// window.location.origin directly, which node's plain test runner has no window for.
const renderLobby = (props: Partial<React.ComponentProps<typeof Lobby>>) =>
  renderToStaticMarkup(React.createElement(Lobby, {
    roomCode: 'TEST',
    pollingUrl: 'https://vaxorfiction.com/join?room=TEST',
    pollingDisplay: 'VaxOrFiction.com',
    ...props,
  }));

test('venue offline with a stale polling interactionMode renders no lobby-polling join card', () => {
  const html = renderLobby({ venue: 'offline', interactionMode: 'polling' });
  assert.doesNotMatch(html, /data-role="lobby-polling"/);
  assert.match(html, /data-phones="false"/);
});

test('venue room with polling interactionMode renders the join card as usual', () => {
  const html = renderLobby({ venue: 'room', interactionMode: 'polling' });
  assert.match(html, /data-role="lobby-polling"/);
  assert.match(html, /data-phones="true"/);
});

test('venue room with facilitator interactionMode renders no join card, matching hands-up mode', () => {
  const html = renderLobby({ venue: 'room', interactionMode: 'facilitator' });
  assert.doesNotMatch(html, /data-role="lobby-polling"/);
  assert.match(html, /data-phones="false"/);
});
