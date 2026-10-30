import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Question } from '../../src/data/types';
import { projectPublicQuestion, projectPublicReveal, validatePublicRoomState } from '../../src/network/projection';
import { PhoneReveal } from '../../src/phone/PhoneReveal';

const source: Question = {
  id: 'order-reveal-test', kind: 'order', statement: 'Put the steps in order.',
  steps: ['Explain the plan.', 'Ask for their understanding.', 'Clarify <the gap>.'],
  reveal: 'Use the conversation to check understanding.', takeaway: 'Listen, then clarify.',
};
const room = {
  version: 1, roomId: 'TEST', sessionId: 'test-session', revision: 1,
  phase: 'revealed', slideIndex: 0, slideCount: 1, question: source.id,
  questionData: projectPublicQuestion(source, 'instance-1', 1, 1).question,
  votesLocked: true, timerSeconds: 0, timerDurationSeconds: 0, timerRunning: false,
  participants: 1, teamScores: null, leaderboard: [], showdown: null, hostConnected: true,
};

test('phone reveal displays each canonical step in the right order', () => {
  const reveal = projectPublicReveal(source);
  const html = renderToStaticMarkup(React.createElement(PhoneReveal, { presentation: 'result', reveal, question: room.questionData, attendee: null }));
  const list = html.match(/<ol\b[^>]*data-role="correct-order"[^>]*>([\s\S]*?)<\/ol>/)?.[1];
  assert.ok(list, 'the correct sequence is visible, not just an order label');
  const items = [...list.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/g)].map(match => match[1]);
  assert.deepEqual(items, ['Explain the plan.', 'Ask for their understanding.', 'Clarify &lt;the gap&gt;.']);
  assert.equal(validatePublicRoomState({ ...room, reveal }, 'TEST'), true);
});

test('the numbered answer keeps the existing relay shape and stays behind reveal', () => {
  const reveal = projectPublicReveal(source);
  assert.deepEqual(Object.keys(reveal).sort(), ['answerLabel', 'answerToken', 'citations', 'explanation', 'takeaway']);
  assert.equal(reveal.explanation, `1. Explain the plan.\n2. Ask for their understanding.\n3. Clarify <the gap>.\n\n${source.reveal}`);
  assert.equal(validatePublicRoomState({ ...room, reveal }, 'TEST'), true);
  assert.equal(validatePublicRoomState({ ...room, phase: 'deliberating', reveal }, 'TEST'), false);
  assert.equal(validatePublicRoomState({ ...room, reveal: { ...reveal, orderedSteps: source.steps } }, 'TEST'), false);
});

test('unrecognized order explanation keeps every word instead of extracting a partial sequence', () => {
  const explanation = '1. Explain.\n3. Clarify.\n\nThe original teaching.';
  const html = renderToStaticMarkup(React.createElement(PhoneReveal, {
    presentation: 'explanation', reveal: { ...projectPublicReveal(source), explanation }, question: room.questionData, attendee: null,
  }));
  assert.doesNotMatch(html, /data-role="correct-order"/);
  assert.ok(html.includes(explanation));
});

test('ordinary binary reveals retain their existing shape', () => {
  const reveal = projectPublicReveal({ id: 'binary-reveal-test', kind: 'binary', statement: 'A statement.', answer: true, reveal: 'Why it is true.' });
  assert.equal(Object.hasOwn(reveal, 'orderedSteps'), false);
  assert.equal(validatePublicRoomState({ ...room, reveal }, 'TEST'), true);
});

test('phone order acknowledgement names submitted steps, never opaque public tokens', async () => {
  const { PhoneVote } = await import('../../src/phone/PhoneVote');
  const question = {
    ...room.questionData,
    kind: 'order' as const,
    options: [],
    steps: [
      { token: 's9a', text: 'First authored step.' },
      { token: 's8b', text: 'Second authored step.' },
      { token: 's7c', text: 'Third authored step.' },
    ],
  };
  const html = renderToStaticMarkup(React.createElement(PhoneVote, {
    questionType: 'order', questionData: question, initialVote: 's8b-s9a-s7c', onSubmit: () => {},
  }));
  assert.match(html, /data-role="phone-choice-receipt"[\s\S]*<ol class="phone-receipt-order"><li>Second authored step\.<\/li><li>First authored step\.<\/li><li>Third authored step\.<\/li><\/ol>/);
  assert.doesNotMatch(html, />S8B-S9A-S7C</, 'the receipt does not expose the public transport token');
});
