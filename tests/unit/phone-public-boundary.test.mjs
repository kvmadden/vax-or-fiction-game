import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '../..');
const srcRoot = path.join(root, 'src');
const phoneDir = path.join(root, 'src/phone');
const phoneSources = fs.readdirSync(phoneDir)
  .filter((name) => /\.tsx?$/.test(name))
  .map((name) => ({ name, source: fs.readFileSync(path.join(phoneDir, name), 'utf8') }));

// Every name here reads only its own caller-supplied arguments (a kind, a statement, a scenario
// string, a reply flag) and never reaches a question's answer, best choice, myth index, reveal or
// takeaway. Each addition needs the same explicit boundary review the comment above used to name for
// kindEyebrow alone. asksForReply and phoneScenarioLabel added (review finding, 2026-09-27): the phone
// derives its own "Patient says" vs "Scenario" label from scenario text, since the room wire carries no
// scenarioVoice field, and needs asksForReply's public-data-only read to know which label applies.
// QUESTION_KINDS added (review finding, 2026-09-28): it is a frozen array of the five kind-name strings
// (src/engine/kinds.ts:11), never a question or an answer, and engine/instruction-lines.ts (imported by
// PhoneVote.tsx) reads it to pick a per-kind instruction line. isTerminalSlide added (same finding): it
// reads only a static slide's own `type`/`id` string (src/engine/kinds.ts:56), never a question's answer,
// and engine/audio-cues.ts (imported by PhoneSuite/phone-vote-utils/PhoneLayout/PhoneJoin) uses it to
// pick a closing cue. isQuestionSlide added (same finding): it reads only a slide's own `id`/`kind`
// fields and whether an `answer` key is present, never the answer's value (src/engine/kinds.ts:31), and
// engine/state-machine.ts (imported by audio-lifecycle/audio-cues, which the phone bundle reaches) uses
// it to tell a question slide from a static one.
const PHONE_SAFE_KINDS_EXPORTS = new Set(['kindEyebrow', 'asksForReply', 'phoneScenarioLabel', 'QUESTION_KINDS', 'isTerminalSlide', 'isQuestionSlide']);

function isAllowedKindsImport(bindings) {
  const match = /^\{([^}]*)\}$/.exec((bindings ?? '').trim());
  if (!match) return false;
  const names = match[1].split(',').map((name) => name.trim()).filter(Boolean);
  return names.length > 0 && names.every((name) => PHONE_SAFE_KINDS_EXPORTS.has(name));
}

// Three forms: `import/export {...} from "x"` (bindings in group 1, specifier in group 2), a dynamic
// `import("x")` (specifier in group 3), and a bare side-effect `import "x"` with no bindings and no
// `from` at all (specifier in group 4). Reviewer finding, 2026-09-28: this guard used to match only the
// first two forms, so `import '../data/decks/vax-or-fiction';` (no bindings, no `from`) was invisible to
// it even though the deck, and its answers, still ship in whatever bundle contains that line. The
// bindings group's `[^;]*?` and the bare-specifier form both already span newlines (a negated character
// class is unaffected by the regex engine's dotAll/multiline flags), so a multi-line named-import list
// is covered without any extra handling.
const IMPORT_PATTERN = /(?:import|export)\s+([^;]*?)\s+from\s+["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)|import\s+["']([^"']+)["']/g;

function matchImports(source) {
  return [...source.matchAll(IMPORT_PATTERN)];
}

function specifierOf([, , staticPath, dynamicPath, bareStaticPath]) {
  return staticPath || dynamicPath || bareStaticPath;
}

/** Whether this one import line itself crosses the boundary, independent of anything it pulls in transitively. */
function lineCrossesHostBoundary(bindings, specifier) {
  if (/(?:^|\/)(?:store\/game-store|data\/(?:decks?|questions|editorial-library)|providers\/OfflineProvider)(?:[./]|$)/.test(specifier)) return true;
  if (/(?:^|\/)engine\/kinds(?:\.|$)/.test(specifier)) return !isAllowedKindsImport(bindings);
  return false;
}

function crossesHostBoundary(source) {
  return matchImports(source).some((match) => lineCrossesHostBoundary(match[1], specifierOf(match)));
}

// Vite's resolve.alias (vite.config.ts) and tsconfig's paths both map "@/x" to "src/x". Reviewer finding,
// 2026-09-28: the codebase actually uses this alias (src/main.tsx:4), and resolveLocalImport used to
// return null for anything not starting with ".", so an "@/" import was as invisible to the transitive
// walk as a bare package import.
const ALIAS_PREFIX = '@/';

/**
 * Resolves an import specifier to a real file under src/, the same way Vite/tsconfig do: a relative
 * specifier resolves against the importing file's own directory, and an "@/" specifier resolves against
 * src/ directly. Tries the result as given, then with a .ts/.tsx/.mts extension, then as a directory's
 * index.ts(x). Returns null for a bare package specifier (neither form) or anything not resolvable
 * inside src/.
 */
function resolveLocalImport(fromFile, specifier) {
  const base = specifier.startsWith(ALIAS_PREFIX) ? path.join(srcRoot, specifier.slice(ALIAS_PREFIX.length))
    : specifier.startsWith('.') ? path.resolve(path.dirname(fromFile), specifier)
    : null;
  if (!base) return null;
  const candidates = [base, `${base}.tsx`, `${base}.ts`, `${base}.mts`, path.join(base, 'index.tsx'), path.join(base, 'index.ts')];
  const found = candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
  if (!found || !found.startsWith(srcRoot)) return null;
  return found;
}

// data/decks and (were it to exist) data/questions are directories of many files, not one file each, so
// the suffix has to accept either an exact "…/data/decks.ts"-shaped match (the "\.[^/]+" branch) or
// anything nested under the directory (the "/.*" branch). Before this the pattern only matched the exact
// single-file form, so a resolved path like ".../src/data/decks/vax-or-fiction.ts" never matched at all,
// and no deck file was ever actually caught by the transitive (resolved-path) check, only by the
// legacy text-only crossesHostBoundary above (reviewer finding, 2026-09-28).
const PRIVATE_PATH_SUFFIX = /\/src\/(?:store\/game-store|data\/(?:decks?|questions|editorial-library)|providers\/OfflineProvider)(?:\.[^/]+|\/.*)?$/;
const KINDS_PATH_SUFFIX = /\/src\/engine\/kinds\.tsx?$/;

/**
 * The real-file counterpart to crossesHostBoundary/lineCrossesHostBoundary, for modules reached by the
 * transitive walk below. Text-matching a raw specifier for "engine/kinds" only works from src/phone/
 * itself ("../engine/kinds"); a module inside src/engine/ importing its neighbor writes "./kinds", which
 * does not contain that text at all despite being the exact same file. This resolves every specifier to
 * its real path first and checks that instead, so the depth of the relative path, or which alias it used,
 * never matters.
 */
function moduleCrossesHostBoundary(file, source) {
  return matchImports(source).some((match) => {
    const specifier = specifierOf(match);
    if (!specifier) return false;
    const resolved = resolveLocalImport(file, specifier);
    if (!resolved) return false;
    if (PRIVATE_PATH_SUFFIX.test(resolved)) return true;
    if (KINDS_PATH_SUFFIX.test(resolved)) return !isAllowedKindsImport(match[1]);
    return false;
  });
}

/**
 * Review finding (2026-09-28): PhoneVote imports engine/instruction-lines, which itself imports
 * engine/kinds, and the direct check above only ever read files inside src/phone/ itself, so a private
 * import smuggled into instruction-lines.ts (or anything else the phone bundle pulls in transitively)
 * was invisible to this guard. This walks the real import graph starting from every phone source, the
 * same resolution Vite would use, and checks every reachable module's own import lines, not just the
 * phone directory's own files.
 *
 * `overrides` (reviewer finding, 2026-09-28) lets a test substitute one file's source in memory, for
 * example to prove the walk would catch a bad import without ever writing that file to disk: a killed
 * test run used to leave the on-disk mutation in the tree, and a concurrent test process could read it
 * mid-run. Only the map's own entries are overridden; every other file still reads from disk.
 */
function reachableModules(entryFiles, overrides = new Map()) {
  const visited = new Map();
  const queue = [...entryFiles];
  while (queue.length > 0) {
    const file = queue.shift();
    if (visited.has(file)) continue;
    const source = overrides.has(file) ? overrides.get(file) : fs.readFileSync(file, 'utf8');
    visited.set(file, source);
    for (const match of matchImports(source)) {
      const specifier = specifierOf(match);
      if (!specifier) continue;
      const resolved = resolveLocalImport(file, specifier);
      if (resolved && !visited.has(resolved)) queue.push(resolved);
    }
  }
  return visited;
}

test('phone sources have no host-store or answer-bearing imports', () => {
  assert.ok(phoneSources.length > 0, 'phone source inventory must be nonempty');
  const offender = phoneSources.find(({ source }) => crossesHostBoundary(source));
  assert.equal(offender, undefined, `phone module crosses the private host boundary: ${offender?.name}`);
  console.log(`phone import coverage: ${phoneSources.length} TypeScript/TSX modules`);
});

test('the boundary guard follows imports through: a private import hidden behind an intermediate module is still caught', () => {
  const entryFiles = phoneSources.map(({ name }) => path.join(phoneDir, name));
  const modules = reachableModules(entryFiles);
  assert.ok(modules.size > phoneSources.length, 'the walk must actually leave src/phone/ and reach at least one intermediate module');
  const instructionLines = [...modules.keys()].find((file) => file.endsWith('src/engine/instruction-lines.ts'));
  assert.ok(instructionLines, 'engine/instruction-lines.ts must be reached transitively from a phone source (PhoneVote imports it)');

  const offender = [...modules.entries()].find(([file, source]) => moduleCrossesHostBoundary(file, source));
  assert.equal(offender?.[0], undefined, `a module reachable from the phone bundle crosses the private host boundary: ${offender?.[0]}`);
  console.log(`phone transitive import coverage: ${modules.size} modules reached from ${phoneSources.length} phone sources`);
});

// Reviewer finding, 2026-09-28: the RED control used to fs.writeFileSync the real
// instruction-lines.ts, mutate it on disk, and restore it in a finally block. A killed run skipped the
// finally and left the answer-bearing import in the tree, and a concurrent test process reading the file
// mid-run would see the mutated, not the real, source. Every case below instead passes its mutated
// source through reachableModules' in-memory `overrides` map: the file on disk is never touched.
const INSTRUCTION_LINES_PATH = path.join(srcRoot, 'engine/instruction-lines.ts');
const INSTRUCTION_LINES_SOURCE = fs.readFileSync(INSTRUCTION_LINES_PATH, 'utf8');
const INSTRUCTION_LINES_REAL_IMPORT = "import { asksForReply, QUESTION_KINDS } from './kinds';";
assert.ok(
  INSTRUCTION_LINES_SOURCE.includes(INSTRUCTION_LINES_REAL_IMPORT),
  'every RED control below assumes this exact import line is still in instruction-lines.ts',
);

function assertOffenderIsInstructionLines(mutatedSource, label) {
  assert.notEqual(mutatedSource, INSTRUCTION_LINES_SOURCE, `${label}: the mutation must actually change the source, or this control proves nothing`);
  const entryFiles = phoneSources.map(({ name }) => path.join(phoneDir, name));
  const modules = reachableModules(entryFiles, new Map([[INSTRUCTION_LINES_PATH, mutatedSource]]));
  const offender = [...modules.entries()].find(([file, source]) => moduleCrossesHostBoundary(file, source));
  assert.equal(offender?.[0], INSTRUCTION_LINES_PATH, `${label}: must be caught by the transitive walk`);
}

test('transitive boundary guard (RED control): an answer-bearing import smuggled into instruction-lines.ts is caught', () => {
  assert.doesNotMatch(INSTRUCTION_LINES_SOURCE, /rightToken/, 'this control only means something if instruction-lines.ts does not already import rightToken');
  const mutated = INSTRUCTION_LINES_SOURCE.replace(
    INSTRUCTION_LINES_REAL_IMPORT,
    "import { asksForReply, QUESTION_KINDS, rightToken } from './kinds';",
  );
  assertOffenderIsInstructionLines(mutated, 'a relative rightToken import');
});

// Reviewer finding, 2026-09-28: in a scratch copy, the reviewer added a used "@/data/decks/vax-or-fiction"
// import to instruction-lines.ts and the guard stayed green, because resolveLocalImport returned null for
// anything not starting with ".", and IMPORT_PATTERN never matched a bare `import '…';` with no `from` at
// all. Each of these three forms is now its own RED control.
test('transitive boundary guard (RED control): an @/-alias import of rightToken is caught', () => {
  const mutated = INSTRUCTION_LINES_SOURCE.replace(
    INSTRUCTION_LINES_REAL_IMPORT,
    "import { asksForReply, QUESTION_KINDS, rightToken } from '@/engine/kinds';",
  );
  assertOffenderIsInstructionLines(mutated, 'an @/-alias rightToken import');
});

test('transitive boundary guard (RED control): a bare side-effect deck import is caught', () => {
  const mutated = `import '../data/decks/vax-or-fiction';\n${INSTRUCTION_LINES_SOURCE}`;
  assertOffenderIsInstructionLines(mutated, 'a bare side-effect deck import');
});

test('transitive boundary guard (RED control): an @/-alias deck import that is actually used is caught', () => {
  const mutated = `import { vaxOrFictionDeck } from '@/data/decks/vax-or-fiction';\nconsole.log(vaxOrFictionDeck.id);\n${INSTRUCTION_LINES_SOURCE}`;
  assertOffenderIsInstructionLines(mutated, 'a used @/-alias deck import');
});

test('the boundary guard reads a multi-line named-import list the same as a one-line one', () => {
  const oneLine = "import { asksForReply, kindEyebrow, phoneScenarioLabel } from '../engine/kinds';";
  const multiLine = "import {\n  asksForReply,\n  kindEyebrow,\n  phoneScenarioLabel,\n} from '../engine/kinds';";
  assert.equal(crossesHostBoundary(oneLine), false);
  assert.equal(crossesHostBoundary(multiLine), false, 'a multi-line safe import list is still recognized as safe');
  const multiLineOffender = "import {\n  asksForReply,\n  rightToken,\n} from '../engine/kinds';";
  assert.equal(crossesHostBoundary(multiLineOffender), true, 'a multi-line private import list is still caught');
});

test('phone import guard allows the public label formatters and rejects injected private imports', () => {
  assert.equal(crossesHostBoundary("import { kindEyebrow } from '../engine/kinds';"), false);
  assert.equal(crossesHostBoundary("import { asksForReply, kindEyebrow, phoneScenarioLabel } from '../engine/kinds';"), false);
  assert.equal(crossesHostBoundary("import { phoneScenarioLabel } from '../engine/kinds';"), false);
  for (const source of [
    "import { useGameStore } from '../store/game-store';",
    "import { vaxOrFictionDeck } from '../data/decks/vax-or-fiction';",
    "import { questionData } from '../data/questions';",
    "import { buildActivationReviewDeck } from '../data/editorial-library';",
    "export { OfflineProvider } from '../providers/OfflineProvider';",
    "const deck = import('../data/decks/vax-or-fiction');",
    "import { kindEyebrow, evaluateAnswer } from '../engine/kinds';",
    "import { asksForReply, rightToken } from '../engine/kinds';",
    "import { isRightChoice } from '../engine/kinds';",
    // @/-alias and bare-import forms (reviewer finding, 2026-09-28).
    "import { asksForReply, rightToken } from '@/engine/kinds';",
    "import '../data/decks/vax-or-fiction';",
    "import { vaxOrFictionDeck } from '@/data/decks/vax-or-fiction';",
  ]) assert.equal(crossesHostBoundary(source), true, `injected private import is RED: ${source}`);
});

test('phone controls consume public options and closing has no fabricated results', () => {
  const vote = phoneSources.find(({ name }) => name === 'PhoneVote.tsx')?.source ?? '';
  // The room close lives in ClosingPodium (PhoneClosing hands it over), so both are scanned.
  const closing = ['PhoneClosing.tsx', 'ClosingPodium.tsx'].map((file) => phoneSources.find(({ name }) => name === file)?.source ?? '').join('\n');
  assert.ok(closing.includes('ClosingPodium') && closing.includes('podium-close'), 'both closing sources are in the scan');

  assert.match(vote, /questionData\?\.options/, 'vote controls must be driven by public option tokens');
  assert.match(vote, /questionData\?\.steps/, 'order controls must be driven by public steps');
  assert.doesNotMatch(vote, /defaultBuckets|defaultPatients|Item A/, 'vote surface must not invent answer choices');
  assert.doesNotMatch(closing, /DEFAULT_COMMITMENTS|vaxorfiction\.com\/recap|up to 35%/, 'closing must not invent commitments, a recap URL, or a clinical claim');
});
