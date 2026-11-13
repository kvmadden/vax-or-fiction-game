// Kevin's ruling (2026-11-01, exception 2026-11-12): COVID-19 vaccines stay out of the vaccine games, with one
// exception. The solo topic "The big picture" may include COVID. Every other deck question, solo topic and bank
// record stays COVID-free. This guard fails when a COVID term shows up anywhere else.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { SOLO_DECKS, SOLO_TOPICS } from '../../src/data/decks/topics/index.ts';
import { flagshipDeck } from '../../src/data/decks/flagship.ts';
import { vaxOrFictionDeck } from '../../src/data/decks/vax-or-fiction.ts';
import type { Deck } from '../../src/data/types.ts';

const COVID = /covid|sars-?cov|coronavirus/i;
const ALLOWED_TOPIC = 'big-picture';
const allowed = new Set(
  SOLO_TOPICS.find((topic) => topic.id === ALLOWED_TOPIC)!.picks.map(([deckId, questionId]) => `${deckId}:${questionId}`),
);

const loadDecks = async (): Promise<Map<string, Deck>> => {
  const decks = new Map<string, Deck>([['vax-or-fiction', vaxOrFictionDeck], ['flagship', flagshipDeck]]);
  for (const [id, load] of Object.entries(SOLO_DECKS)) if (!decks.has(id)) decks.set(id, await load());
  return decks;
};

test('no deck question mentions COVID unless The big picture plays it', async () => {
  const decks = await loadDecks();
  const offenders: string[] = [];
  let checked = 0;
  let allowedSeen = 0;
  for (const [deckId, deck] of decks) {
    const citationText = new Map((deck.citations ?? []).map((citation) => [citation.id, JSON.stringify(citation)]));
    for (const question of deck.questions) {
      checked += 1;
      const key = `${deckId}:${question.id}`;
      const text = JSON.stringify(question) + (question.sourceIds ?? []).map((id) => citationText.get(id) ?? '').join(' ');
      if (!COVID.test(text)) continue;
      if (allowed.has(key)) allowedSeen += 1;
      else offenders.push(key);
    }
  }
  assert.deepEqual(offenders, [], 'COVID content outside The big picture. Remove the question (Kevin, 2026-11-01).');
  // Prove the sweep sees its target: it covers every deck and finds the allowed COVID questions.
  assert.ok(checked >= 170, `only ${checked} questions were checked`);
  assert.ok(allowedSeen >= 3, `the sweep should find the big picture's COVID questions, found ${allowedSeen}`);
});

test('no deck title, description or unused citation mentions COVID outside the big picture sources', async () => {
  const decks = await loadDecks();
  const offenders: string[] = [];
  for (const [deckId, deck] of decks) {
    if (COVID.test(`${deck.title} ${deck.description ?? ''}`)) offenders.push(`${deckId}:deck-text`);
    const usedByAllowed = new Set(
      deck.questions.filter((question) => allowed.has(`${deckId}:${question.id}`)).flatMap((question) => question.sourceIds ?? []),
    );
    for (const citation of deck.citations ?? []) {
      if (COVID.test(JSON.stringify(citation)) && !usedByAllowed.has(citation.id)) offenders.push(`${deckId}:${citation.id}`);
    }
  }
  assert.deepEqual(offenders, []);
});

test('solo topics other than The big picture list no COVID question, and the bank carries none either', async () => {
  const decks = await loadDecks();
  assert.ok(SOLO_TOPICS.length >= 10, 'the topic list was read');
  for (const topic of SOLO_TOPICS) {
    if (topic.id === ALLOWED_TOPIC) continue;
    for (const [deckId, questionId] of topic.picks) {
      const question = decks.get(deckId)?.questions.find((entry) => entry.id === questionId);
      assert.ok(question, `${topic.id} picks ${deckId}:${questionId}, which exists`);
      assert.equal(COVID.test(JSON.stringify(question)), false, `${topic.id} plays COVID content at ${deckId}:${questionId}`);
    }
  }
  const files = readdirSync('content/bank/metadata').filter((file) => file.endsWith('.json'));
  assert.ok(files.length >= 10, 'the bank metadata files were found');
  const offenders: string[] = [];
  for (const file of files) {
    const records = JSON.parse(readFileSync(`content/bank/metadata/${file}`, 'utf8')) as Record<string, { bankId: string }>;
    for (const record of Object.values(records)) {
      if (COVID.test(JSON.stringify(record)) && !allowed.has(record.bankId)) offenders.push(record.bankId);
    }
  }
  assert.deepEqual(offenders, []);
});
