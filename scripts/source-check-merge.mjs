#!/usr/bin/env node
// Source check, step 4. Re-checks every quote from both families against the committed snapshots, then:
//   - fills evidence.claims on a bank record only when both families gave a substring-verified quote and both said
//     "supports";
//   - writes every other question (disagreement, contradicts, silent, failed quote, fetch failure) to
//     docs/review/source-check-<date>.md, one block per question, for pharmacist review.
// A contradiction is a finding for the owner. Nothing here touches a deck file, a question's wording or its answer.
//
// It only ever rewrites claims this script wrote before (listed in content/bank/source-check/merged.json). A record
// that already carries claims from elsewhere is left as it is and reported.
//
// Run: node --import tsx scripts/source-check-merge.mjs [--date YYYY-MM-DD]
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';

import { SNAPSHOT_INDEX, answerLine, decide, normalizeWhitespace, stemLines, verifyQuote } from './source-check-lib.mjs';
import { loadBankQuestions } from './source-check-questions.mjs';

const dateArg = process.argv.indexOf('--date');
const DATE = dateArg >= 0 ? process.argv[dateArg + 1] : new Date().toISOString().slice(0, 10);
const METADATA_DIR = 'content/bank/metadata';
const OUT_DIR = 'content/bank/source-check';
const MERGED = `${OUT_DIR}/merged.json`;
const REVIEW = `docs/review/source-check-${DATE}.md`;

const index = JSON.parse(readFileSync(SNAPSHOT_INDEX, 'utf8'));
const committedByUrl = new Map(index.sources.filter((s) => s.committed).map((s) => [s.url, s]));
const failedUrls = new Set(index.failures.map((f) => f.url));
const loadFamily = (f) => (existsSync(`${OUT_DIR}/family-${f}.json`) ? JSON.parse(readFileSync(`${OUT_DIR}/family-${f}.json`, 'utf8')) : null);
const famA = loadFamily('a');
const famB = loadFamily('b');
const previous = existsSync(MERGED) ? JSON.parse(readFileSync(MERGED, 'utf8')) : { filled: [] };
const ownedBefore = new Set(previous.filled);

/** Re-checks one family's answer for one question. Returns null when that family has no answer. */
function checked(result, snaps) {
  if (!result || result.error) return null;
  const snap = snaps.find((s) => s.id === result.sourceId);
  const check = snap ? verifyQuote(result.quote, readFileSync(snap.file, 'utf8')) : { ok: false, reason: 'not one of this question\'s snapshots' };
  return { ...result, snap, quoteOk: check.ok, quoteProblem: check.ok ? null : check.reason };
}

const questions = await loadBankQuestions();
const rows = [];
for (const q of questions) {
  const snaps = q.sources.map((s) => committedByUrl.get(s.url)).filter(Boolean);
  const anyFailed = q.sources.some((s) => failedUrls.has(s.url));
  const a = checked(famA?.results[q.bankId], snaps);
  const b = checked(famB?.results[q.bankId], snaps);
  let decision;
  if (snaps.length === 0) {
    decision = decide(null, null, { sourcesOk: !anyFailed, rightsOk: anyFailed });
  } else if (!b && (!famB || Object.values(famB.results).some((r) => /usage limit/.test(r.error ?? '')))) {
    // Family B has not run yet (or stopped on its subscription limit). Report what family A alone already settles.
    if (a?.verdict === 'contradicts') decision = { outcome: 'contradicts', reason: 'family A read the source as contradicting the answer. Family B has not run' };
    else if (a?.verdict === 'supports' && a.quoteOk) decision = { outcome: 'awaiting-b', reason: 'family A verified support. Family B has not run' };
    else if (a) decision = { outcome: a.verdict === 'silent' ? 'silent' : 'disagree', reason: a.verdict === 'silent' ? 'family A found the source silent. Family B has not run' : `family A quote failed the substring check (${a.quoteProblem}). Family B has not run` };
    else decision = { outcome: 'missing', reason: 'no answer from family A. Family B has not run' };
  } else {
    decision = decide(a, b);
  }
  rows.push({ q, a, b, snaps, anyFailed, ...decision });
}

// Write claims for verified rows. Leave records with claims from elsewhere untouched.
const filled = [];
const foreign = [];
const byFile = new Map();
for (const file of readdirSync(METADATA_DIR).filter((f) => f.endsWith('.json'))) byFile.set(file, JSON.parse(readFileSync(`${METADATA_DIR}/${file}`, 'utf8')));
for (const row of rows) {
  const record = byFile.get(row.q.file)[row.q.bankId];
  const ours = ownedBefore.has(row.q.bankId) || record.evidence.claims.length === 0;
  if (!ours) { foreign.push(row.q.bankId); continue; }
  if (row.outcome !== 'verified') {
    if (ownedBefore.has(row.q.bankId)) { record.evidence.claims = []; record.evidence.retrievedOn = null; }
    continue;
  }
  const claims = [];
  for (const fam of [row.a, row.b]) {
    const quote = normalizeWhitespace(fam.quote);
    if (claims.some((c) => c.quote === quote)) continue;
    const cited = row.q.sources.find((s) => committedByUrl.get(s.url)?.id === fam.snap.id);
    claims.push({ id: `c${claims.length + 1}`, role: 'key', text: fam.claim, url: cited.url, quote, retrievedOn: fam.snap.retrievedOn, pageUpdated: fam.snap.pageUpdated });
  }
  record.evidence.claims = claims;
  record.evidence.retrievedOn = claims.map((c) => c.retrievedOn).sort().at(-1);
  filled.push(row.q.bankId);
}
for (const [file, records] of byFile) writeFileSync(`${METADATA_DIR}/${file}`, `${JSON.stringify(records, null, 2)}\n`);

const count = (o) => rows.filter((r) => r.outcome === o).length;
const counts = Object.fromEntries(['verified', 'awaiting-b', 'contradicts', 'disagree', 'silent', 'fetch-failure', 'rights', 'missing'].map((o) => [o, count(o)]));
writeFileSync(MERGED, `${JSON.stringify({
  note: 'Generated by scripts/source-check-merge.mjs. filled lists the records whose evidence.claims this merge wrote.',
  mergedOn: DATE,
  familyA: famA ? { label: famA.label, promptVersion: famA.promptVersion, answered: Object.values(famA.results).filter((r) => !r.error).length } : null,
  familyB: famB ? { label: famB.label, promptVersion: famB.promptVersion, answered: Object.values(famB.results).filter((r) => !r.error).length } : null,
  counts,
  filled: filled.sort(),
  leftAlone: foreign.sort(),
  outcomes: Object.fromEntries(rows.map((r) => [r.q.bankId, { outcome: r.outcome, reason: r.reason }])),
}, null, 2)}\n`);

// The review file: one block per question that did not verify, worst first, readable on a phone.
const ORDER = ['contradicts', 'disagree', 'silent', 'missing', 'fetch-failure', 'rights'];
const TITLES = { contradicts: 'Contradicts the answer', disagree: 'Families disagree or a quote failed', silent: 'Source is silent',
  missing: 'No answer from a family', 'fetch-failure': 'Source could not be fetched', rights: 'Source text not committed (not public domain)' };
const bar = (n, total) => `${'█'.repeat(Math.round((n / total) * 20))}${'░'.repeat(20 - Math.round((n / total) * 20))}`;
const famLine = (label, f, result) => {
  if (!result) return `- **${label}:** no answer`;
  if (result.error) return `- **${label}:** error, ${result.error}`;
  const quote = f?.quote ? `\n  > ${normalizeWhitespace(f.quote)}` : '';
  const flag = f && !f.quoteOk && f.quote ? ` (quote discarded: ${f.quoteProblem})` : '';
  return `- **${label}:** ${result.verdict}${flag}${quote}\n  ${result.reason}`;
};
const lines = [
  `# Source check, ${DATE}`,
  '',
  'Each bank answer checked against a saved copy of its cited page. A question is marked verified only when two model',
  'families each copied a quote that is found word for word in the page and both say it supports the answer.',
  'Everything below is for pharmacist review. A contradiction is a finding, and no answer or wording was changed.',
  '',
  '```',
  ...Object.entries(counts).map(([o, n]) => `${o.padEnd(14)} ${bar(n, rows.length)} ${n}`),
  `${'total'.padEnd(14)} ${' '.repeat(20)} ${rows.length}`,
  '```',
  '',
];
if (counts['awaiting-b'] > 0) {
  lines.push(`Family B has not run yet. ${counts['awaiting-b']} questions have a verified family A quote that supports the answer and need family B before they count:`, '');
  lines.push(rows.filter((r) => r.outcome === 'awaiting-b').map((r) => `\`${r.q.bankId}\``).join(', '), '');
}
for (const outcome of ORDER) {
  const group = rows.filter((r) => r.outcome === outcome);
  if (group.length === 0) continue;
  lines.push(`## ${TITLES[outcome]} (${group.length})`, '');
  for (const r of group) {
    lines.push(`### ${r.q.bankId}`, '');
    for (const l of stemLines(r.q.question)) lines.push(`${l}  `);
    lines.push(`**Bank answer:** ${answerLine(r.q.question)}  `);
    lines.push(`**Sources:** ${r.q.sources.map((s) => `[${s.citationId}](${s.url})${failedUrls.has(s.url) ? ` (not fetched: ${index.failures.find((f) => f.url === s.url).error})` : ''}`).join(', ')}`, '');
    if (r.snaps.length > 0) {
      lines.push(famLine('A, Claude', r.a, famA?.results[r.q.bankId]));
      lines.push(famLine('B, Codex', r.b, famB?.results[r.q.bankId]));
      lines.push('');
    }
    lines.push(`Why it is here: ${r.reason}.`, '');
  }
}
mkdirSync('docs/review', { recursive: true });
writeFileSync(REVIEW, `${lines.join('\n').trimEnd()}\n`);
console.log(`MERGE ${Object.entries(counts).map(([o, n]) => `${o}=${n}`).join(' ')} filled=${filled.length} leftAlone=${foreign.length} review=${REVIEW}`);
