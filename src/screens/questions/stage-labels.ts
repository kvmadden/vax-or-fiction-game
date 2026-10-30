import type { Question } from '../../data/types';
import { answerLine, asksForReply, estimateTruthLabel, rightToken } from '../../engine/kinds';

/**
 * The stage stamp rounds the authored value the way the classic did ("TRUTH · 42%", never "41.9%"): whole
 * numbers from 10 up, one decimal below that, unit preserved. The facilitator report keeps the exact figure.
 */
export function stageTruthLabel(question: Question): string {
  const value = Number(question.estimate?.value);
  const unit = question.estimate?.unit ?? '';
  if (!Number.isFinite(value)) return estimateTruthLabel(question);
  const rounded = Math.abs(value) >= 10 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${rounded}${unit === '%' ? '%' : (unit ? ` ${unit}` : '')}`;
}

/** "BETTER · B" belongs to the two-reply vocabulary; a best-choice patient pick reads "BEST · B". */
export function whichPatientStampLabel(question: Question): string {
  if (asksForReply(question)) return answerLine(question);
  return `BEST · ${rightToken(question).toUpperCase()}`;
}
