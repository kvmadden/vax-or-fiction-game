// Source check. The deterministic quote checker (scripts/source-check-lib.mjs) and the committed evidence it guards.
// A quote counts only when it is an exact substring of its saved snapshot after whitespace normalization. Each guard
// here was shown red by a disposable mutation before it landed.
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';

import { decide, htmlToText, normalizeWhitespace, pageUpdatedFrom, sha256, verifyQuote } from '../../scripts/source-check-lib.mjs';
import type { QuestionMetadata } from '../../src/data/bank/types.ts';

const SNAPSHOT = 'People with egg allergy may receive any flu vaccine (egg-based or non-egg-based) that is otherwise\n'
  + 'appropriate for their age and health status.\nOverview\nIt’s safe ≥ 65 years.';

test('verifyQuote: an exact substring passes, and whitespace differences alone never fail it', () => {
  assert.equal(verifyQuote('People with egg allergy may receive any flu vaccine', SNAPSHOT).ok, true);
  assert.equal(verifyQuote('that is otherwise appropriate for their age', SNAPSHOT).ok, true, 'a newline in the page matches a space');
  assert.equal(verifyQuote('  any flu vaccine   (egg-based\tor non-egg-based) ', SNAPSHOT).ok, true, 'runs of spaces and tabs collapse');
  assert.equal(verifyQuote('It’s safe ≥ 65 years.', SNAPSHOT).ok, true);
});

test('verifyQuote: anything beyond whitespace is a different quote and is discarded, never repaired', () => {
  const fails = (quote: string) => assert.equal(verifyQuote(quote, SNAPSHOT).ok, false, quote);
  fails('People with egg allergies may receive any flu vaccine'); // one letter added
  fails('people with egg allergy may receive any flu vaccine'); // case
  fails("It's safe ≥ 65 years."); // straight apostrophe for the page's curly one
  fails('It’s safe >= 65 years.'); // symbol spelled out
  fails('People with egg allergy may receive ... appropriate'); // ellipsis join
  fails('health status. Overview It’s safe ≥ 65 years. Extra'); // runs past the page
  fails('');
  fails('   \n ');
  fails('Overview'); // too short to be evidence
  assert.equal(verifyQuote(undefined as unknown as string, SNAPSHOT).ok, false);
});

test('normalizeWhitespace collapses no-break spaces too, since pages use them between words', () => {
  assert.equal(normalizeWhitespace(' a  b\n\nc '), 'a b c');
});

test('decide: claims fill only when both quotes verify and both say supports', () => {
  const s = (verdict: string, quoteOk = true) => ({ verdict, quoteOk });
  assert.equal(decide(s('supports'), s('supports')).outcome, 'verified');
  assert.equal(decide(s('supports', false), s('supports')).outcome, 'disagree');
  assert.equal(decide(s('supports'), s('supports', false)).outcome, 'disagree');
  assert.equal(decide(s('supports'), s('silent')).outcome, 'disagree');
  assert.equal(decide(s('silent'), s('silent')).outcome, 'silent');
  assert.equal(decide(s('supports'), s('contradicts')).outcome, 'contradicts');
  assert.equal(decide(s('contradicts', false), s('supports')).outcome, 'contradicts');
  assert.equal(decide(s('supports'), null).outcome, 'missing');
  assert.equal(decide(s('supports'), s('supports'), { sourcesOk: false }).outcome, 'fetch-failure');
  assert.equal(decide(s('supports'), s('supports'), { rightsOk: false }).outcome, 'rights');
});

test('htmlToText keeps the main prose, drops scripts and adds no space for inline tags', () => {
  const html = '<html><body><nav>Menu</nav><main><h1>Title</h1><script>var x = "<p>no</p>";</script>'
    + '<p>See the <a href="/s">July 2025 schedule</a>. Adults &ge;65&nbsp;years.</p><style>p{}</style></main></body></html>';
  assert.equal(htmlToText(html), 'Title\nSee the July 2025 schedule. Adults ≥65 years.');
  assert.equal(htmlToText('<body><div>A</div><div>B</div></body>'), 'A\nB');
});

test('pageUpdatedFrom reads the CDC lead date, its abbreviations, and labelled dates', () => {
  assert.equal(pageUpdatedFrom('<main><p>Sept. 18, 2025</p><h1>Flu</h1></main>'), '2025-09-18');
  assert.equal(pageUpdatedFrom('<main><h1>Flu</h1><p>September 17, 2024</p></main>'), '2024-09-17');
  assert.equal(pageUpdatedFrom('<body><p>Content current as of: 03/26/2025</p></body>'), '2025-03-26');
  assert.equal(pageUpdatedFrom('<main><p>Flu vaccines work.</p></main>'), null);
});

// ---- The committed evidence. These read the real files and print how much they covered. ----

type Snapshot = { id: string, url: string, file: string, sha256: string, committed: boolean, retrievedOn: string }
const index = JSON.parse(readFileSync('content/bank/source-snapshots/index.json', 'utf8')) as { sources: Snapshot[], failures: { url: string, error: string }[] };

test('Snapshots: every committed text file matches its recorded sha256, and nothing else sits in the folder', () => {
  const committed = index.sources.filter((s) => s.committed);
  for (const s of committed) {
    assert.ok(s.file.startsWith('content/bank/source-snapshots/'), `${s.id} committed outside the snapshot folder`);
    assert.equal(sha256(readFileSync(s.file, 'utf8')), s.sha256, `${s.id} text no longer matches its sha256`);
  }
  const onDisk = readdirSync('content/bank/source-snapshots').filter((f) => f.endsWith('.txt')).sort();
  assert.deepEqual(onDisk, committed.map((s) => s.file.split('/').at(-1)).sort(), 'every .txt is indexed and every indexed file exists');
  for (const f of index.failures) assert.ok(f.error.length > 0, `${f.url} failure has no reason`);
  console.log(`SOURCE_SNAPSHOTS committed=${committed.length} uncommitted=${index.sources.length - committed.length} failures=${index.failures.length}`);
  assert.ok(committed.length > 0, 'the snapshot check must see at least one snapshot');
});

function flatRecords(): QuestionMetadata[] {
  return readdirSync('content/bank/metadata').filter((f) => f.endsWith('.json'))
    .flatMap((f) => Object.values(JSON.parse(readFileSync(`content/bank/metadata/${f}`, 'utf8')) as Record<string, QuestionMetadata>));
}

test('Filled claims: every claim the source check wrote is an exact substring of a committed snapshot of its own URL', () => {
  const merged = JSON.parse(readFileSync('content/bank/source-check/merged.json', 'utf8')) as { filled: string[] };
  const byId = new Map(flatRecords().map((r) => [r.bankId, r]));
  const byUrl = new Map(index.sources.filter((s) => s.committed).map((s) => [s.url, s]));
  let claims = 0;
  for (const bankId of merged.filled) {
    const record = byId.get(bankId);
    assert.ok(record, `${bankId} is listed as filled but has no record`);
    assert.ok(record.evidence.claims.length > 0, `${bankId} is listed as filled but has no claims`);
    for (const claim of record.evidence.claims) {
      const snap = byUrl.get(claim.url);
      assert.ok(snap, `${bankId} ${claim.id} cites ${claim.url}, which has no committed snapshot`);
      assert.ok(verifyQuote(claim.quote, readFileSync(snap.file, 'utf8')).ok, `${bankId} ${claim.id} quote is not in its snapshot`);
      assert.equal(claim.retrievedOn, snap.retrievedOn, `${bankId} ${claim.id} retrievedOn differs from its snapshot`);
      claims += 1;
    }
  }
  console.log(`SOURCE_CHECK_CLAIMS records=${merged.filled.length} claims=${claims}`);
});

test('Family outputs: every recorded quote check still gives the same result when re-run', () => {
  const byId = new Map(index.sources.filter((s) => s.committed).map((s) => [s.id, s]));
  let seen = 0;
  for (const f of ['a', 'b']) {
    const path = `content/bank/source-check/family-${f}.json`;
    if (!existsSync(path)) continue;
    const doc = JSON.parse(readFileSync(path, 'utf8')) as { results: Record<string, { sourceId?: string, quote?: string, quoteCheckAtRun?: string, error?: string }> };
    for (const [bankId, r] of Object.entries(doc.results)) {
      if (r.error) continue;
      const snap = r.sourceId ? byId.get(r.sourceId) : undefined;
      const now = snap ? verifyQuote(r.quote ?? '', readFileSync(snap.file, 'utf8')) : { ok: false };
      assert.equal(now.ok, r.quoteCheckAtRun === 'ok', `family ${f} ${bankId}: recorded check ${r.quoteCheckAtRun} but re-run gives ${now.ok}`);
      seen += 1;
    }
  }
  console.log(`SOURCE_CHECK_FAMILY_QUOTES rechecked=${seen}`);
  assert.ok(seen > 0, 'the family re-check must see at least one answer');
});
