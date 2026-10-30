// The reply row (2026-09-16): a room phone asks WHICH REPLY IS BETTER? on a spoken-reply question, as the stage and
// solo do. The phone can often tell from the merged statement alone (a quote, or the word reply), so the wire flag
// matters where it cannot. In the shipped bank that is art-of-the-offer q1, whose stem asks for the better way to offer.
import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { SOLO_DECKS } from '../../src/data/decks/topics/index';
import { asksForReply } from '../../src/engine/kinds';
import { projectPublicQuestion } from '../../src/network/projection';
import { PhoneVote } from '../../src/phone/PhoneVote';

test('the host flags a spoken-reply question, and a room phone asks which reply is better from the flag alone', async () => {
  const offer = (await SOLO_DECKS['art-of-the-offer']!()).questions.find((entry) => entry.id === 'q1')!;
  assert.equal(offer.kind, 'which-patient', 'fixture assumption: a which-patient question');
  const questionData = projectPublicQuestion(offer, 's:1:offer-q1', 1, 1).question;
  assert.equal(questionData.reply, true, 'the host flags it on the room wire');
  assert.equal(asksForReply({ kind: questionData.kind, statement: questionData.statement }), false,
    'fixture assumption: the merged statement alone does not read as a spoken reply');

  const flagged = renderToStaticMarkup(React.createElement(PhoneVote, { questionType: 'which-patient', questionData, onSubmit: () => {} }));
  assert.match(flagged, /WHICH REPLY IS BETTER\?/);
  const { reply: _reply, ...unflagged } = questionData;
  const plain = renderToStaticMarkup(React.createElement(PhoneVote, { questionType: 'which-patient', questionData: unflagged, onSubmit: () => {} }));
  assert.doesNotMatch(plain, /WHICH REPLY IS BETTER\?/, 'control: the same question without the flag reads as a plain patient scenario');
});

test('only a which-patient question that asks for a reply carries the flag, and never as false', () => {
  const base = { id: 'fixture', statement: 'A 70-year-old wants a flu shot. What now?', reveal: 'Reveal.', takeaway: 'Takeaway.' };
  const patient = projectPublicQuestion({ ...base, kind: 'which-patient', choices: ['First', 'Second'], bestIndex: 0 }, 's:1:p', 1, 1).question;
  assert.equal('reply' in patient, false, 'a patient scenario with no reply cue sends no key at all');
  const flaggedPatient = projectPublicQuestion({ ...base, kind: 'which-patient', choices: ['First', 'Second'], bestIndex: 0, reply: true }, 's:1:r', 1, 1).question;
  assert.equal(flaggedPatient.reply, true);
  const binary = projectPublicQuestion({ ...base, kind: 'binary', statement: 'Say yes to both shots.', answer: true, reply: true }, 's:1:b', 1, 1).question;
  assert.equal('reply' in binary, false, 'a binary question never carries it, even when its text or source mentions a reply');
});
