import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { advance, back } from '../../src/engine/state-machine';
import { useGameStore } from '../../src/store/game-store';
import { projectGameState } from '../../src/network/game-projection';
import { validatePublicRoomState } from '../../src/network/guards';
import { Question } from '../../src/screens/Question';
import { kindOptions } from '../../src/engine/kinds';
import type { GameState, Question as QuestionData } from '../../src/data/types';

const question: QuestionData = { id: 'dedicated-screen', type: 'question', kind: 'which-patient',
  statement: 'Which action fits the fictional scenario?', choices: ['First action', 'Correct action', 'Third action'], bestIndex: 1,
  reveal: 'A complete explanation with its necessary condition.', takeaway: 'A useful teaching point.' };

test('result and explanation are consecutive shared phases before the next question', () => {
  const state = { ...useGameStore.getInitialState(), run: [question, { ...question, id: 'second' }], slideIndex: 0, phase: 'revealed' } as unknown as GameState;
  assert.deepEqual(advance(state), { phase: 'explaining', direction: 'forward' });
  assert.deepEqual(back({ ...state, phase: 'explaining' }), { phase: 'revealed', direction: 'backward' });
  assert.deepEqual(advance({ ...state, phase: 'explaining' }), { slideIndex: 1, phase: 'entering', direction: 'forward' });
});

test('explanation uses existing reveal fields; open and locked phases still reject answer data', () => {
  const state = { ...useGameStore.getInitialState(), run: [question], slideIndex: 0, phase: 'explaining', votesLocked: true } as ReturnType<typeof useGameStore.getState>;
  const { roomState } = projectGameState(state, 'TEST', 1);
  assert.equal(roomState.reveal?.explanation, question.reveal);
  assert.deepEqual(Object.keys(roomState.reveal!).sort(), ['answerLabel', 'answerToken', 'citations', 'explanation', 'takeaway']);
  assert.equal(validatePublicRoomState(roomState), true);
  for (const phase of ['entering', 'deliberating', 'locked'] as const) {
    assert.equal(projectGameState({ ...state, phase }, 'TEST', 2).roomState.reveal, null);
    assert.equal(validatePublicRoomState({ ...roomState, phase }), false, `${phase} rejects a forged reveal`);
  }
});

test('main result contains the canonical answer while explanation has a dedicated screen', () => {
  const result = renderToStaticMarkup(React.createElement(Question, { question, phase: 'revealed', autoDeliberateDelayMs: 0 }));
  assert.match(result, /data-stage-beat="result"/);
  assert.match(result, /Correct action/);
  assert.doesNotMatch(result, /data-role="stage-explanation"/);
  assert.equal(result.includes(question.reveal!), false, 'result has no hidden full-explanation shortcut');
  const explanation = renderToStaticMarkup(React.createElement(Question, { question, phase: 'explaining', autoDeliberateDelayMs: 0 }));
  assert.match(explanation, /data-stage-beat="explanation"/);
  assert.match(explanation, /data-role="stage-explanation"/);
  assert.ok(explanation.includes(question.reveal!));
  assert.ok(explanation.includes(question.takeaway!));
  assert.doesNotMatch(explanation, /class="answer-rail/);
});

test('the result distribution says "1 vote", never "1 votes", including in accessible names', () => {
  const tokens = (kindOptions(question) ?? []).map((option) => option.token);
  assert.equal(tokens.length, 3, 'the fixture has three options');
  const votes = { [tokens[0]]: 1, [tokens[1]]: 2, [tokens[2]]: 0 };
  const html = renderToStaticMarkup(React.createElement(Question, { question, phase: 'revealed', autoDeliberateDelayMs: 0, interactionMode: 'polling', votes }));
  assert.match(html, /data-role="result-distribution"/, 'the distribution renders, so the checks below are not vacuous');
  assert.match(html, />1 vote</, 'one vote reads singular');
  assert.match(html, />2 votes</, 'two votes read plural');
  assert.match(html, />0 votes</, 'zero votes read plural');
  assert.doesNotMatch(html, /\b1 votes\b/, 'no "1 votes" anywhere, including aria-labels');
});
