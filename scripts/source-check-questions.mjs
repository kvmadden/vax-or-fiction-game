// Source check. Loads the 144 bank records and resolves each to its primary deck question and the URLs it cites.
// Read only: nothing here writes a deck or a metadata file. Run under `node --import tsx` (the decks are TypeScript).
import { readFileSync, readdirSync } from 'node:fs';

import { BUNDLED_DECKS } from '../src/data/decks/index.ts';
import { SOLO_DECKS } from '../src/data/decks/topics/index.ts';

const METADATA_DIR = 'content/bank/metadata';

export async function loadBankQuestions() {
  const decks = new Map();
  for (const deck of BUNDLED_DECKS) decks.set(deck.id, deck);
  for (const [id, load] of Object.entries(SOLO_DECKS)) if (!decks.has(id)) decks.set(id, await load());

  const out = [];
  for (const file of readdirSync(METADATA_DIR).filter((f) => f.endsWith('.json')).sort()) {
    const records = JSON.parse(readFileSync(`${METADATA_DIR}/${file}`, 'utf8'));
    for (const record of Object.values(records)) {
      const [deckId, questionId] = record.bankId.split(':');
      const deck = decks.get(deckId);
      const question = deck?.questions.find((q) => q.id === questionId);
      if (!question) throw new Error(`${record.bankId} has no deck question`);
      const sources = record.evidence.sourceIds.map((sourceId) => {
        const citation = (question.citations ?? []).find((c) => c.id === sourceId)
          ?? (deck.citations ?? []).find((c) => c.id === sourceId);
        if (!citation?.url) throw new Error(`${record.bankId} cites ${sourceId} with no URL`);
        return { citationId: sourceId, url: citation.url, publisher: citation.publisher, line: citation.shortDisplayLine };
      });
      out.push({ bankId: record.bankId, file, kind: record.kind, subject: record.subject, question, sources });
    }
  }
  out.sort((a, b) => a.bankId.localeCompare(b.bankId));
  return out;
}
