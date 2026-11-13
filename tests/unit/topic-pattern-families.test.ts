// Topic pattern families (VOF-94). Every question in every deck belongs to exactly one family, the big screen and the
// phone reach the same family for it, and a question with no family fails here before it can reach a screen as a bare
// background. The index that says which family is generated (scripts/build-pattern-index.mjs), so this also holds the
// committed index to what the decks and the owner's solo topics say today.
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import test from 'node:test';
import { projectPublicQuestion } from '../../src/network/projection';
import { PATTERN_FAMILIES, stemKey, type PatternFamilyId } from '../../src/looks/patterns/families';
import { familyForStatement } from '../../src/looks/patterns/topic-map';
import { STEM_FAMILY } from '../../src/looks/patterns/topic-index';
import { THEME_FAMILY, deriveIndex, loadDecks, renderIndex } from '../../scripts/pattern-index-lib.mjs';

const repoRoot = resolve(import.meta.dirname, '../..');
const FAMILIES = Object.keys(PATTERN_FAMILIES) as PatternFamilyId[];
const NO_FAMILY_HELP = 'Run: npm run patterns:index. A new question takes the family of its solo topic (src/data/decks/topics/themes.ts), or add an override in scripts/pattern-index-lib.mjs.';

test('every bundled question has a family, and the big screen and the phone reach the same one', async () => {
  const decks = await loadDecks();
  let covered = 0;
  let withScenario = 0;
  for (const [deckId, deck] of Object.entries(decks)) {
    for (const question of deck.questions) {
      const phone = projectPublicQuestion(question, 'probe', 1, 1).question;
      assert.ok(phone, `${deckId} ${question.id}: no public question`);
      if (phone.statement.includes('\n\n')) withScenario += 1;
      const stage = stemKey(question.statement);
      assert.equal(stemKey(phone.statement), stage, `${deckId} ${question.id}: the phone's stem fingerprint differs from the stage's`);
      assert.ok(STEM_FAMILY[stage], `${deckId} ${question.id}: no family in topic-index.ts. ${NO_FAMILY_HELP}`);
      assert.equal(familyForStatement(phone.statement), familyForStatement(question.statement), `${deckId} ${question.id}: the two surfaces disagree on the family`);
      assert.ok(FAMILIES.includes(familyForStatement(question.statement)!), `${deckId} ${question.id}: its family exists`);
      covered += 1;
    }
  }
  // A sweep that saw nothing would pass every check above, so it must have seen the bundle, scenarios included.
  console.log(`topic patterns: ${covered} bundled questions checked in ${Object.keys(decks).length} decks, ${withScenario} with a scenario on the phone`);
  assert.ok(Object.keys(decks).length >= 13, 'the show deck, the flagship and the eleven solo topic decks');
  assert.ok(covered >= 174, `only ${covered} bundled questions were checked`);
  assert.ok(withScenario > 0, 'no phone statement carried a scenario, so the stem cut was never exercised');
});

test('the committed index is exactly what the decks and the solo topics derive, and the guard sees a question with no topic', async () => {
  const decks = await loadDecks();
  const derived = deriveIndex(decks);
  assert.deepEqual(derived.problems, [], 'the derivation finds nothing wrong');
  assert.equal(derived.rows.length, Object.values(decks).reduce((sum, deck) => sum + deck.questions.length, 0), 'every question is in it');
  assert.equal(
    readFileSync(resolve(repoRoot, 'src/looks/patterns/topic-index.ts'), 'utf8'),
    renderIndex(derived.byKey),
    `src/looks/patterns/topic-index.ts is out of date. ${NO_FAMILY_HELP}`,
  );
  assert.equal(Object.keys(STEM_FAMILY).length, derived.byKey.size, 'the index holds one entry per distinct stem');

  // Control: a new question that no topic or override names is reported by name, so the guard above can see one.
  const show = decks['vax-or-fiction'];
  const grown = { ...decks, 'vax-or-fiction': { ...show, questions: [...show.questions, { ...show.questions[0], id: 'q999', statement: 'A brand new question about nothing in particular.' }] } };
  const control = deriveIndex(grown);
  assert.ok(control.problems.some((problem) => problem.startsWith('vax-or-fiction:q999 has no family')), `a question with no topic is reported (${control.problems.join(' | ')})`);
  // And an index that was not regenerated for it no longer matches the derivation, which is how the committed one is caught.
  assert.notEqual(renderIndex(deriveIndex(decks).byKey), renderIndex(new Map([...derived.byKey].slice(1))), 'a missing entry changes the text');
});

test('no two stems share a fingerprint, no stem sits in two families, and every family has questions', async () => {
  const { rows, byKey } = deriveIndex(await loadDecks());
  const seen = new Map<string, string>();
  for (const row of rows) {
    const text = row.statement.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
    const key = stemKey(row.statement);
    const prior = seen.get(key);
    assert.ok(prior === undefined || prior === text, `${row.key}: a different stem has the fingerprint ${key}`);
    seen.set(key, text);
    assert.equal(STEM_FAMILY[key], row.family, `${row.key}: one family for the stem`);
  }
  assert.equal(byKey.size, seen.size);
  for (const family of FAMILIES) assert.ok(rows.some((row) => row.family === family), `${family}: at least one question`);
  assert.deepEqual([...new Set(Object.values(STEM_FAMILY))].sort(), [...FAMILIES].sort(), 'the index uses every family and none that does not exist');
});

test('the stem fingerprint ignores spacing, case and the scenario under the stem, and nothing else', () => {
  assert.equal(stemKey('Older adults  hospitalized with RSV rarely need intensive care.'), stemKey('older adults hospitalized with rsv rarely need intensive care.'));
  assert.equal(stemKey('A stem.\n\nA scenario under it.'), stemKey('A stem.'));
  assert.equal(stemKey('\n\nA stem.\n'), stemKey('A stem.'), 'a blank line in front is trimmed, so the stage and a phone fingerprint one stem alike');
  assert.notEqual(stemKey('A stem.'), stemKey('A different stem.'));
  assert.equal(familyForStatement(''), null);
  assert.equal(familyForStatement('   '), null);
  assert.equal(familyForStatement(null), null);
  assert.equal(familyForStatement(undefined), null);
  assert.equal(familyForStatement('A custom question about nothing in particular.'), null, 'a stem outside the bundle draws no pattern');
});

test('the Tdap in pregnancy questions and the other pregnancy questions that protect the baby use the newborns family, and the syringe family is the one visit', async () => {
  const { rows } = deriveIndex(await loadDecks());
  const family = (key: string) => rows.find((row) => row.key === key)?.family;
  for (const key of ['tdap:q1', 'tdap:q6', 'vax-or-fiction:q8', 'vax-or-fiction:q24', 'flagship:q11', 'flagship:q19', 'season-2:q10', 'art-of-the-offer:q13']) {
    assert.equal(family(key), 'newborns', `${key}: the owner ruled Tdap in pregnancy is newborns`);
  }
  for (const key of ['art-of-the-offer:q10', 'art-of-the-offer:q14', 'rsv:q5']) assert.equal(family(key), 'newborns', `${key}: pregnancy and the baby`);
  assert.equal(family('hpv:q8'), 'hpv', 'a question about the HPV series stays with HPV even though it mentions pregnancy');
  assert.equal(family('vax-or-fiction:q17'), 'one-visit');
  assert.equal(family('co-administration:q1'), 'one-visit');
  assert.deepEqual(Object.keys(THEME_FAMILY).sort(), ['at-the-counter', 'big-picture', 'flu', 'hepatitis-b', 'hpv', 'pneumococcal', 'rsv', 'shingles', 'tetanus', 'what-to-say'], 'every solo topic has a family');
});

/** The size and the alpha flag of an extended (VP8X) WebP, from its header. */
function webpHeader(file: string): { width: number; height: number; alpha: boolean } {
  const bytes = readFileSync(file);
  assert.equal(bytes.toString('ascii', 0, 4), 'RIFF', `${file} is a RIFF file`);
  assert.equal(bytes.toString('ascii', 8, 12), 'WEBP', `${file} is a WebP`);
  assert.equal(bytes.toString('ascii', 12, 16), 'VP8X', `${file} carries the extended header`);
  return { width: 1 + bytes.readUIntLE(24, 3), height: 1 + bytes.readUIntLE(27, 3), alpha: (bytes[20]! & 0x10) !== 0 };
}

test('every family has one tile, a square WebP mask with an alpha channel, and the folder holds nothing else', () => {
  const dir = resolve(repoRoot, 'public/pattern-art');
  // Everything under public/ is served at a public URL, so the folder holds the tiles and nothing else. The note on how they
  // were made, and the prompts, are kept in docs/art.
  assert.ok(existsSync(resolve(repoRoot, 'docs/art/pattern-tiles/README.md')), 'the note on how the tiles were made is kept in docs/art');
  assert.deepEqual(readdirSync(dir).sort(), FAMILIES.map((family) => `${family}.webp`).sort(), 'one tile per family and no stray file, no README included');
  let total = 0;
  for (const family of FAMILIES) {
    const file = resolve(dir, `${family}.webp`);
    const { width, height, alpha } = webpHeader(file);
    assert.equal(width, height, `${family}: the tile is square so it repeats without a seam shift`);
    assert.ok(width >= 512 && width <= 2048, `${family}: a tile of ${width}px draws crisply and stays light`);
    assert.ok(alpha, `${family}: the shape is in the alpha channel, since the layer uses the tile as a mask`);
    const bytes = readFileSync(file).byteLength;
    assert.ok(bytes <= 160 * 1024, `${family}: a tile loads with a question, so it stays light (${bytes} bytes)`);
    total += bytes;
    const { scale } = PATTERN_FAMILIES[family];
    assert.ok(scale >= 0.5 && scale <= 2, `${family}: its tile scale (${scale}) stays within half and double the base`);
  }
  assert.ok(total <= 1.1 * 1024 * 1024, `the fourteen tiles stay near one megabyte together (${total} bytes), and a page loads one`);
});

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : /\.(ts|tsx|css)$/.test(entry.name) ? [path] : [];
  });
}

test('nothing ships unused: the pattern folder is the texture layer and its setting, with no line or silhouette code and no icon set', () => {
  const dir = resolve(repoRoot, 'src/looks/patterns');
  assert.deepEqual(readdirSync(dir).sort(), [
    'TopicPattern.tsx', 'TopicPatternSlot.tsx', 'families.ts', 'pattern-setting.ts', 'patterns.css', 'phone-topic.ts', 'quiet-viewer.ts', 'topic-index.ts', 'topic-map.ts',
  ]);
  assert.equal(existsSync(resolve(dir, 'icons.ts')), false, 'the icon set stays out');
  const text = sourceFiles(dir).map((file) => readFileSync(file, 'utf8')).join('\n');
  assert.doesNotMatch(text, /silhouette|data-pattern="line"|PATTERN_ICONS|IconForm|healthicons/i, 'no other style and no icons');
});

test('the pattern loads only when a question needs it: nothing outside the pattern folder imports its layer, its styles or its index', () => {
  const srcRoot = resolve(repoRoot, 'src');
  const importing = /(?:import\s*\(|import\s+|from\s+)['"][^'"]*patterns\/(?:TopicPattern|patterns\.css|topic-map|topic-index|families)['"]/;
  const offenders = sourceFiles(srcRoot).filter((file) => !relative(srcRoot, file).startsWith('looks/patterns') && importing.test(readFileSync(file, 'utf8')));
  assert.deepEqual(offenders.map((file) => relative(repoRoot, file)), [], 'only the slot, inside the folder, reaches for them');

  const slot = readFileSync(resolve(srcRoot, 'looks/patterns/TopicPatternSlot.tsx'), 'utf8');
  assert.match(slot, /lazy\(\(\) => import\("\.\/TopicPattern"\)/, 'the slot loads the layer dynamically');
  assert.match(slot, /\.catch\(/, 'and a layer that cannot be fetched becomes a layer that draws nothing');
  assert.match(slot, /class LayerBoundary/, 'behind a boundary, so a layer that cannot load never takes a question down');
  assert.doesNotMatch(slot, /^import (?!type\b).*\.\/TopicPattern['"]/m, 'and never statically (a type-only import is erased and is fine)');
  const layer = readFileSync(resolve(srcRoot, 'looks/patterns/TopicPattern.tsx'), 'utf8');
  assert.match(layer, /import "\.\/patterns\.css";/, 'the layer carries its own styles, so a page that never asks one downloads none');
  for (const entry of ['src/App.tsx', 'src/main.tsx', 'src/index.css']) {
    assert.doesNotMatch(readFileSync(resolve(repoRoot, entry), 'utf8'), /patterns\.css|patterns\/TopicPattern/, `${entry} does not pull the pattern in`);
  }
  // A tile is requested by the layer for the family on screen and by nothing else.
  assert.match(layer, /pattern-art\/\$\{family\}\.webp/, 'one place builds a tile path');

  // The three files of the folder that load with the page (the slot, the phone's stem store and the setting) must not reach the lazy
  // ones, or the layer, its styles and the index of questions ride along with them. A type-only import is erased and is fine.
  const staticLazy = /^\s*import\s+(?!type\b)[^;\n]*from\s+['"]\.\/(?:TopicPattern|topic-map|topic-index|families)['"]|^\s*import\s+['"]\.\/patterns\.css['"]/m;
  for (const name of ['TopicPatternSlot.tsx', 'phone-topic.ts', 'pattern-setting.ts']) {
    assert.doesNotMatch(readFileSync(resolve(srcRoot, 'looks/patterns', name), 'utf8'), staticLazy, `${name} loads with the page and never imports the lazy files statically`);
  }
});
