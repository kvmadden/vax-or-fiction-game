import { Deck } from '../types';
import { DeckProvider } from '../deck-loader';
import { BUNDLED_DECKS, resolveBundledDeck } from '../decks';

export class OfflineProvider implements DeckProvider {
  async getDecks(): Promise<Deck[]> {
    return [...BUNDLED_DECKS];
  }

  async getDeck(id: string): Promise<Deck> {
    const deck = resolveBundledDeck(id);
    if (deck) return deck;
    throw new Error(`Deck not found: ${id}`);
  }
}
