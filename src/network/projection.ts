import type { Question } from '../data/types';
import { answerLine, asksForReply, kindOptions, questionKind, rightToken } from '../engine/kinds';
import { wirePhrases } from './emphasis-bound';
import type {
  PublicQuestion,
  PublicReveal,
} from './protocol';
export { validateAttendeeState, validateClientEnvelope, validatePublicRoomState } from './guards';
export type { ClientValidationContext, ClientValidationResult } from './guards';

export interface PublicQuestionProjection {
  question: PublicQuestion;
  decodeChoice(choice: string): string | null;
  encodeChoice(choice: string): string | null;
}

/**
 * 8.6 fix: an order question's step tokens and display order used to be recomputed from public
 * inputs (questionInstanceId and the question id), which let a phone rebuild the correct order
 * before the reveal. Both are now random per game and cached host-side (game-store.ts's
 * orderScrambles, keyed by questionInstanceId), so nothing sent to a phone relates back to a
 * position. Callers that hold no cached scramble (the editorial preview, and any test fixture
 * that does not care about reload stability) get a fresh one drawn here instead.
 */
export interface OrderScramble {
  tokens: string[];
  order: string[];
}

/**
 * Coordinator constraint: an order token stays lowercase alphanumeric, at most 20 characters,
 * and never carries "-" (decodeChoice/encodeChoice split a submitted choice on it). At the
 * generated length (15 characters, see randomOpaqueToken) and MAX_ORDER_STEPS (6), a full joined
 * choice is 6*15 + 5 dashes = 95 characters, comfortably under the wire's 128-character choice
 * cap (supabase/migrations/20260913170036_..._production_relay.sql: `char_length between 1 and
 * 128` on `choice`). vof_relay.is_wire_id (`^[A-Za-z0-9_-]{1,64}$`) is not applied to `choice` or
 * its tokens anywhere in this codebase today; a 15-character token would satisfy its 64-character
 * per-value limit regardless, but that is not the binding constraint here -- the 128-character
 * choice cap is. game-store.ts's persisted-scramble validator uses this same pattern.
 */
export const ORDER_TOKEN_PATTERN = /^[a-z0-9]{1,20}$/;

function canonicalOrderLetters(stepCount: number): string[] {
  return Array.from({ length: stepCount }, (_, index) => String.fromCharCode(97 + index));
}

/**
 * Coordinator constraint (independent review of the accounts spec): a token must stay inside the
 * [a-z0-9] alphabet with no "-" (decodeChoice/encodeChoice split a submitted choice on "-"), and
 * short enough that MAX_ORDER_STEPS tokens joined by "-" stay well clear of the wire's
 * 128-character choice cap. 7 random bytes, each rendered as a fixed two-digit base36 pair, plus
 * the "s" prefix: 15 characters. A full 6-step joined choice is then 95 characters (see
 * ORDER_TOKEN_PATTERN's comment for the exact accounting), about a quarter of headroom under 128.
 */
function randomOpaqueToken(): string {
  const bytes = new Uint8Array(7);
  crypto.getRandomValues(bytes);
  return `s${Array.from(bytes, (byte) => byte.toString(36).padStart(2, '0')).join('')}`;
}

function randomPermutation(letters: string[]): string[] {
  const shuffled = [...letters];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const bound = new Uint32Array(1);
    crypto.getRandomValues(bound);
    const j = bound[0]! % (i + 1);
    const temp = shuffled[i] as string;
    shuffled[i] = shuffled[j] as string;
    shuffled[j] = temp;
  }
  return shuffled;
}

/** Draws a random token per step and a random display order, never the correct order. */
export function randomOrderScramble(stepCount: number): OrderScramble {
  const letters = canonicalOrderLetters(stepCount);
  const tokens = letters.map(() => randomOpaqueToken());
  if (letters.length < 2) return { tokens, order: letters };
  let order = randomPermutation(letters);
  while (order.join('-') === letters.join('-')) order = randomPermutation(letters);
  return { tokens, order };
}

export function projectPublicQuestion(
  source: Question,
  questionInstanceId: string,
  number: number,
  total: number,
  scramble?: OrderScramble | null,
): PublicQuestionProjection {
  const kind = questionKind(source);
  const statement = source.statement?.trim() || '';
  const scenario = source.scenario?.trim() || '';
  const visibleScenario = scenario !== statement && scenario !== 'Choose the best answer.' ? scenario : '';
  const canonicalOptions = kindOptions(source) ?? [];
  let options = canonicalOptions.map(({ token, label, text, min, max }) => ({ token, label, text, min, max }));
  let steps: PublicQuestion['steps'];
  const publicToCanonical = new Map<string, string>();
  const canonicalToPublic = new Map<string, string>();

  if (kind === 'order') {
    const stepCount = (source.steps ?? []).length;
    const canonicalLetters = canonicalOrderLetters(stepCount);
    // A scramble whose length does not match this question's real step count (a corrupted or
    // foreign value passed in) is not usable -- treat it exactly like no scramble at all.
    const suppliedScramble = scramble && scramble.tokens.length === stepCount && scramble.order.length === stepCount
      ? scramble
      : null;
    const activeScramble = suppliedScramble ?? randomOrderScramble(stepCount);
    canonicalLetters.forEach((letter, index) => {
      const opaque = activeScramble.tokens[index] as string;
      publicToCanonical.set(opaque, letter);
      canonicalToPublic.set(letter, opaque);
    });
    steps = activeScramble.order.map((letter) => ({
      token: canonicalToPublic.get(letter) as string,
      text: String(source.steps?.[letter.charCodeAt(0) - 97] ?? ''),
    }));
    options = [];
  }

  const decodeChoice = (choice: string): string | null => {
    if (kind !== 'order') return canonicalOptions.some((option) => option.token === choice) ? choice : null;
    const publicParts = choice.split('-');
    if (publicParts.length !== publicToCanonical.size || new Set(publicParts).size !== publicParts.length) return null;
    const decoded = publicParts.map((token) => publicToCanonical.get(token));
    return decoded.every((token): token is string => Boolean(token)) ? decoded.join('-') : null;
  };

  const encodeChoice = (choice: string): string | null => {
    if (kind !== 'order') return canonicalOptions.some((option) => option.token === choice) ? choice : null;
    const canonicalParts = choice.split('-');
    const encoded = canonicalParts.map((token) => canonicalToPublic.get(token));
    return encoded.every((token): token is string => Boolean(token)) ? encoded.join('-') : null;
  };

  // The stem's deciding words (content/editorial/emphasis.json), marked on the phone the way the stage marks them.
  // They target the stem, which leads the merged statement below, and never an answer, so they may go before the reveal.
  const emphasis = wirePhrases(source.emphasis);
  return {
    question: {
      id: source.id,
      questionInstanceId,
      kind,
      // The stock, timing and screening conditions matter on the phone too.
      statement: [statement, visibleScenario].filter(Boolean).join('\n\n'),
      number,
      total,
      options,
      ...(steps ? { steps } : {}),
      ...(kind === 'estimate' && source.estimate?.unit ? { unit: source.estimate.unit } : {}),
      // A spoken-reply question is flagged, and the phone then asks which reply is better, as the stage does. Only a
      // which-patient question asks that. A binary one whose text mentions a reply (season-2 q8) stays true or false.
      ...(kind === 'which-patient' && asksForReply(source) ? { reply: true } : {}),
      ...(emphasis ? { emphasis } : {}),
    },
    decodeChoice,
    encodeChoice,
  };
}

function safeCitationUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : undefined;
  } catch {
    return undefined;
  }
}

export function projectPublicReveal(source: Question): PublicReveal {
  // The reveal's and the takeaway's deciding words travel only with the reveal itself. On an order question the
  // explanation leads with the numbered steps, and the phone renders those plain (revealTeaching), so only the
  // reveal text they belong to is marked.
  const explanationEmphasis = wirePhrases(source.revealEmphasis);
  const takeawayEmphasis = wirePhrases(source.takeawayEmphasis);
  return {
    answerLabel: answerLine(source),
    answerToken: rightToken(source),
    // Keep the existing relay shape so cached phones and both relay backends
    // receive the complete answer. New phones render this block as a list.
    explanation: questionKind(source) === 'order'
      ? `${(source.steps ?? []).map((step, index) => `${index + 1}. ${step}`).join('\n')}\n\n${source.reveal}`
      : source.reveal,
    takeaway: source.takeaway ?? '',
    citations: (source.citations ?? []).map((citation) => ({
      label: citation.shortDisplayLine || citation.publisher,
      ...(safeCitationUrl(citation.url) ? { url: safeCitationUrl(citation.url) } : {}),
    })),
    ...(explanationEmphasis ? { explanationEmphasis } : {}),
    ...(takeawayEmphasis ? { takeawayEmphasis } : {}),
  };
}
