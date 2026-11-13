/**
 * The topic pattern index (VOF-94): which pattern family every bundled question belongs to.
 *
 * A question's family comes from the owner's solo topics (src/data/decks/topics/themes.ts, VOF-44), which already
 * place every question of every deck in exactly one topic, plus the OVERRIDES below where a smaller family says more
 * than the topic does. The result is keyed by the fingerprint of the question's stem (stemKey in
 * src/looks/patterns/families.ts), because the phone holds only the stem and ids repeat across decks, and it is
 * written into src/looks/patterns/topic-index.ts by scripts/build-pattern-index.mjs.
 *
 * This module only derives and renders. It never writes, so tests/unit/topic-pattern-families.test.ts can import it
 * and hold the committed index to what the decks and topics say today.
 */
import { vaxOrFictionDeck } from '../src/data/decks/vax-or-fiction.ts';
import { flagshipDeck } from '../src/data/decks/flagship.ts';
import { SOLO_DECKS } from '../src/data/decks/topics/index.ts';
import { SOLO_THEMES } from '../src/data/decks/topics/themes.ts';
import { PATTERN_FAMILIES, stemKey } from '../src/looks/patterns/families.ts';

/** The solo topic each family stands for. Every topic has one. */
export const THEME_FAMILY = {
  flu: 'flu',
  rsv: 'rsv',
  shingles: 'shingles',
  pneumococcal: 'pneumococcal',
  hpv: 'hpv',
  'hepatitis-b': 'hepatitis-b',
  tetanus: 'tetanus',
  'at-the-counter': 'one-visit',
  'what-to-say': 'what-to-say',
  'big-picture': 'big-picture',
};

/**
 * Where a smaller family says more than the solo topic does. Keys are `deck:question`. A flagship question is named by
 * its polish twin (flagship-r2), which is word for word the same apart from the flagship's own q17.
 */
export const OVERRIDES = {
  // Pregnancy and newborns: maternal Tdap and maternal RSV, and cocooning. Owner, 2026-10-01: the Tdap in pregnancy
  // questions use this family, not the nail and the cough. The three offer questions about a pregnant patient follow
  // the same rule, so a fact reads the same in every deck. hpv:q8 stays with HPV: it is about the series, not the baby.
  'vax-or-fiction:q8': 'newborns', 'vax-or-fiction:q24': 'newborns', 'vax-or-fiction:q26': 'newborns', 'vax-or-fiction:q32': 'newborns',
  'flagship-r2:q11': 'newborns', 'flagship-r2:q19': 'newborns', 'season-2:q5': 'newborns', 'season-2:q10': 'newborns',
  'rsv:q5': 'newborns', 'tdap:q1': 'newborns', 'tdap:q6': 'newborns',
  'art-of-the-offer:q10': 'newborns', 'art-of-the-offer:q13': 'newborns', 'art-of-the-offer:q14': 'newborns',
  // Heart and stroke: flu and heart attacks, heart disease, stroke after COVID-19 and after shingles.
  'vax-or-fiction:q2': 'heart', 'flagship-r2:q3': 'heart', 'season-2:q11': 'heart', 'influenza:q6': 'heart', 'season-2:q1': 'heart', 'season-2:q3': 'heart',
  // Egg allergy and the flu shot.
  'vax-or-fiction:q18': 'egg', 'flagship-r2:q14': 'egg', 'influenza:q3': 'egg',
  // Storage and handling: the fridge alarm and the diluent.
  'vax-or-fiction:q28': 'storage', 'vax-or-fiction:q36': 'storage',
  // Several vaccines at one visit, from the RSV deck.
  'rsv:q8': 'one-visit',
  // The offer deck. Owner, 2026-10-02: every offer question takes the family of its subject, not the deck's What to
  // say, for the whole deck. The pregnancy ones sit with newborns above. The general ones (q11 putting it off, q16 a late second dose) keep What to say.
  'art-of-the-offer:q1': 'one-visit', 'art-of-the-offer:q2': 'one-visit',
  'art-of-the-offer:q4': 'one-visit', 'art-of-the-offer:q5': 'one-visit', 'art-of-the-offer:q6': 'one-visit',
  'art-of-the-offer:q7': 'egg', 'art-of-the-offer:q12': 'flu', 'art-of-the-offer:q18': 'hepatitis-b',
  'art-of-the-offer:q8': 'shingles', 'art-of-the-offer:q15': 'shingles', 'art-of-the-offer:q19': 'shingles',
  'art-of-the-offer:q20': 'hpv',
  // How to recommend, from the co-administration deck.
  'co-administration:q5': 'what-to-say', 'co-administration:q8': 'what-to-say',
  // Several vaccines and diseases in one claim.
  'season-2:q20': 'big-picture',
};

/** Every deck a question can come from: the show deck, the flagship and each solo topic deck, by deck id. */
export async function loadDecks() {
  const decks = { 'vax-or-fiction': vaxOrFictionDeck, flagship: flagshipDeck };
  for (const [id, load] of Object.entries(SOLO_DECKS)) if (!decks[id]) decks[id] = await load();
  return decks;
}

const squash = (text) => String(text).toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * The family of every question in `decks`, and what is wrong with it. `rows` lists each question with its family and
 * why it has it, `index` is the stem fingerprint to family table, and `problems` is empty when every question has a
 * family, no override names a question that is not there, no two different stems share a fingerprint and no stem sits
 * in two families.
 */
export function deriveIndex(decks) {
  const themeOf = new Map();
  for (const theme of SOLO_THEMES) for (const [deck, id] of theme.picks) themeOf.set(`${deck}:${id}`, theme.id);

  const problems = [];
  const pending = [];
  for (const [deckId, deck] of Object.entries(decks)) {
    for (const question of deck.questions) {
      const key = `${deckId}:${question.id}`;
      const twin = deckId === 'flagship' && question.id !== 'q17' ? `flagship-r2:${question.id}` : key;
      if (twin !== key) {
        const polished = decks['flagship-r2']?.questions.find((item) => item.id === question.id);
        if (polished?.statement !== question.statement) problems.push(`${key} is not word for word ${twin}`);
      }
      const theme = themeOf.get(twin);
      const family = OVERRIDES[twin] ?? (theme ? THEME_FAMILY[theme] : undefined);
      const via = OVERRIDES[twin] ? 'override' : theme ? `topic ${theme}` : '';
      pending.push({ key, deck: deckId, id: question.id, topic: question.topic ?? '', statement: String(question.statement).trim(), family, via });
    }
  }
  // A question two decks share is listed once in the solo topics, so a question with no topic of its own takes the
  // family of the question with the same stem.
  const rows = [];
  for (const row of pending) {
    if (!row.family) {
      const same = pending.find((other) => other.family && stemKey(other.statement) === stemKey(row.statement));
      if (same) { row.family = same.family; row.via = `same stem as ${same.key}`; }
    }
    if (!row.family) { problems.push(`${row.key} has no family`); continue; }
    if (!(row.family in PATTERN_FAMILIES)) { problems.push(`${row.key} names a family that does not exist: ${row.family}`); continue; }
    rows.push(row);
  }
  const named = new Set(pending.map((row) => row.key));
  for (const key of Object.keys(OVERRIDES)) {
    const [deck, id] = key.split(':');
    // A flagship override is held on its polish twin, so it stands if either deck still has the question.
    if (!named.has(key) && !(deck === 'flagship-r2' && named.has(`flagship:${id}`))) problems.push(`override ${key} matches no question`);
  }
  for (const theme of Object.keys(THEME_FAMILY)) if (!SOLO_THEMES.some((item) => item.id === theme)) problems.push(`no solo topic named ${theme}`);

  const byKey = new Map();
  for (const row of rows) {
    const hash = stemKey(row.statement);
    const prior = byKey.get(hash);
    if (!prior) { byKey.set(hash, { statement: row.statement, family: row.family, keys: [row.key] }); continue; }
    if (squash(prior.statement) !== squash(row.statement)) problems.push(`fingerprint collision ${hash}: ${prior.keys[0]} and ${row.key}`);
    if (prior.family !== row.family) problems.push(`stem ${hash} sits in two families: ${prior.keys.join(',')} is ${prior.family} and ${row.key} is ${row.family}`);
    prior.keys.push(row.key);
  }
  const unused = Object.keys(PATTERN_FAMILIES).filter((family) => !rows.some((row) => row.family === family));
  for (const family of unused) problems.push(`no question is in the ${family} family`);
  return { rows, byKey, problems };
}

/** The text of src/looks/patterns/topic-index.ts for an index, in a stable order. */
export function renderIndex(byKey) {
  const lines = [
    '// GENERATED by scripts/build-pattern-index.mjs (npm run patterns:index). Do not hand-edit, re-run the script.',
    '// The pattern family of every bundled question, keyed by the fingerprint of its stem (stemKey in families.ts).',
    '// Each entry names the deck and question ids that share that stem.',
    'import type { PatternFamilyId } from "./families";',
    '',
    'export const STEM_FAMILY: Readonly<Record<string, PatternFamilyId>> = {',
  ];
  const entries = [...byKey.entries()].sort((a, b) => a[1].family.localeCompare(b[1].family) || a[1].keys[0].localeCompare(b[1].keys[0], 'en', { numeric: true }));
  for (const [hash, value] of entries) lines.push(`  "${hash}": "${value.family}", // ${value.keys.join(' ')}`);
  lines.push('};', '');
  return lines.join('\n');
}
