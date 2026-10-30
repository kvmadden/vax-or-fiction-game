import type { Deck, GameMode } from '../types';
import { vaxOrFictionDeck } from './vax-or-fiction';
import { flagshipDeck } from './flagship';

/** The show deck ships first; the 20-question flagship stays bundled as a second selectable deck. */
export const BUNDLED_DECKS: readonly Deck[] = [vaxOrFictionDeck, flagshipDeck];

export const DEFAULT_DECK_ID = vaxOrFictionDeck.id;

/** Aliases that resolve to the default (show) deck. */
const DEFAULT_DECK_ALIASES = new Set(['default', 'vax-or-fiction']);

export function resolveBundledDeck(deckId: string | null | undefined): Deck | null {
  if (!deckId || DEFAULT_DECK_ALIASES.has(deckId)) return vaxOrFictionDeck;
  return BUNDLED_DECKS.find((deck) => deck.id === deckId) ?? null;
}

/** The first offered mode is preselected in setup (the generator puts the deck's default pace first in modeOrder). */
export function defaultModeId(deck: Deck): string {
  return deck.modeOrder.find((modeId) => Boolean(deck.modes[modeId])) ?? Object.keys(deck.modes)[0] ?? 'full';
}

/** Modes the presenter can pick, in authored order. */
export function offeredModes(deck: Deck): GameMode[] {
  return deck.modeOrder.map((modeId) => deck.modes[modeId]).filter((mode): mode is GameMode => Boolean(mode));
}

/** Match questions held out of play across deck-local IDs and persisted copies. */
export function isHeldBundledQuestion(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const question = value as Record<string, unknown>;
  const normalize = (text: unknown) => typeof text === 'string'
    ? text.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase()
    : '';
  // A slide stamped with its deck (a solo topic round, VOF-44) answers to review and image ids from that deck only.
  // Every classic deck numbers its reviews and plates the same way, so across decks only the same statement is the
  // same question. Unstamped slides, which is every hosted run, match exactly as before.
  const ownDeck = typeof question.deckId === 'string' ? question.deckId : null;
  return BUNDLED_DECKS.some((deck) => deck.questions.some((held) => {
    if (!(deck.heldQuestionIds ?? []).includes(held.id)) return false;
    // A changed answer or explanation cannot release a hold. Legacy copies carry
    // the authored review + image identity even when their displayed stem changes.
    // Both references are needed because question/review IDs are deck-local.
    const authoredIdentity = (ownDeck === null || ownDeck === deck.id) && held.authoringId && held.imageRequirementId
      && question.authoringId === held.authoringId
      && question.imageRequirementId === held.imageRequirementId;
    return Boolean(authoredIdentity) || normalize(question.statement) === normalize(held.statement);
  }));
}
