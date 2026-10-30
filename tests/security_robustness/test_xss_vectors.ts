import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { computeLeaderboard } from '../../src/engine/leaderboard';
import { validateClientEnvelope } from '../../src/network/guards';

const payloads = [
  "<script>alert('XSS-1')</script>",
  "<img src=x onerror=alert('XSS-2')>",
  "<svg onload=alert('XSS-3')>",
  "javascript:alert('XSS-4')",
  '"><script>alert(\'XSS-5\')</script>',
  '\u202EALERT',
  'A'.repeat(1_000),
  'Dr. <b onmouseover=alert(1)>Smith</b>',
];

const context = {
  roomId: 'Room_XSS',
  sessionId: 'run_1',
  deviceId: 'device_A',
  phase: 'deliberating',
  votesLocked: false,
  question: null,
  decodeChoice: () => null,
};

test('React text rendering escapes every hostile nickname fixture', () => {
  for (const payload of payloads) {
    const rendered = renderToStaticMarkup(React.createElement('div', { className: 'attendee-name' }, payload));
    assert.doesNotMatch(rendered, /<(?:script|img|svg|b)(?:\s|>)/i, payload);
  }
  console.log(`coverage: ${payloads.length} hostile text fixtures rendered through React`);
});

test('the real attendee ingress rejects non-string and oversized nicknames beside a valid control', () => {
  const base = {
    version: 1 as const,
    type: 'HELLO' as const,
    roomId: context.roomId,
    sessionId: context.sessionId,
    deviceId: context.deviceId,
    messageId: 'hello_1',
  };
  assert.equal(validateClientEnvelope({ ...base, nickname: 'Ada' }, context).ok, true);
  for (const nickname of [null, 1337, ['<script>'], { evil: 'payload' }, '', '   ', 'A'.repeat(41)]) {
    assert.equal(validateClientEnvelope({ ...base, nickname }, context).ok, false, `nickname=${JSON.stringify(nickname)}`);
  }
  console.log('coverage: 1 permitted and 7 rejected nickname ingress fixtures');
});

test('leaderboard output remains render-safe for valid hostile-looking strings', () => {
  // The leaderboard lists only players who have answered, so each fixture answers once.
  const leaderboard = computeLeaderboard({
    dev1: { nickname: '<script>alert(1)</script>', score: 100, realityGap: 0.2, answered: 1 },
    dev2: { nickname: '<img src=x onerror=alert(1)>', score: 200, realityGap: 0.1, answered: 1 },
    dev3: { nickname: 'Normal User', score: 150, realityGap: 0.3, answered: 1 },
  } as any);
  const rendered = renderToStaticMarkup(React.createElement('ol', null,
    leaderboard.map((entry: any, index) => React.createElement('li', { key: `${entry.nickname}-${index}` }, entry.nickname)),
  ));
  assert.equal(leaderboard.length, 3);
  assert.doesNotMatch(rendered, /<(?:script|img)(?:\s|>)/i);
  // Control: the same names injected as raw HTML must trip the check, so it cannot pass on output it never saw.
  const unsafe = renderToStaticMarkup(React.createElement('ol', null,
    leaderboard.map((entry: any, index) => React.createElement('li', { key: `raw-${index}`, dangerouslySetInnerHTML: { __html: entry.nickname } })),
  ));
  assert.match(unsafe, /<(?:script|img)(?:\s|>)/i, 'the check catches an unescaped hostile name');
});
