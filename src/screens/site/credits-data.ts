import { BUNDLED_DECKS } from '../../data/decks';
import type { Citation } from '../../data/types';

/**
 * The public sources the game's questions cite, pulled straight from the bundled deck data
 * (never hand-typed, so this list can never drift from what the game actually shows on
 * evidence cards). Decks repeat the same source across several questions, so this dedupes by
 * URL first, falling back to the citation id when a source has no URL.
 */
export function sourcedCitations(): Citation[] {
  const seen = new Set<string>();
  const citations: Citation[] = [];
  for (const deck of BUNDLED_DECKS) {
    for (const citation of deck.citations ?? []) {
      const key = citation.url?.trim() || citation.id;
      if (!key || seen.has(key)) continue;
      seen.add(key);
      citations.push(citation);
    }
  }
  return citations.sort((a, b) => {
    const publisher = a.publisher.localeCompare(b.publisher);
    return publisher !== 0 ? publisher : a.shortDisplayLine.localeCompare(b.shortDisplayLine);
  });
}
