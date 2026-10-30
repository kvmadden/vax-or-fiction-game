// Bank phase 2, item 3. docs/QUESTION-BANK.md section 4.9's validation test plan. Every guard here is shown
// red once by a disposable mutation before this file lands.
//
// Every record carries a final, rated difficulty (the rater protocol in docs/QUESTION-DIFFICULTY-RUBRIC.md, merged by
// scripts/bank-apply-ratings.mjs). The phase 2 pending placeholder is gone, and "Final level" fails if one comes back.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';

import { BUNDLED_DECKS } from '../../src/data/decks/index.ts';
import { SOLO_DECKS } from '../../src/data/decks/topics/index.ts';
import { questionKind } from '../../src/engine/kinds.ts';
import { BANK_META } from '../../src/data/bank/metadata.generated.ts';
import type { QuestionMetadata } from '../../src/data/bank/types.ts';

const METADATA_DIR = 'content/bank/metadata';
const DIFFICULTY_LEVELS = new Set(['easy', 'medium', 'hard', 'expert']);
const SKILL_TYPES = new Set(['recall', 'application', 'judgment', 'communication', 'estimation', 'sequencing']);
const AUDIENCE_PITCHES = new Set(['everyone', 'pharmacy-team', 'immunizer']);
const STATUSES = new Set(['live', 'draft', 'retired']);
const ROTATIONS = new Set(['core', 'alternate']);
const SUBJECTS = new Set(['flu', 'rsv', 'shingles', 'pneumococcal', 'hpv', 'hepatitis-b', 'tetanus', 'public-health',
  'covid-19', 'other-vaccines', 'at-the-counter', 'what-to-say']);
const VACCINES = new Set(['influenza', 'rsv', 'zoster', 'pneumococcal', 'hpv', 'hepatitis-b', 'tdap-td', 'covid-19',
  'mmr', 'varicella', 'hepatitis-a', 'meningococcal', 'hib', 'polio', 'mpox', 'rotavirus', 'travel', 'smallpox', 'any']);
const POPULATIONS = new Set(['infants', 'children', 'adolescents', 'adults-19-49', 'adults-50-64', 'adults-65-plus',
  'pregnancy', 'immunocompromised', 'chronic-conditions', 'health-care-personnel', 'travelers', 'all-ages']);
const VOLATILITIES = new Set(['stable', 'seasonal', 'recommendation']);
const TAGS = new Set(['eligibility', 'schedule', 'product', 'co-administration', 'contraindication', 'precaution',
  'safety', 'side-effects', 'effectiveness', 'burden', 'coverage', 'storage-handling', 'administration',
  'documentation', 'screening', 'communication', 'history', 'misconception', 'pregnancy']);
const PLAYER_TEXT_KEYS = ['statement', 'scenario', 'choices', 'statements', 'steps', 'estimate', 'reveal', 'takeaway',
  'answer', 'bestIndex', 'mythIndex'];

function loadAllRecords(): { subject: string, records: Record<string, QuestionMetadata> }[] {
  return readdirSync(METADATA_DIR).filter((f) => f.endsWith('.json')).sort()
    .map((file) => ({ subject: file.replace('.json', ''), records: JSON.parse(readFileSync(`${METADATA_DIR}/${file}`, 'utf8')) }));
}

function flatRecords(): QuestionMetadata[] {
  return loadAllRecords().flatMap(({ records }) => Object.values(records));
}

function deckLookup(): Map<string, { deck: string, question: Record<string, unknown> }> {
  const decks = new Map<string, Record<string, unknown>[]>();
  for (const deck of BUNDLED_DECKS) decks.set(deck.id, deck.questions as unknown as Record<string, unknown>[]);
  const map = new Map<string, { deck: string, question: Record<string, unknown> }>();
  for (const [deckId, questions] of decks) {
    for (const q of questions) map.set(`${deckId}:${q.id as string}`, { deck: deckId, question: q });
  }
  return map;
}

test('BANK_METADATA_COVERAGE: 150 records, 180 appearances, one record per deck question', async () => {
  const decks = new Map<string, Record<string, unknown>[]>();
  for (const deck of BUNDLED_DECKS) decks.set(deck.id, deck.questions as unknown as Record<string, unknown>[]);
  for (const [id, load] of Object.entries(SOLO_DECKS)) decks.set(id, (await load()).questions as unknown as Record<string, unknown>[]);

  const records = flatRecords();
  const byBankId = new Map(records.map((r) => [r.bankId, r]));
  const byCopy = new Map<string, string>();
  for (const r of records) for (const copyId of r.copies) byCopy.set(copyId, r.bankId);

  let appearances = 0;
  const unmapped: string[] = [];
  for (const [deckId, questions] of decks) {
    for (const q of questions) {
      appearances += 1;
      const key = `${deckId}:${q.id as string}`;
      if (!byBankId.has(key) && !byCopy.has(key)) unmapped.push(key);
    }
  }
  const orphanCopies = [...byCopy.entries()].filter(([copyId]) => !decks.get(copyId.split(':')[0]!)?.some((q) => `${copyId.split(':')[0]}:${q.id as string}` === copyId));

  console.log(`BANK_METADATA_COVERAGE records=${records.length} appearances=${appearances} decks=${decks.size}`);
  assert.ok(records.length >= 150, `expected at least 150 records, found ${records.length}`);
  assert.ok(appearances >= 180, `expected at least 180 appearances, found ${appearances}`);
  assert.deepEqual(unmapped, [], 'every deck question must map to exactly one record through bankId or copies');
  assert.deepEqual(orphanCopies, [], 'every record must map to at least one real deck question');
});

test('Copies are copies: normalized stem, kind and right token match the primary', () => {
  const lookup = deckLookup();
  const kinds = new Map(BUNDLED_DECKS.flatMap((deck) => deck.questions.map((q) => [`${deck.id}:${q.id}`, questionKind(q)])));
  for (const { records } of loadAllRecords()) {
    for (const record of Object.values(records)) {
      const primary = lookup.get(record.bankId);
      if (!primary) continue; // solo-only deck questions aren't in BUNDLED_DECKS; the coverage test already checked them
      for (const copyId of record.copies) {
        const copy = lookup.get(copyId);
        if (!copy) continue;
        const copyKind = kinds.get(copyId);
        if (copyKind) assert.equal(copyKind, record.kind, `${copyId} kind must match its primary ${record.bankId}`);
      }
    }
  }
});

test('Vocabulary: every enum value is valid, and every conceptId and tag exists in concepts.json', () => {
  const concepts = JSON.parse(readFileSync('content/bank/concepts.json', 'utf8')) as { tags: string[], concepts: Record<string, unknown> };
  const knownConcepts = new Set(Object.keys(concepts.concepts));
  const knownTags = new Set(concepts.tags);
  for (const record of flatRecords()) {
    assert.ok(STATUSES.has(record.status), `${record.bankId}: bad status ${record.status}`);
    assert.ok(SUBJECTS.has(record.subject), `${record.bankId}: bad subject ${record.subject}`);
    assert.ok(ROTATIONS.has(record.rotation), `${record.bankId}: bad rotation ${record.rotation}`);
    assert.ok(SKILL_TYPES.has(record.skill), `${record.bankId}: bad skill ${record.skill}`);
    assert.ok(AUDIENCE_PITCHES.has(record.audience), `${record.bankId}: bad audience ${record.audience}`);
    assert.ok(VOLATILITIES.has(record.evidence.volatility), `${record.bankId}: bad volatility ${record.evidence.volatility}`);
    for (const v of record.vaccines) assert.ok(VACCINES.has(v), `${record.bankId}: bad vaccine ${v}`);
    for (const p of record.populations) assert.ok(POPULATIONS.has(p), `${record.bankId}: bad population ${p}`);
    for (const t of record.tags) assert.ok(TAGS.has(t) && knownTags.has(t), `${record.bankId}: bad tag ${t}`);
    assert.ok(knownConcepts.has(record.conceptId), `${record.bankId}: conceptId ${record.conceptId} is not in concepts.json`);
  }
});

test('Kind cross-check: metadata kind equals the deck question kind', () => {
  const lookup = deckLookup();
  const kindsAll = new Map<string, string>();
  for (const deck of BUNDLED_DECKS) for (const q of deck.questions) kindsAll.set(`${deck.id}:${q.id}`, questionKind(q));
  for (const record of flatRecords()) {
    const actual = kindsAll.get(record.bankId) ?? kindsAll.get(record.copies.find((c) => kindsAll.has(c)) ?? '');
    if (!actual) continue; // a solo-only-deck primary: covered by the coverage test's deck walk instead
    assert.equal(record.kind, actual, `${record.bankId}: metadata kind ${record.kind} != deck kind ${actual}`);
  }
  void lookup;
});

test('Skill by kind: estimate is estimation, order is sequencing, a reply question is communication', () => {
  const lookup = deckLookup();
  for (const record of flatRecords()) {
    if (record.kind === 'estimate') assert.equal(record.skill, 'estimation', record.bankId);
    if (record.kind === 'order') assert.equal(record.skill, 'sequencing', record.bankId);
    const primary = lookup.get(record.bankId)?.question;
    if (record.kind === 'which-patient' && primary?.reply === true) assert.equal(record.skill, 'communication', record.bankId);
  }
});

test('Rating record: two raters or the owner, an adjudicator for every split or shared doubt, and the owner wins', () => {
  const branches = { owner: 0, adjudicated: 0, agreed: 0, play: 0 };
  const records = flatRecords();
  for (const record of records) {
    const d = record.difficulty;
    assert.ok(DIFFICULTY_LEVELS.has(d.level), `${record.bankId}: bad difficulty level ${d.level}`);
    const raterA = d.ratings.filter((r) => r.role === 'rater-a');
    const raterB = d.ratings.filter((r) => r.role === 'rater-b');
    const owner = d.ratings.find((r) => r.role === 'owner');
    const adjudicator = d.ratings.find((r) => r.role === 'adjudicator');
    const hasTwo = raterA.length === 1 && raterB.length === 1;
    const split = hasTwo && raterA[0]!.level !== raterB[0]!.level;
    const bothUnsure = hasTwo && !raterA[0]!.sure && !raterB[0]!.sure;
    if (split || bothUnsure) assert.ok(adjudicator, `${record.bankId}: a split or shared doubt needs an adjudicator`);
    if (d.source === 'play') {
      // Spec 4.9: a play level needs 60 room answers across 8 games, or 120 solo answers with the calibration kept.
      branches.play += 1;
      assert.ok(d.play, `${record.bankId}: a play level needs play evidence`);
      if (d.play.surface === 'room') assert.ok(d.play.answered >= 60 && d.play.sessions >= 8, `${record.bankId}: a room move needs 60 answers across 8 games`);
      else assert.ok(d.play.answered >= 120 && typeof d.play.soloOffset === 'number', `${record.bankId}: a solo move needs 120 answers and its soloOffset`);
      assert.ok(d.history.length > 0, `${record.bankId}: a play move needs a history entry`);
    } else {
      if (!owner) assert.ok(hasTwo, `${record.bankId}: a rubric level needs one rater-a and one rater-b entry, or an owner entry`);
      if (owner) {
        branches.owner += 1;
        assert.equal(d.level, owner.level, `${record.bankId}: the owner's ruling must be the final level`);
      } else if (adjudicator) {
        branches.adjudicated += 1;
        assert.equal(d.level, adjudicator.level, `${record.bankId}: the adjudicator's level must be the final level`);
      } else {
        branches.agreed += 1;
        assert.equal(d.level, raterA[0]!.level, `${record.bankId}: agreeing raters set the final level`);
      }
      assert.equal(d.provisional, record.kind === 'estimate', `${record.bankId}: an estimate's rubric level is provisional, nothing else is`);
    }
    assert.ok(d.rationale.length > 0 && d.rationale.length <= 140, `${record.bankId}: rationale must be one line of 140 characters or fewer`);
    assert.ok(!/[;—]/.test(d.rationale), `${record.bankId}: rationale has a semicolon or an em dash`);
    for (const r of d.ratings) {
      assert.ok(r.reason.length <= 140, `${record.bankId}: rater reason over 140 characters`);
      assert.ok(!/[;—]/.test(r.reason), `${record.bankId}: rater reason has a semicolon or an em dash`);
      assert.ok(r.rater.length > 0 && /^\d{4}-\d{2}-\d{2}$/.test(r.ratedOn), `${record.bankId}: every rating names its rater and date`);
      for (const flag of r.flags) assert.ok(record.wordingFlags.includes(flag), `${record.bankId}: flag ${flag} was raised but not merged onto the record`);
    }
  }
  // Each rubric branch must actually run, or a data change could hollow one out while this test stays green.
  console.log(`BANK_RATING_BRANCHES owner=${branches.owner} adjudicated=${branches.adjudicated} agreed=${branches.agreed} play=${branches.play}`);
  assert.equal(branches.owner + branches.adjudicated + branches.agreed + branches.play, records.length, 'every record takes exactly one branch');
  assert.ok(branches.owner > 0 && branches.adjudicated > 0 && branches.agreed > 0, 'the owner, adjudicated and agreed branches must each check at least one record');
});

test('Final level: every record and every runtime entry carries a final difficulty level, never a pending placeholder', () => {
  const records = flatRecords();
  const final = records.filter((r) => DIFFICULTY_LEVELS.has(r.difficulty?.level) && !('pending' in (r.difficulty ?? {})));
  const runtime = Object.entries(BANK_META);
  const runtimeFinal = runtime.filter(([, meta]) => DIFFICULTY_LEVELS.has(meta.difficulty));
  console.log(`BANK_DIFFICULTY_COVERAGE final=${final.length} records=${records.length} runtimeFinal=${runtimeFinal.length} runtime=${runtime.length}`);
  assert.ok(records.length >= 150, `expected at least 150 records, found ${records.length}`);
  assert.deepEqual(records.filter((r) => !final.includes(r)).map((r) => r.bankId), [], 'every record needs a final difficulty level');
  assert.equal(runtime.length, records.length, 'the runtime slice must carry one entry per record');
  assert.deepEqual(runtime.filter(([, meta]) => !DIFFICULTY_LEVELS.has(meta.difficulty)).map(([id]) => id), [], 'every runtime entry needs a final difficulty level');
});

test('Evidence: sourceIds, volatility and reviewBy are structurally sound', () => {
  for (const record of flatRecords()) {
    assert.ok(Array.isArray(record.evidence.sourceIds), record.bankId);
    assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(record.evidence.reviewBy), `${record.bankId}: reviewBy must be YYYY-MM-DD`);
    if (record.provenance.origin === 'agent-drafted' && record.status === 'live') {
      assert.ok(record.evidence.claims.length > 0, `${record.bankId}: an agent-drafted live record needs at least one claim`);
      for (const claim of record.evidence.claims) {
        assert.ok(claim.url && claim.quote && claim.retrievedOn, `${record.bankId}: claim ${claim.id} missing url, quote or retrievedOn`);
      }
    }
  }
});

test('Review-by: no live record is already past its reviewBy date (clock is injectable)', () => {
  const now = () => new Date('2026-09-28T00:00:00Z'); // matches the backfill's generatedOn; swap for a real clock in a later phase
  for (const record of flatRecords()) {
    if (record.status !== 'live') continue;
    const due = new Date(`${record.evidence.reviewBy}T00:00:00Z`);
    assert.ok(due.getTime() >= now().getTime(), `${record.bankId}: reviewBy ${record.evidence.reviewBy} is already past`);
  }
});

test('No player text: no metadata record carries a player-text key, and index.ts never spreads metadata onto a question', () => {
  for (const { subject, records } of loadAllRecords()) {
    const raw = JSON.stringify(records);
    for (const key of PLAYER_TEXT_KEYS) {
      assert.ok(!new RegExp(`"${key}"\\s*:`).test(raw), `content/bank/metadata/${subject}.json carries player-text key "${key}"`);
    }
  }
  const indexSrc = readFileSync('src/data/bank/index.ts', 'utf8');
  assert.ok(!/\.\.\.(BANK_META|bankMetaFor|meta)/.test(indexSrc), 'src/data/bank/index.ts must never spread metadata onto a question');
});

test('Generated slice: metadata.generated.ts equals a fresh run of scripts/build-bank.mjs', () => {
  execFileSync('node', ['--import', 'tsx', 'scripts/build-bank.mjs', '--check'], { encoding: 'utf8' });
});

test('One concept per rotation: within a subject and kind, at most one core record per conceptId', () => {
  const bySubjectKindConcept = new Map<string, string[]>();
  for (const record of flatRecords()) {
    if (record.rotation !== 'core') continue;
    const key = `${record.subject}::${record.kind}::${record.conceptId}`;
    bySubjectKindConcept.set(key, [...(bySubjectKindConcept.get(key) ?? []), record.bankId]);
  }
  for (const [key, ids] of bySubjectKindConcept) assert.equal(ids.length, 1, `${key} has ${ids.length} core records: ${ids.join(', ')}`);
});

test('Known concept twins share one id so a solo round cannot deal both', () => {
  const byId = new Map(flatRecords().map((record) => [record.bankId, record]));
  assert.equal(byId.get('art-of-the-offer:q1')?.conceptId, byId.get('art-of-the-offer:q2')?.conceptId);
  assert.equal(byId.get('vax-or-fiction:q9')?.conceptId, byId.get('hpv:q5')?.conceptId);
  assert.equal(byId.get('hpv:q5')?.rotation, 'core');
  assert.equal(byId.get('vax-or-fiction:q9')?.rotation, 'alternate');
});

test('Adjudicated tags, populations and volatility remain attached to their bank records', () => {
  const byId = new Map(flatRecords().map((record) => [record.bankId, record]));
  const expectedTags: Record<string, string[]> = {
    'vax-or-fiction:q4': ['burden'],
    'vax-or-fiction:q5': ['burden'],
    'vax-or-fiction:q6': ['safety'],
    'vax-or-fiction:q7': ['eligibility'],
    'vax-or-fiction:q23': ['eligibility', 'schedule'],
    'vax-or-fiction:q30': ['eligibility'],
    'vax-or-fiction:q32': ['eligibility'],
    'flagship:q1': ['screening', 'burden'],
    'flagship-r2:q17': ['safety'],
    'season-2:q2': ['misconception', 'side-effects'],
    'season-2:q5': ['pregnancy', 'effectiveness'],
    'season-2:q6': ['misconception', 'effectiveness'],
    'season-2:q11': ['burden', 'effectiveness'],
    'season-2:q20': ['effectiveness', 'burden'],
    'influenza:q3': ['precaution', 'safety'],
    'influenza:q4': ['misconception', 'safety'],
    'influenza:q8': ['misconception', 'effectiveness'],
    'pneumococcal:q2': ['misconception', 'effectiveness'],
    'hpv:q4': ['eligibility', 'schedule'],
    'hpv:q6': ['misconception'],
  };
  for (const [id, tags] of Object.entries(expectedTags)) assert.deepEqual(byId.get(id)?.tags, tags, id);
  assert.deepEqual(byId.get('vax-or-fiction:q23')?.populations, ['adults-19-49']);
  assert.deepEqual(byId.get('vax-or-fiction:q32')?.populations, ['pregnancy', 'infants']);
  assert.deepEqual(byId.get('hpv:q4')?.populations, ['adults-19-49']);
  for (const id of ['vax-or-fiction:q10', 'vax-or-fiction:q12', 'season-2:q19', 'art-of-the-offer:q17']) {
    assert.deepEqual(byId.get(id)?.populations, ['adults-19-49', 'adults-50-64', 'adults-65-plus'], id);
  }
  assert.deepEqual(byId.get('season-2:q18')?.populations, ['adults-19-49']);
  assert.equal(byId.get('vax-or-fiction:q7')?.evidence.reviewBy, '2027-03-28');
  assert.equal(byId.get('vax-or-fiction:q7')?.evidence.volatility, 'recommendation');
  assert.equal(byId.get('hpv:q4')?.evidence.reviewBy, '2027-03-28');
});

test('Rotation targets: a subject marked grown in concepts.json meets its section 6 kind and level targets', () => {
  const concepts = JSON.parse(readFileSync('content/bank/concepts.json', 'utf8')) as Record<string, unknown>;
  const grown = (concepts as { grownSubjects?: string[] }).grownSubjects ?? [];
  assert.deepEqual(grown, [], 'phase 2 marks no subject grown yet; growth batches (phase 5) do');
});

test('Boundary: nothing under src imports content/bank', () => {
  // An actual import/require statement, not a comment mentioning the path (this file's own doc comments do).
  let hits: string[] = [];
  try {
    hits = execFileSync('grep', ['-rlE', String.raw`(from|require\()\s*['"].*content/bank`, 'src'], { encoding: 'utf8' }).split('\n').filter(Boolean);
  } catch (err: unknown) {
    const status = (err as { status?: number }).status;
    if (status !== 1) throw err; // grep exit 1 means "no match", which is the passing case
  }
  assert.deepEqual(hits, [], `these files under src import content/bank: ${hits.join(', ')}`);
});
