// Review follow-up (2026-09-15): spokenReplyText never doubles or pads quotes, and blank text stays blank.
import test from 'node:test';
import assert from 'node:assert/strict';
import type { Question } from '../../src/data/types';
import { spokenReplyText } from '../../src/engine/kinds.ts';

const reply = { kind: 'which-patient', statement: 'Which reply is better?' } as unknown as Partial<Question>;
const quotedScenario = { kind: 'which-patient', scenario: 'A patient asks, “Do I still need it?”' } as unknown as Partial<Question>;
const patient = { kind: 'which-patient', statement: 'Which adult should be offered RSV vaccine?' } as unknown as Partial<Question>;

test('a spoken reply gets one pair of curly quotes, whether the statement or a quoted scenario asks for it', () => {
  assert.equal(spokenReplyText(reply, 'The vaccine still helps.'), '“The vaccine still helps.”');
  assert.equal(spokenReplyText(quotedScenario, 'Yes, it still helps.'), '“Yes, it still helps.”');
});

test('patient vignettes stay bare', () => {
  assert.equal(spokenReplyText(patient, 'Age 66, has COPD, never had an RSV vaccine.'), 'Age 66, has COPD, never had an RSV vaccine.');
});

test('blank text stays blank instead of becoming an empty pair of quotes', () => {
  assert.equal(spokenReplyText(reply, ''), '');
  assert.equal(spokenReplyText(reply, '   '), '   ');
});

test('authored quotes of any kind are never doubled', () => {
  for (const text of ['“Already quoted.”', '"Straight quotes."', '“Mixed pair."', '‘Single quotes.’', 'Say, “this line.”']) {
    assert.equal(spokenReplyText(reply, text), text, text);
  }
});

test('padding stays outside the quotes', () => {
  assert.equal(spokenReplyText(reply, '  The vaccine still helps.  '), '“The vaccine still helps.”');
});
