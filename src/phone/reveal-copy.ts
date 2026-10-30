import type { AttendeeState, PublicQuestion, PublicReveal } from '../network/protocol';
import { describeChoice, formatChoice } from './choice-label';

export interface AnswerCopy {
  /** A line under the verdict, as the range an estimate's exact value landed in. */
  detail?: string | null;
  kind: string;
  eyebrow: string | null;
  letter: string | null;
  tone: 'vax' | 'fiction' | 'cobalt' | 'gold';
  text: string;
}

/** Parse only the complete numbered block emitted by the host. Any unfamiliar
 * text stays intact as teaching, including replies from an older host. */
export function revealTeaching(reveal: PublicReveal, question?: PublicQuestion | null): { steps: string[]; explanation: string } {
  const explanation = reveal.explanation;
  if (question?.kind !== 'order') return { steps: [], explanation };
  const separator = explanation.indexOf('\n\n');
  if (separator < 0) return { steps: [], explanation };
  const lines = explanation.slice(0, separator).split('\n');
  if (lines.length < 3 || lines.length > 6 || lines.some((line, index) => !line.startsWith(`${index + 1}. `) || !line.slice(3).trim())) {
    return { steps: [], explanation };
  }
  return { steps: lines.map(line => line.slice(3)), explanation: explanation.slice(separator + 2) };
}

/**
 * The answer, said in words and in the stage's colours (critique item 10). Binary: the verdict word in the
 * stage's pill (vax / fiction). Lettered kinds: the letter as a 40px badge (cobalt for a choice, gold for the
 * myth) beside the option's own text, so nobody decodes "B" from memory. Estimate: the value in gold with the
 * range it landed in. Order and anything unknown: the stage's answer line.
 */
export function describeAnswer(reveal: PublicReveal, question?: PublicQuestion | null): AnswerCopy {
  const kind = question?.kind ?? 'binary';
  const option = question?.options.find((candidate) => candidate.token === reveal.answerToken);
  if (kind === 'binary') return { kind, eyebrow: null, letter: null, tone: reveal.answerToken === 'false' ? 'fiction' : 'vax', text: reveal.answerToken === 'false' ? 'FALSE' : 'TRUE' };
  if ((kind === 'myth-among-three' || kind === 'which-patient') && option?.text) {
    const [eyebrow] = reveal.answerLabel.split(' · ');
    return { kind, eyebrow: eyebrow || null, letter: option.label || option.token.toUpperCase(), tone: kind === 'myth-among-three' ? 'gold' : 'cobalt', text: option.text };
  }
  if (kind === 'estimate') {
    const range = option?.label || option?.text || '';
    return { kind, eyebrow: null, letter: null, tone: 'gold', text: reveal.answerLabel || range, detail: reveal.answerLabel && range && range !== reveal.answerLabel ? `In the ${range} range` : null };
  }
  return { kind, eyebrow: null, letter: null, tone: 'gold', text: reveal.answerLabel };
}

/**
 * The quiet second line: what you said, a check or a cross, points only on a hit; never "0 points". A hit names
 * the letter or range only (the answer card above already carries the words); a miss repeats the option's words
 * so nobody has to remember what "C" was.
 */
export function describeResult(result: AttendeeState['result'] | undefined, question?: PublicQuestion | null, { withPoints = true }: { withPoints?: boolean } = {}): string {
  if (!result) return "You didn't answer this one";
  const options = question?.options ?? [];
  if (!result.isCorrect) return `${question?.kind === 'order' ? 'Your order' : `You said ${describeChoice(result.choice, options)}`} ×`;
  const label = options.find((option) => option.token === result.choice)?.label || formatChoice(result.choice);
  const said = question?.kind === 'order' ? 'Your order' : `You said ${label}`;
  return withPoints && result.points > 0 ? `${said} ✓ · +${result.points}` : `${said} ✓`;
}
