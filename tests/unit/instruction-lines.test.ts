// Clear-ask brief (2026-09-27, the owner): a per-kind instruction line replaces the generic
// "Make your call" on the phone, and gives the stage rebuild a matching line to place.
import test from 'node:test';
import assert from 'node:assert/strict';

import { INSTRUCTION_LINES, kindInstructionLine } from '../../src/engine/instruction-lines';
import { QUESTION_KINDS } from '../../src/engine/kinds';

const NO_SEMICOLON_OR_EM_DASH = /[;—]/;

function everyLine(): string[] {
  const lines: string[] = [];
  for (const kind of QUESTION_KINDS) {
    if (kind === 'which-patient') {
      lines.push(INSTRUCTION_LINES['which-patient'].scenario.phone, INSTRUCTION_LINES['which-patient'].scenario.stage);
      lines.push(INSTRUCTION_LINES['which-patient'].reply.phone, INSTRUCTION_LINES['which-patient'].reply.stage);
      continue;
    }
    lines.push(INSTRUCTION_LINES[kind].phone, INSTRUCTION_LINES[kind].stage);
  }
  return lines;
}

test('every kind in src/engine/kinds.ts has both a phone and a stage instruction line', () => {
  for (const kind of QUESTION_KINDS) {
    if (kind === 'which-patient') {
      for (const variant of ['scenario', 'reply'] as const) {
        const line = INSTRUCTION_LINES['which-patient'][variant];
        assert.ok(line.phone.trim().length > 0, `which-patient (${variant}) carries a phone line`);
        assert.ok(line.stage.trim().length > 0, `which-patient (${variant}) carries a stage line`);
      }
      continue;
    }
    const line = INSTRUCTION_LINES[kind];
    assert.ok(line, `${kind} carries an instruction line`);
    assert.ok(line.phone.trim().length > 0, `${kind} carries a phone line`);
    assert.ok(line.stage.trim().length > 0, `${kind} carries a stage line`);
  }
});

test('no instruction line carries a semicolon or an em dash (VOF-43)', () => {
  const lines = everyLine();
  assert.ok(lines.length >= 10, `the sweep must actually see every line, saw ${lines.length}`);
  for (const line of lines) assert.doesNotMatch(line, NO_SEMICOLON_OR_EM_DASH, line);
});

test('the stage line never tells the room to tap', () => {
  for (const kind of QUESTION_KINDS) {
    if (kind === 'which-patient') {
      for (const variant of ['scenario', 'reply'] as const) {
        assert.doesNotMatch(INSTRUCTION_LINES['which-patient'][variant].stage, /\btap\b/i);
      }
      continue;
    }
    assert.doesNotMatch(INSTRUCTION_LINES[kind].stage, /\btap\b/i);
  }
});

test('kindInstructionLine resolves which-patient by asksForReply, the same split the kicker uses', () => {
  assert.equal(kindInstructionLine({ kind: 'binary' }, 'phone'), INSTRUCTION_LINES.binary.phone);
  assert.equal(kindInstructionLine({ kind: 'binary' }, 'stage'), INSTRUCTION_LINES.binary.stage);
  assert.equal(kindInstructionLine({ kind: 'myth-among-three' }, 'phone'), INSTRUCTION_LINES['myth-among-three'].phone);
  assert.equal(kindInstructionLine({ kind: 'estimate' }, 'stage'), INSTRUCTION_LINES.estimate.stage);
  assert.equal(kindInstructionLine({ kind: 'order' }, 'phone'), INSTRUCTION_LINES.order.phone);
  const scenarioQuestion = { kind: 'which-patient' as const, statement: 'Stepped on a rusty nail. Tetanus booster today?', scenario: 'x' };
  assert.equal(kindInstructionLine(scenarioQuestion, 'phone'), INSTRUCTION_LINES['which-patient'].scenario.phone);
  const replyQuestion = { kind: 'which-patient' as const, reply: true, scenario: 'x' };
  assert.equal(kindInstructionLine(replyQuestion, 'stage'), INSTRUCTION_LINES['which-patient'].reply.stage);
  // An authored-but-unrecognized kind still falls back to binary, the same default questionKind() uses.
  assert.equal(kindInstructionLine({ kind: 'not-a-real-kind' as never }, 'phone'), INSTRUCTION_LINES.binary.phone);
});

test('kindInstructionLine returns a neutral line, not the binary line, when there is no question at all', () => {
  // No questionData loaded yet (review finding, 2026-09-27): this is not "binary", it is nothing.
  // Claiming binary would show True/False controls' copy before any question kind is known.
  assert.equal(kindInstructionLine(null, 'phone'), 'Make your call');
  assert.equal(kindInstructionLine(undefined, 'stage'), 'Make your call');
  assert.equal(kindInstructionLine({}, 'phone'), INSTRUCTION_LINES.binary.phone, 'an empty object is still a question, unlike null/undefined');
});
