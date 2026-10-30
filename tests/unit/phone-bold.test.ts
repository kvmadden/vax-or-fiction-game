import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PhoneVote } from '../../src/phone/PhoneVote';
import { ShowWordmark } from '../../src/components/show/ShowWordmark';
import type { PublicQuestion } from '../../src/network/protocol';

const binary: PublicQuestion = {
  id: 'bold-binary', questionInstanceId: 'run:0:bold-binary', kind: 'binary', statement: 'Synthetic statement.', number: 1, total: 1,
  options: [{ token: 'false', label: 'FALSE', text: '' }, { token: 'true', label: 'TRUE', text: '' }],
};

test('binary phone vote renders TRUE on the left and FALSE on the right, matching the stage rail', () => {
  const html = renderToStaticMarkup(React.createElement(PhoneVote, { questionType: 'binary', questionData: binary, onSubmit: () => {} }));
  const truePos = html.indexOf('data-choice="true"');
  const falsePos = html.indexOf('data-choice="false"');
  assert.ok(truePos !== -1 && falsePos !== -1, 'both binary choices render');
  assert.ok(truePos < falsePos, `TRUE (${truePos}) must precede FALSE (${falsePos}) even when the projected options list FALSE first`);
});

test('the default show wordmark output is unchanged by the stacked variant', () => {
  const inline = renderToStaticMarkup(React.createElement(ShowWordmark));
  assert.doesNotMatch(inline, /show-wordmark--stacked/);
  assert.match(inline, /class="show-wordmark" data-show-wordmark/);
});

test('the waiting screen carries no mark of its own: the bar\'s stacked mark is the one mark (critique item 23)', async () => {
  // Until 2026-09-14 the wait card drew a second stacked wordmark 8px under the bar's compact one; the critique
  // (item 23, one mark per screen) moved the classic's stacked mark into the bar once a participant is registered.
  // The post-Join screen is the seat: the wait's kicker, the player's name, then one line.
  const { Waiting } = await import('../../src/phone/PhoneSuite');
  const { LobbySeat } = await import('../../src/phone/LobbySeat');
  const html = renderToStaticMarkup(React.createElement(LobbySeat, { kicker: "You're in", line: 'Watch the big screen. Then this phone is your clicker.', name: 'Maria', participants: 12 }));
  assert.doesNotMatch(html, /show-wordmark/);
  assert.match(html, />You(?:'|&#x27;)re in<\/p><h2 class="seat-who__name">Maria<\/h2><p class="lobby-seat__line">Watch the big screen\. Then this phone is your clicker\.<\/p>/);
  assert.doesNotMatch(renderToStaticMarkup(React.createElement(Waiting, { message: 'Waiting for the next question.' })), /show-wordmark/);
});

test('the linked join screen leads with the stacked wordmark above the name card', async () => {
  const { PhoneJoin } = await import('../../src/phone/PhoneJoin');
  const html = renderToStaticMarkup(React.createElement(PhoneJoin, { initialRoomCode: 'ROOM42' }));
  const mark = html.indexOf('show-wordmark--stacked');
  const card = html.indexOf('class="phone-name-card"');
  assert.ok(mark !== -1 && card !== -1 && mark < card, 'stacked wordmark precedes the name card');
});

test('a phone with no room in the address gets a plain code-entry screen that sends it to the room', async () => {
  const { PhoneJoin } = await import('../../src/phone/PhoneJoin');
  const html = renderToStaticMarkup(React.createElement(PhoneJoin, { initialRoomCode: '' }));
  assert.match(html, /data-role="room-code-input"/);
  assert.doesNotMatch(html, /data-role="code-slot-0"/, 'no four-slot tiles');
  assert.doesNotMatch(html, /<button(?=[^>]*data-role="join-submit-btn")(?=[^>]*disabled)[^>]*>/, 'Join stays enabled; the code is checked on submit');
  assert.doesNotMatch(html, /Device ID|facilitator|relay|registration/i);
});

test('the accepted choice reads as the participant saw it', async () => {
  const { describeChoice } = await import('../../src/phone/choice-label');
  const options = [{ token: 'a', label: 'A', text: 'Two doses.' }, { token: 'b', label: 'Under 45%', text: '' }];
  assert.equal(describeChoice('true', options), 'TRUE');
  assert.equal(describeChoice('a', options), 'A · Two doses.');
  assert.equal(describeChoice('b', options), 'Under 45%');
  assert.equal(describeChoice('c', options), 'C');
});
