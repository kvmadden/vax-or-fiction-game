// Every authored emphasis phrase (a question's emphasis, revealEmphasis and takeawayEmphasis arrays) must be an exact
// substring of the field it marks, in the deck as it ships. A later wording change that quietly breaks an emphasis
// fails loudly here instead of drifting silently.
import test from 'node:test';
import assert from 'node:assert/strict';

import { flagshipDeck } from '../../src/data/decks/flagship';
import { vaxOrFictionDeck } from '../../src/data/decks/vax-or-fiction';
import { SOLO_DECKS } from '../../src/data/decks/topics/index';
import type { Deck, Question } from '../../src/data/types';

type EmphasisFields = Partial<Record<'statement' | 'scenario' | 'reveal' | 'takeaway', string[]>>;
type EmphasisFile = Record<string, Record<string, EmphasisFields>>;

async function loadedDecks(): Promise<Map<string, Deck>> {
  const decks = new Map<string, Deck>();
  decks.set('flagship', flagshipDeck);
  decks.set('vax-or-fiction', vaxOrFictionDeck);
  for (const [id, load] of Object.entries(SOLO_DECKS)) {
    if (id === 'vax-or-fiction') continue;
    decks.set(id, await load());
  }
  return decks;
}

/** The emphasis each shipped question carries, keyed deck, question, field. */
function shippedEmphasis(decks: Map<string, Deck>): EmphasisFile {
  const out: EmphasisFile = {};
  for (const [deckId, deck] of decks) {
    for (const question of deck.questions) {
      const q = question as Question & { emphasis?: string[] };
      const fields: EmphasisFields = {};
      if (q.emphasis) fields[q.statement !== undefined ? 'statement' : 'scenario'] = q.emphasis;
      if (q.revealEmphasis) fields.reveal = q.revealEmphasis;
      if (q.takeawayEmphasis) fields.takeaway = q.takeawayEmphasis;
      if (Object.keys(fields).length) (out[deckId] ??= {})[question.id] = fields;
    }
  }
  return out;
}

const FIELD_LIMITS: Record<keyof EmphasisFields, number> = { statement: 2, scenario: 2, reveal: 1, takeaway: 1 };

function assertNonOverlapping(phrases: string[], text: string, where: string) {
  const spans = phrases
    .map((phrase) => ({ phrase, index: text.indexOf(phrase) }))
    .sort((a, b) => a.index - b.index);
  for (let i = 1; i < spans.length; i += 1) {
    const previousEnd = spans[i - 1]!.index + spans[i - 1]!.phrase.length;
    assert.ok(spans[i]!.index >= previousEnd, `${where}: ${JSON.stringify(spans[i - 1]!.phrase)} and ${JSON.stringify(spans[i]!.phrase)} overlap`);
  }
}

test('every emphasis phrase is an exact substring of its field, at most the allowed count, and never overlaps within a field', async (t) => {
  const decks = await loadedDecks();
  const EMPHASIS = shippedEmphasis(decks);
  let checked = 0;
  let stemCount = 0;
  for (const [deckId, entries] of Object.entries(EMPHASIS)) {
    const deck = decks.get(deckId);
    assert.ok(deck, `emphasis references unknown deck ${deckId}`);
    const byId = new Map(deck!.questions.map((question) => [question.id, question]));
    for (const [questionId, fields] of Object.entries(entries)) {
      const question = byId.get(questionId) as (Question & Record<string, unknown>) | undefined;
      assert.ok(question, `${deckId}.${questionId}: emphasis references a question that no longer ships`);
      for (const [field, phrases] of Object.entries(fields) as Array<[keyof EmphasisFields, string[]]>) {
        const where = `${deckId}.${questionId}.${field}`;
        const text = (question as Record<string, unknown>)[field];
        assert.equal(typeof text, 'string', `${where}: the field is not text in the shipped question`);
        assert.ok(phrases.length > 0, `${where}: an empty phrase list should not exist, retire the entry`);
        assert.ok(phrases.length <= FIELD_LIMITS[field], `${where}: ${phrases.length} phrases exceeds the ${FIELD_LIMITS[field]} allowed for ${field}`);
        for (const phrase of phrases) {
          assert.ok(phrase.trim().length > 0, `${where}: a phrase must not be blank`);
          assert.ok((text as string).includes(phrase), `${where}: ${JSON.stringify(phrase)} is not a substring of the shipped text: ${JSON.stringify(text)}`);
          checked += 1;
        }
        assertNonOverlapping(phrases, text as string, where);
        if (field === 'statement' || field === 'scenario') stemCount += 1;
      }
    }
  }
  t.diagnostic(`checked ${checked} phrases across ${stemCount} stem entries`);
  assert.ok(checked >= 100, `the scan must see the authored phrases, it saw ${checked}`);
});

// Phones keep a hyphenated word or an en-dash range on one line (src/phone/keep-compounds.tsx). A phrase that stops
// inside one, like "ages 27" in "ages 27–45", marks half a range and breaks that no-wrap run in two.
test('no emphasis phrase starts or ends inside a hyphenated word or an en-dash range', async () => {
  const decks = await loadedDecks();
  const EMPHASIS = shippedEmphasis(decks);
  let checked = 0;
  for (const [deckId, entries] of Object.entries(EMPHASIS)) {
    const byId = new Map(decks.get(deckId)!.questions.map((question) => [question.id, question]));
    for (const [questionId, fields] of Object.entries(entries)) {
      for (const [field, phrases] of Object.entries(fields) as Array<[keyof EmphasisFields, string[]]>) {
        const text = (byId.get(questionId) as Record<string, unknown>)[field] as string;
        for (const phrase of phrases) {
          // Every occurrence, since the splitter marks each whole-word match, not only the first.
          for (let start = text.indexOf(phrase); start !== -1; start = text.indexOf(phrase, start + 1)) {
            const end = start + phrase.length;
            for (const compound of text.matchAll(/\S+[-–]\S+/g)) {
              // Punctuation at a compound's edge ("27–45,") is not part of the range, and no line breaks before it.
              const core = compound[0].match(/[\p{L}\p{N}](?:.*[\p{L}\p{N}])?/u)!;
              const from = compound.index! + core.index!;
              const to = from + core[0].length;
              const cuts = (start > from && start < to) || (end > from && end < to);
              assert.ok(!cuts, `${deckId}.${questionId}.${field}: ${JSON.stringify(phrase)} cuts through ${JSON.stringify(compound[0])}`);
            }
          }
          checked += 1;
        }
      }
    }
  }
  assert.ok(checked >= 170, `the scan must see every phrase, it saw ${checked}`);
});
