import { Deck } from '../types';
import { DeckProvider } from '../deck-loader';

export class OnlineProvider implements DeckProvider {
  async getDecks(): Promise<Deck[]> {
    return [];
  }

  async getDeck(id: string): Promise<Deck> {
    throw new Error(`Deck not found: ${id}`);
  }
}
