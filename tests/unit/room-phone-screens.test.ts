import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { RevealStamp } from '../../src/phone/RevealStamp';
import { LookContext, lookValue, type LookId } from '../../src/looks/look';
import { ShowdownPredict } from '../../src/phone/ShowdownPredict';
import { PhoneClosing } from '../../src/phone/PhoneClosing';
import { REVEAL_MISSED, REVEAL_PENDING, REVEAL_RIGHT } from '../../src/phone/phone-live-copy';
import type { AttendeeState, PublicQuestion, PublicReveal, PublicRoomState, PublicShowdown } from '../../src/network/protocol';

// The room phone's own screens: the stamped result (RevealStamp), the final round (ShowdownPredict) and the podium
// close (ClosingPodium, reached through PhoneClosing). PhoneScreens routes every room result that is not an order, every
// final round and every room close with an attendee to these, so their rules are held here, on the code that runs.

const text = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

const attendee = (overrides: Partial<AttendeeState> = {}): AttendeeState => ({
  sessionId: 's1', registered: true, nickname: 'Avery', team: null, vote: null, result: null,
  score: 350, correct: 3, answered: 3, accuracy: 100, bestStreak: 3, rank: 2, totalParticipants: 8, commitments: [],
  ...overrides,
});

const binary: PublicQuestion = {
  id: 'q-binary', questionInstanceId: 'inst-1', kind: 'binary',
  statement: 'Vaccination prevents disease transmission.',
  options: [{ token: 'true', label: 'TRUE', text: 'True' }, { token: 'false', label: 'FALSE', text: 'False' }],
} as PublicQuestion;
const binaryReveal: PublicReveal = { answerLabel: 'TRUE', answerToken: 'true', explanation: 'Why.', takeaway: 'Takeaway.', citations: [] };

const stamp = (props: Partial<React.ComponentProps<typeof RevealStamp>> = {}) => renderToStaticMarkup(React.createElement(RevealStamp, {
  reveal: binaryReveal, question: binary, attendee: attendee(), onReaction: () => {}, ...props,
}));

test('the stamped result shows your standing when the room ranks you, and nothing when it does not', () => {
  const ranked = stamp({ attendee: attendee({ result: { questionInstanceId: 'inst-1', choice: 'true', isCorrect: true, points: 100 } }) });
  assert.match(ranked, /data-role="phone-reveal-score-bar"/);
  assert.match(text(ranked), /Score 350/);
  assert.match(text(ranked), /Rank #2 of 8/);
  for (const unranked of [attendee({ rank: null }), attendee({ totalParticipants: 0 }), attendee({ rank: 0 })]) {
    assert.doesNotMatch(stamp({ attendee: unranked }), /data-role="phone-reveal-score-bar"/);
  }
});

test('a right answer shows its points and a streak bonus pill, and a miss shows no points at all', () => {
  const streak = stamp({ attendee: attendee({ result: { questionInstanceId: 'inst-1', choice: 'true', isCorrect: true, points: 150, streakBonus: 50 } }) });
  assert.match(streak, /data-role="phone-reveal-points"[^>]*><span class="stamp-points__sign">\+<\/span>150</);
  assert.match(streak, /<span class="sr-only">150 points<\/span>/);
  assert.match(streak, /data-role="streak-bonus-pill"[^>]*>\+50 Streak Bonus!</);
  assert.ok(streak.includes(REVEAL_RIGHT.replace("'", '&#x27;')), 'the right-answer line shows');
  for (const streakBonus of [0, undefined]) {
    const plain = stamp({ attendee: attendee({ result: { questionInstanceId: 'inst-1', choice: 'true', isCorrect: true, points: 150, streakBonus } }) });
    assert.match(plain, /data-role="phone-reveal-points"/);
    assert.doesNotMatch(plain, /data-role="streak-bonus-pill"/);
  }
  const miss = stamp({ attendee: attendee({ result: { questionInstanceId: 'inst-1', choice: 'false', isCorrect: false, points: 0 } }) });
  assert.ok(miss.includes(REVEAL_MISSED));
  assert.doesNotMatch(miss, /data-role="phone-reveal-points"|streak-bonus-pill/);
  assert.doesNotMatch(text(miss), /points|pts/i, 'a miss never says points');
  assert.match(miss, /class="stamp-miss__label">Your answer</);
});

test('a result from another question, or a vote with no result yet, reads as pending, never as right or missed', () => {
  const stale = stamp({ attendee: attendee({ result: { questionInstanceId: 'inst-0', choice: 'true', isCorrect: true, points: 100 } }) });
  assert.match(stale, /data-role="phone-reveal" data-screen="result" data-outcome="pending"/);
  assert.ok(stale.includes(REVEAL_PENDING));
  assert.doesNotMatch(stale, /data-role="phone-reveal-points"/);
  const voted = stamp({ attendee: attendee({ vote: { questionInstanceId: 'inst-1', choice: 'true', conviction: 'fairly-sure' } as AttendeeState['vote'] }) });
  assert.match(voted, /data-outcome="pending"/);
  assert.ok(voted.includes(REVEAL_PENDING));
});

test('a lettered result names its verdict in words, and the stamped letter stays out of the screen reader', () => {
  const patient = { ...binary, kind: 'which-patient', statement: 'Which reply is better?\n\nA patient says they are covered.',
    options: [{ token: 'a', label: 'A', text: 'You are all set.' }, { token: 'b', label: 'B', text: 'Having had it does not protect you going forward.' }] } as PublicQuestion;
  const html = stamp({ question: patient, reveal: { ...binaryReveal, answerLabel: 'Better reply · B', answerToken: 'b' } });
  assert.match(html, /data-role="canonical-verdict"[^>]*><span class="sr-only">B · <\/span>Having had it does not protect you going forward\.</);
  assert.match(html, /class="stamp-mark" aria-hidden="true"[^>]*>B</);
  assert.equal(html.split('data-role="canonical-verdict"').length, 2, 'one verdict element');
  const binaryHtml = stamp();
  assert.match(binaryHtml, /class="stamp-mark" data-role="canonical-verdict"[^>]*>TRUE</);
});

// Case file stamps a true or false verdict with the show's own pair on the big screen (VOF-93), and a phone that wears Case file says
// the same on its stamp. The answer itself stays TRUE or FALSE for a reader, and nothing else changes in any other look or kind.
const stampIn = (look: LookId, props: Partial<React.ComponentProps<typeof RevealStamp>> = {}) => renderToStaticMarkup(
  React.createElement(LookContext.Provider, { value: lookValue(look, look === 'today' ? '' : `?look=${look}`) }, React.createElement(RevealStamp, {
    reveal: binaryReveal, question: binary, attendee: attendee(), onReaction: () => {}, ...props,
  })),
);

test('a phone in Case file stamps FACT or FICTION like the big screen, with the answer word kept for a reader, and no other look or kind changes', () => {
  const fact = stampIn('casefile');
  assert.match(fact, /class="stamp-mark" data-role="canonical-verdict"[^>]*style="--look-stamp-len:4"[^>]*><span aria-hidden="true">FACT<\/span><span class="sr-only">TRUE<\/span><\/span>/, 'a true claim is fact, in four letters');
  const fiction = stampIn('casefile', { reveal: { ...binaryReveal, answerLabel: 'FALSE', answerToken: 'false' } });
  assert.match(fiction, /class="stamp-mark" data-role="canonical-verdict"[^>]*style="--look-stamp-len:7"[^>]*><span aria-hidden="true">FICTION<\/span><span class="sr-only">FALSE<\/span><\/span>/, 'a false one is fiction, and the stamp is sized to its seven letters');
  assert.equal(fact.split('data-role="canonical-verdict"').length, 2, 'still one verdict element');
  assert.equal(fact.match(/<span class="sr-only">TRUE<\/span>/g)?.length, 1, 'the answer word is there once, for a reader');
  for (const look of ['today', 'studio', 'seventies'] as const) {
    assert.match(stampIn(look), /class="stamp-mark" data-role="canonical-verdict"[^>]*>TRUE</, `${look} keeps TRUE on its stamp`);
    assert.doesNotMatch(stampIn(look), /FACT|FICTION/, `${look} never says FACT or FICTION`);
  }
  const estimate = { ...binary, kind: 'estimate', statement: 'What share of adults got the vaccine?',
    options: [{ token: 'a', label: 'Under 45%', text: 'Under 45%' }, { token: 'b', label: '45–60%', text: '45–60%' }] } as PublicQuestion;
  assert.match(stampIn('casefile', { question: estimate, reveal: { ...binaryReveal, answerLabel: '52%', answerToken: 'b' } }), /class="stamp-mark" data-role="canonical-verdict"[^>]*>52%</, 'a number is still stamped as the number');
  const patient = { ...binary, kind: 'which-patient', statement: 'Which reply is better?\n\nA patient says they are covered.',
    options: [{ token: 'a', label: 'A', text: 'You are all set.' }, { token: 'b', label: 'B', text: 'Having had it does not protect you going forward.' }] } as PublicQuestion;
  const lettered = stampIn('casefile', { question: patient, reveal: { ...binaryReveal, answerLabel: 'Better reply · B', answerToken: 'b' } });
  assert.match(lettered, /class="stamp-mark" aria-hidden="true"[^>]*>B</, 'a lettered reply is still stamped with its letter');
  assert.doesNotMatch(lettered, /FACT|FICTION/);
});

test('an estimate result says which range held the answer', () => {
  const estimate = { ...binary, kind: 'estimate', statement: 'What share of adults got the vaccine?',
    options: [{ token: 'a', label: 'Under 45%', text: 'Under 45%' }, { token: 'b', label: '45–60%', text: '45–60%' }] } as PublicQuestion;
  const html = stamp({ question: estimate, reveal: { ...binaryReveal, answerLabel: '52%', answerToken: 'b' } });
  assert.match(html, /class="stamp-mark" data-role="canonical-verdict"[^>]*>52%</);
  assert.match(html, /data-role="phone-verdict-detail">In the <span class="keep-compound">45–60%<\/span> range</);
});

const finalists = [
  { ticket: 'ticket-a', name: 'Riley', score: 420, duelPoints: 0 },
  { ticket: 'ticket-b', name: 'Sam', score: 380, duelPoints: 0 },
];
const showdown = (overrides: Partial<PublicShowdown> = {}): PublicShowdown => ({
  id: 'room:showdown', stage: 'lineup', finalists, predictions: { 'ticket-a': 987, 'ticket-b': 654 }, question: null, winner: null, ...overrides,
});
const duel = (props: Partial<React.ComponentProps<typeof ShowdownPredict>> = {}) => renderToStaticMarkup(React.createElement(ShowdownPredict, {
  showdown: showdown(), attendee: attendee({ nickname: 'Riley', rank: 1 }), onPredict: () => {}, ...props,
}));

test('a finalist sees YOU on their own slab, and nobody else is tagged', () => {
  const html = duel();
  assert.equal(html.split('class="you-chip"').length, 2, 'exactly one YOU tag');
  assert.match(html, /data-finalist="ticket-a"[\s\S]*?Riley[\s\S]*?class="you-chip">You</);
  // Third place with a finalist's name is not that finalist.
  assert.doesNotMatch(duel({ attendee: attendee({ nickname: 'Riley', rank: 3 }) }), /you-chip/);
  // Tickets carry no device link (VOF-12), so a name two finalists share tags no one.
  const shared = showdown({ finalists: [{ ...finalists[0]! }, { ...finalists[1]!, name: 'Riley' }] });
  assert.doesNotMatch(duel({ showdown: shared }), /you-chip/);
  assert.doesNotMatch(duel({ attendee: null }), /you-chip/);
});

test('the final round never shows the prediction counts on the wire', () => {
  for (const stage of ['lineup', 'duel', 'result'] as const) {
    const html = duel({ showdown: showdown({ stage, winner: stage === 'result' ? 'ticket-a' : null }) });
    assert.doesNotMatch(text(html), /987|654/, `${stage}: no prediction count`);
  }
  assert.match(text(duel()), /Points 420/);
  assert.match(text(duel({ showdown: showdown({ stage: 'duel', finalists: [{ ...finalists[0]!, duelPoints: 60 }, { ...finalists[1]!, duelPoints: 40 }] }) })), /Duel points 60/);
});

test('a pick is acknowledged once it is made, and the slabs stop taking taps once the duel starts', () => {
  const store = new Map<string, string>();
  const previous = (globalThis as { sessionStorage?: unknown }).sessionStorage;
  (globalThis as { sessionStorage?: unknown }).sessionStorage = {
    getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => { store.set(key, value); }, removeItem: (key: string) => { store.delete(key); },
  };
  try {
    assert.match(duel(), /class="answer-dock__status" aria-live="polite">Make your call</);
    store.set('vof-showdown-pick:room:showdown', 'ticket-b');
    const picked = duel();
    assert.match(picked, /data-role="phone-showdown-pick-ack"[^>]*>Your pick is in\. You can change it until the duel starts\./);
    assert.match(picked, /data-finalist="ticket-b"[^>]*data-selected="true"/);
    assert.doesNotMatch(picked, /data-finalist="ticket-a"[^>]*data-selected="true"/);
    const started = duel({ showdown: showdown({ stage: 'duel' }) });
    assert.equal((started.match(/<button[^>]*data-finalist=[^>]*disabled=""/g) ?? []).length, 2, 'no pick once the duel starts');
  } finally {
    (globalThis as { sessionStorage?: unknown }).sessionStorage = previous;
  }
});

const closingRoom = (overrides: Partial<PublicRoomState> = {}): PublicRoomState => ({
  roomId: 'ROOM42', phase: 'closing',
  reveal: { answerLabel: 'The room got 80% right.', answerToken: 'closing', explanation: 'Key learnings', takeaway: 'One.\nTwo.', citations: [] },
  leaderboard: [
    { name: 'ChampionAlex', score: 2450, rank: 1, team: null },
    { name: 'Avery', score: 1200, rank: 2, team: null },
    { name: 'Blake', score: 900, rank: 3, team: null },
  ],
  ...overrides,
} as PublicRoomState);

test('a room phone closes on the podium, second, first, third, with your place tagged and one way on', () => {
  const html = renderToStaticMarkup(React.createElement(PhoneClosing, { attendee: attendee({ rank: 2, totalParticipants: 5, correct: 8, answered: 10, bestStreak: 4 }), room: closingRoom() }));
  assert.match(html, /data-role="phone-closing" class="podium-close"/);
  const places = [...html.matchAll(/data-place="(\d)"/g)].map((match) => match[1]);
  assert.deepEqual(places, ['2', '1', '3'], 'the podium stands second, first, third');
  assert.match(html, /data-place="1"[^>]*>[\s\S]*?ChampionAlex[\s\S]*?2450/);
  assert.match(html, /data-place="2" data-you="true"/);
  assert.equal(html.split('class="you-chip"').length, 2, 'one YOU tag');
  assert.match(text(html), /You placed #2 of 5 \(8 of 10 right · Best streak 4\)/);
  assert.match(html, /<a class="podium-close__play" href="\/play" data-action="closing-play-solo">Play on your own<\/a>/);
  assert.doesNotMatch(html, /phone-closing-champion-banner/, 'the podium carries the champion');
  // A device with no attendee state keeps the empty close.
  assert.match(renderToStaticMarkup(React.createElement(PhoneClosing, { attendee: null, room: closingRoom() })), /data-role="phone-closing-empty"/);
});
