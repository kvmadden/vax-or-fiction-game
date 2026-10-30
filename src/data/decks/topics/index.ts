import type { Deck } from '../../types';
import { resolveBundledDeck } from '../index';
import { SOLO_THEMES, type SoloTheme } from './themes';

/**
 * Solo play (VOF-44, 2026-09-15). The decks solo draws its questions from, each loaded only when a topic needs it,
 * so a deck's answers stay in its own chunk. The flagship polish stands for the flagship almost everywhere, except its
 * own q17, which The big picture plays straight from the flagship deck itself, by its own deck and id (VOF-77) -- never
 * as q17 of the polish, which is a different question. The host deck picker still offers just its two decks.
 */
const showDeck = async (): Promise<Deck> => {
  const deck = resolveBundledDeck('vax-or-fiction');
  if (!deck) throw new Error('The show deck is missing from the bundle.');
  return deck;
};

const flagshipDeckLoad = async (): Promise<Deck> => {
  const deck = resolveBundledDeck('flagship');
  if (!deck) throw new Error('The flagship deck is missing from the bundle.');
  return deck;
};

export const SOLO_DECKS: Readonly<Record<string, () => Promise<Deck>>> = {
  'vax-or-fiction': showDeck,
  flagship: flagshipDeckLoad,
  'flagship-r2': () => import('./flagship-r2').then((module) => module.flagshipPolishDeck),
  'season-2': () => import('./season-2').then((module) => module.seasonTwoDeck),
  'art-of-the-offer': () => import('./art-of-the-offer').then((module) => module.artOfTheOfferDeck),
  influenza: () => import('./influenza').then((module) => module.influenzaDeck),
  'hepatitis-b': () => import('./hepatitis-b').then((module) => module.hepatitisBDeck),
  hpv: () => import('./hpv').then((module) => module.hpvDeck),
  pneumococcal: () => import('./pneumococcal').then((module) => module.pneumococcalDeck),
  rsv: () => import('./rsv').then((module) => module.rsvDeck),
  shingles: () => import('./shingles').then((module) => module.shinglesDeck),
  'co-administration': () => import('./co-administration').then((module) => module.coAdministrationDeck),
  tdap: () => import('./tdap').then((module) => module.tdapDeck),
};

/**
 * Questions solo leaves out while hosted runs keep them. VOF-32 (2026-09-14): no seasonal or state framing that
 * does not fit the room, which is Florida, where RSV vaccine is given year-round. q26 and q32 ask about October in Ohio.
 */
export const SOLO_HOLDS: Readonly<Record<string, readonly string[]>> = {
  'vax-or-fiction': ['q26', 'q32'],
};

/** How the picker lays the topics out: the vaccines first, then the two about the work itself. */
export const SOLO_GROUPS: readonly { label: string; ids: readonly string[] }[] = [
  { label: 'Vaccines', ids: ['flu', 'rsv', 'shingles', 'pneumococcal', 'hpv', 'hepatitis-b', 'tetanus', 'big-picture'] },
  { label: 'In practice', ids: ['at-the-counter', 'what-to-say'] },
];

/** A solo topic is a subject (2026-09-15), drawn from whichever decks ask about it. See themes.ts. */
export type SoloTopic = SoloTheme;
export const SOLO_TOPICS: readonly SoloTopic[] = SOLO_THEMES;
