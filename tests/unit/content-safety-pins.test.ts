// VOF-74 (content fix round 2, item 1): tdap q8's batch 2 patient line named the trigger as "a very
// large swelling reaction to a tetanus shot", with no mention of Arthus. Read literally, that line would
// lead a person with ordinary extensive limb swelling (a condition under which the vaccine may still be
// given, MMWR 67(RR-2) 2018, Table 3) to skip a needed wound dose. This pins the corrected line, sourced
// from a local evidence file, and fails if the old, unsafe wording returns.
import assert from 'node:assert/strict';
import test from 'node:test';
import { tdapDeck } from '../../src/data/decks/topics/tdap';

const SAFE_LINE = 'Because you had a rare, severe reaction called an Arthus reaction to a tetanus shot, we wait at least 10 years before your next one, even if you get a wound.';
const UNSAFE_LINE = 'After a very large swelling reaction to a tetanus shot, we wait at least 10 years before your next one.';

test('tdap q8 patient line names the Arthus reaction, not a bare "large swelling" trigger (safety correction)', () => {
  const q8 = tdapDeck.questions.find((question) => question.id === 'q8')!;
  assert.equal(q8.patientConversation, SAFE_LINE, 'q8.patientConversation must be the Arthus-named safety correction');
  assert.notEqual(q8.patientConversation, UNSAFE_LINE, 'the refuted "very large swelling" trigger must never ship again');
  assert.match(q8.patientConversation!, /Arthus reaction/, 'the patient-facing line must name the actual trigger, not a symptom a non-Arthus reaction can also cause');
});
