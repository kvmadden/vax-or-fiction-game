import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PhoneLayout } from '../../src/phone/PhoneLayout';

test('live phone header keeps its identity and status on one compact row', () => {
  const html = renderToStaticMarkup(
    React.createElement(
      PhoneLayout,
      {
        className: 'phone-live-shell',
        roomCode: 'AUDIT390',
        connectionStatus: 'connected',
        showWakeLockIndicator: false,
      },
      React.createElement('p', null, 'Question'),
    ),
  );

  assert.match(html, /style="[^"]*flex-wrap:nowrap/);
  assert.match(html, /data-role="phone-status-band"[^>]*style="[^"]*flex:1 1 auto/);
  assert.doesNotMatch(html, /data-role="wake-lock-status"/);
  assert.doesNotMatch(html, /font-size:11px/);
});

test('phone identity and game labels keep a 14px text floor', () => {
  // The floor is 14px; the bold phone pass (2026-09-14) raised these labels to 16px, so the test reads the
  // declared size and asserts the floor instead of pinning one value. The critique pass (item 11) replaced the
  // YOU pill (`phone-self-label`) with the name in the app bar (`phone-bar-name`, phone-critique.css).
  const css = ['presentation.css', 'phone-live.css', 'phone-critique.css'].map((name) => fs.readFileSync(new URL(`../../src/styles/${name}`, import.meta.url), 'utf8')).join('\n');
  for (const selector of ['phone-live-shell .phone-bar-name', 'phone-question-kicker', 'phone-team-compact > span']) {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = css.match(new RegExp(`\\.${escaped}\\s*\\{[^}]*font-size:\\s*(\\d+)px`, 's'));
    assert.ok(match, `${selector} declares a px font-size`);
    assert.ok(Number(match[1]) >= 14, `${selector} font-size ${match[1]}px meets the 14px floor`);
  }
});

test('live attendee flow keeps wake lock behavior without exposing a mystery icon', () => {
  const source = fs.readFileSync(new URL('../../src/phone/PhoneSuite.tsx', import.meta.url), 'utf8');
  assert.match(source, /showWakeLockIndicator=\{false\}/);
});
