import type { Question } from '../data/types';
import { questionKind } from './kinds';

/**
 * Breaks 4-question alternating answer sequences (e.g., True False True False)
 * in a question run by swapping the 3rd and 4th items (to True False False True).
 * This prevents participants from guessing alternating patterns.
 * Mirrors the classic run-order: a window holding any non-binary kind is left exactly as authored, so the
 * show deck's interleaved kind slots never move.
 */
export function breakAlternatingPatterns(run: Question[]): Question[] {
  const result = [...run];
  for (let i = 0; i <= result.length - 4; i++) {
    // Check for alternating pattern A B A B
    const window = result.slice(i, i + 4);
    if (window.some(q => questionKind(q) !== 'binary')) continue;
    const answers = window.map(q => q.answer);
    if (answers.some(a => typeof a !== 'boolean')) continue;
    if (answers[0] === answers[2] && answers[1] === answers[3] && answers[0] !== answers[1]) {
      // Swap positions 2 and 3 to break pattern: A B B A
      const q2 = result[i + 2]!;
      const q3 = result[i + 3]!;
      result[i + 2] = q3;
      result[i + 3] = q2;
    }
  }
  return result;
}

/** Legacy alias */
export const orderStandardModeQuestions = breakAlternatingPatterns;
