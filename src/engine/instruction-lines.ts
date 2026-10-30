/**
 * Per-kind instruction lines (clear-ask brief, 2026-09-27, the owner). The big text now asks a real
 * question (content/editorial/stems.json), so the line right above the answers no longer has to
 * carry the whole task by itself. This module is the one copy source for that line: a phone line
 * (may say "tap") and a big-screen line (never says "tap", it addresses the room). No semicolons or
 * em dashes (VOF-43).
 *
 * which-patient carries two different tasks (asksForReply() already splits them for the kicker
 * label), so it gets two instruction lines here too, keyed by the same split.
 */
import { Question, QuestionKind } from '../data/types';
import { asksForReply, QUESTION_KINDS } from './kinds';

export interface InstructionLine {
  phone: string;
  stage: string;
}

const BINARY: InstructionLine = { phone: 'True or false. Tap your answer.', stage: 'True or false. The room decides.' };
const MYTH_AMONG_THREE: InstructionLine = { phone: 'Two are true. Tap the myth.', stage: 'Two are true. One is the myth.' };
const ESTIMATE: InstructionLine = { phone: 'Tap the closest range.', stage: 'Vote for the closest range.' };
// The phone's order control is arrow buttons (src/phone/PhoneVote.tsx renderOrderSteps), never a drag
// gesture, so the phone line names the actual control (review finding, 2026-09-27).
const ORDER: InstructionLine = { phone: 'Scrambled. Use the arrows to put them in order, then submit.', stage: 'Scrambled. Put these steps in order.' };
const WHICH_PATIENT_SCENARIO: InstructionLine = { phone: 'Tap the right choice.', stage: 'Pick the right choice.' };
const WHICH_PATIENT_REPLY: InstructionLine = { phone: 'Two replies. Tap the better one.', stage: 'Two replies. Pick the better one.' };

/** Every kind, keyed the same way `kindOptions`/`kindEyebrow` already split which-patient. */
export const INSTRUCTION_LINES: Record<Exclude<QuestionKind, 'which-patient'>, InstructionLine> & {
  'which-patient': { scenario: InstructionLine; reply: InstructionLine };
} = {
  binary: BINARY,
  'myth-among-three': MYTH_AMONG_THREE,
  estimate: ESTIMATE,
  order: ORDER,
  'which-patient': { scenario: WHICH_PATIENT_SCENARIO, reply: WHICH_PATIENT_REPLY },
};

/** No question loaded yet at all (not even an unrecognized kind): a neutral line, not a guess at a kind. */
const NO_QUESTION_LINE = 'Make your call';

/**
 * The line for a given question: `surface` picks phone or stage copy, and a which-patient question
 * resolves its reply-vs-scenario split from `asksForReply` the same way the kicker does. A missing
 * `question` (no data loaded yet) is not the same as an authored-but-unrecognized kind: the latter
 * still falls back to binary, matching `questionKind()` elsewhere, but the former has no question to
 * default a kind for at all, so it gets the neutral line instead of silently claiming "binary".
 */
export function kindInstructionLine(question: Partial<Question> | null | undefined, surface: 'phone' | 'stage'): string {
  if (!question) return NO_QUESTION_LINE;
  const kind = (question.kind && (QUESTION_KINDS as readonly string[]).includes(question.kind)) ? question.kind : 'binary';
  if (kind === 'which-patient') return (asksForReply(question) ? WHICH_PATIENT_REPLY : WHICH_PATIENT_SCENARIO)[surface];
  return INSTRUCTION_LINES[kind][surface];
}
