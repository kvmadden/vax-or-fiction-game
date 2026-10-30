import { createContext, useContext } from 'react';
import { Deck } from './types';

export interface DeckProvider {
  getDecks(): Promise<Deck[]>;
  getDeck(id: string): Promise<Deck>;
}

export const DeckLoaderContext = createContext<DeckProvider | null>(null);

export function useDeckLoader(): DeckProvider {
  const context = useContext(DeckLoaderContext);
  if (!context) {
    throw new Error('useDeckLoader must be used within a DeckLoaderContext.Provider');
  }
  return context;
}
