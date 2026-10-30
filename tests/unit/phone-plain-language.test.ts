import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PhoneClosing } from '../../src/phone/PhoneClosing';
import { PhoneReveal } from '../../src/phone/PhoneReveal';
import type { AttendeeState, PublicRoomState } from '../../src/network/protocol';

const attendee: AttendeeState = {
  sessionId: 'session', registered: true, nickname: 'Avery', team: null,
  vote: null, result: null, score: 24, correct: 12, answered: 20,
  accuracy: 60, bestStreak: 4, rank: 1, totalParticipants: 2, commitments: [],
};
const room = { roomId: 'ROOM42', phase: 'closing', reveal: {
  answerLabel: 'The room got 21% right.', answerToken: 'closing', explanation: 'Three to take back to the counter',
  takeaway: 'HPV cancer is not only cervical cancer.\nA product preference should not cost a vaccination opportunity.\nHaving had it is not the same as being covered.',
  citations: [],
} } as PublicRoomState;

// 2026-09-14 design critique, item 9: the phone ends on the room line, one personal sentence and the same three
// takeaways as the stage; no points, no private stat tiles (VOF-12, VOF-22). Placement stays only when the
// facilitator turned rankings on (rank is null otherwise).
test('phone closing leads with the room line, one personal sentence and the takeaways, never points', () => {
  const html = renderToStaticMarkup(React.createElement(PhoneClosing, { attendee, room }));
  const text = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
  assert.match(text, /The room got 21% right\./);
  // The denominator is answers submitted, not questions asked: a participant who skipped some must not read
  // "3 of 8" as "of 8 questions" right after "The room got 21% right".
  assert.match(text, /You won 1st Place!/);
  assert.doesNotMatch(text, /You: \d+ of \d+/);
  assert.match(text, /Three to take back to the counter/);
  assert.equal((html.match(/data-role="phone-closing-takeaway"/g) ?? []).length, 3);
  assert.match(text, /HPV cancer is not only cervical cancer\./);
  assert.doesNotMatch(text, /points|Your accuracy|Total score|Your game results|Longest correct run/i);
  assert.doesNotMatch(html, />PTS<\/span>|Rank #/i);
  assert.doesNotMatch(html, /text-xs|text-sm/);

  const runnerUpHtml = renderToStaticMarkup(React.createElement(PhoneClosing, { attendee: { ...attendee, rank: 2 }, room }));
  const runnerUpText = runnerUpHtml.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
  assert.match(runnerUpText, /You placed #2 of 2 \(12 of 20 right · Best streak 4\)/);
});

test('phone closing without a closing reveal still reads as a thank-you, not a score', () => {
  const html = renderToStaticMarkup(React.createElement(PhoneClosing, { attendee: { ...attendee, answered: 0, correct: 0, bestStreak: 0, rank: null }, room: { roomId: 'ROOM42', phase: 'closing', reveal: null } as PublicRoomState }));
  const text = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
  assert.match(text, /Thanks for playing\./);
  assert.match(text, /You did not answer this time\./);
  assert.doesNotMatch(html, /phone-closing-takeaway"/);
  assert.doesNotMatch(text, /points|\d+%/);
});

test('phone waiting states avoid registration and facilitator jargon', () => {
  const source = fs.readFileSync(new URL('../../src/phone/PhoneSuite.tsx', import.meta.url), 'utf8');
  const seat = fs.readFileSync(new URL('../../src/phone/LobbySeat.tsx', import.meta.url), 'utf8');
  const copy = fs.readFileSync(new URL('../../src/phone/phone-live-copy.ts', import.meta.url), 'utf8');
  assert.match(source, /HOST_DOWN_STAY/);
  assert.match(copy, /The presenter's screen dropped\. Stay here\. This page tries again in about 5 seconds\./);
  assert.doesNotMatch(source, /reconnect to continue/);
  // Critique item 23 (2026-09-14): the post-Join screen greets by name, then one line. The seat carries the wait's
  // own kicker ("You're in"), the player's name, and the wait's one line, all from phone-wait.ts.
  assert.match(seat, /\{kicker\}<\/p>\s*\{name \? <h2 className="seat-who__name">\{name\}<\/h2> : null\}\s*<p className="lobby-seat__line">\{line\}<\/p>/);
  assert.match(source, /phoneAudienceWait\(roomState\)/);
  assert.match(source, /phoneAudienceWait\(\{ question: 'instructions' \}\)/);
  for (const text of [source, seat]) assert.doesNotMatch(text, /Your registration is saved|You are registered|facilitator/i);
});

test('phone showdown labels describe the final round in plain language', () => {
  const source = fs.readFileSync(new URL('../../src/phone/ShowdownPredict.tsx', import.meta.url), 'utf8');
  assert.match(source, /Final round/);
  assert.match(source, /The final round is underway/);
  assert.match(source, /The final round ended in a tie\./);
  assert.doesNotMatch(source, /Showdown ·|The duel is underway|Who wins the showdown\?|The showdown ended in a tie\./);
  assert.match(source, /const chosen = picked === finalist\.ticket;/);
  assert.match(source, /data-selected=\{picked \? \(chosen \? 'true' : 'false'\) : undefined\}/, 'a tap marks the picked finalist');
  assert.match(source, /Your pick is in\. You can change it until the duel starts\./);
});

test('phone reveal reactions use emoji as the visible UI with short aria labels', () => {
  const html = renderToStaticMarkup(React.createElement(PhoneReveal, {
    presentation: 'explanation',
    reveal: {
      answerLabel: 'TRUE',
      explanation: 'A short explanation.',
      takeaway: 'Good to know.',
      citations: [],
    },
    attendee,
    onReaction: () => {},
  }));

  assert.match(html, /aria-label="Knew it"/);
  assert.match(html, /aria-label="Surprised me"/);
  assert.match(html, /aria-label="We do this"/);
  assert.match(html, />🤓</);
  assert.match(html, />😲</);
  assert.match(html, />🔥</);
  assert.doesNotMatch(html, />Knew it</);
  assert.doesNotMatch(html, />wait really<|>applause<|>Helpful</i);
});

for (const scenario of [
  { name: 'falls back to one explanation when takeaway is absent', takeaway: '', explanation: 'The explanation.', expected: ['The explanation.'] },
  { name: 'retains a distinct takeaway and explanation', takeaway: 'The takeaway.', explanation: 'The explanation.', expected: ['The takeaway.', 'The explanation.'] },
  { name: 'deduplicates identical takeaway and explanation', takeaway: 'The same teaching.', explanation: 'The same teaching.', expected: ['The same teaching.'] },
]) {
  test(`phone reveal teaching ${scenario.name}`, () => {
    const html = renderToStaticMarkup(React.createElement(PhoneReveal, {
      presentation: 'explanation',
      reveal: { answerLabel: 'TRUE', answerToken: 'true', takeaway: scenario.takeaway, explanation: scenario.explanation, citations: [] },
      attendee: null,
    }));
    const card = html.match(/<section data-role="takeaway-card"[^>]*>([\s\S]*?)<\/section>/)?.[1];
    assert.ok(card, 'the rendered teaching card is present');
    const paragraphs = [...card.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/g)].map(match => match[1]);
    assert.deepEqual(paragraphs, scenario.expected, 'each distinct teaching message renders exactly once, in order');
  });
}
