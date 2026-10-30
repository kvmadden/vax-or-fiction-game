import type { PublicReveal } from '../network/protocol';

export interface ClosingTakeawayLine {
  text: string;
  /** This line's deciding words, when the host sent a list for every line. */
  phrases?: string[];
}

/**
 * The closing reveal's takeaway lines (newline-joined on the wire, see closingReveal in src/network/game-projection.ts),
 * each with its own phrases from takeawayLineEmphasis. The lists pair with the lines by position, so when the counts
 * differ (a takeaway that carried a newline of its own) no line is marked, rather than a line marked with another's words.
 */
export function closingTakeawayLines(recap: PublicReveal | null | undefined): ClosingTakeawayLine[] {
  const lines = (recap?.takeaway ?? '').split('\n').map((line) => line.trim()).filter(Boolean);
  const lists = recap?.takeawayLineEmphasis;
  const paired = lists && lists.length === lines.length ? lists : null;
  return lines.map((text, index) => {
    const phrases = paired?.[index];
    return phrases?.length ? { text, phrases } : { text };
  });
}
