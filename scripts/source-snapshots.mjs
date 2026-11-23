#!/usr/bin/env node
// Source check, step 1. Fetches every URL the bank cites, once, and saves the extracted page text with its fetch
// date and sha256 under content/bank/source-snapshots/. Every failure is recorded in the index. No text is ever
// written that did not come from the fetched page.
//
// A US government page (PUBLIC_DOMAIN_HOSTS) has its text committed as <id>.txt. Any other host is hashed and
// indexed, with its text kept in the gitignored work/source-snapshots/ so the extraction pass can still read it.
//
// Run: node --import tsx scripts/source-snapshots.mjs [--only-missing]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

import { PUBLIC_DOMAIN_HOSTS, SNAPSHOT_DIR, SNAPSHOT_INDEX, decodeEntities, htmlToText, pageUpdatedFrom, sha256, snapshotIdFor } from './source-check-lib.mjs';
import { loadBankQuestions } from './source-check-questions.mjs';

const LOCAL_DIR = 'work/source-snapshots';
const ONLY_MISSING = process.argv.includes('--only-missing');
const MIN_TEXT = 400; // a page shorter than this is a block page or a script shell, not the cited prose
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36';
const today = new Date().toISOString().slice(0, 10);

const questions = await loadBankQuestions();
const byUrl = new Map();
for (const q of questions) {
  for (const s of q.sources) {
    const entry = byUrl.get(s.url) ?? { url: s.url, citationIds: new Set(), bankIds: new Set() };
    entry.citationIds.add(s.citationId);
    entry.bankIds.add(q.bankId);
    byUrl.set(s.url, entry);
  }
}

const previous = existsSync(SNAPSHOT_INDEX) ? JSON.parse(readFileSync(SNAPSHOT_INDEX, 'utf8')) : { sources: [], failures: [] };
const keep = new Map(ONLY_MISSING ? previous.sources.map((s) => [s.url, s]) : []);
mkdirSync(SNAPSHOT_DIR, { recursive: true });
mkdirSync(LOCAL_DIR, { recursive: true });

async function fetchOne(url, hops = 0) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const res = await fetch(url, { redirect: 'follow', signal: controller.signal, headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml' } });
    const html = await res.text();
    // A moved CDC page answers 200 with a bare meta refresh. Follow it once, the way a browser would, and record where
    // it led as resolvedUrl.
    const refresh = html.length < 2000 && html.match(/<meta[^>]+http-equiv="refresh"[^>]+content="\d+;\s*url=([^"]+)"/i);
    if (refresh && hops < 1) return fetchOne(new URL(decodeEntities(refresh[1]), res.url).href, hops + 1);
    return { status: res.status, resolvedUrl: res.url, html, contentType: res.headers.get('content-type') ?? '' };
  } finally {
    clearTimeout(timer);
  }
}

const sources = [];
const failures = [];
const ids = new Set();
for (const entry of [...byUrl.values()].sort((a, b) => a.url.localeCompare(b.url))) {
  const base = { url: entry.url, citationIds: [...entry.citationIds].sort(), bankIds: [...entry.bankIds].sort() };
  if (keep.has(entry.url)) { sources.push({ ...keep.get(entry.url), ...base }); ids.add(keep.get(entry.url).id); continue; }
  let id = snapshotIdFor(entry.url);
  while (ids.has(id)) id = `${id}-x`;
  ids.add(id);
  try {
    const got = await fetchOne(entry.url);
    if (got.status !== 200) { failures.push({ ...base, id, status: got.status, resolvedUrl: got.resolvedUrl, error: `HTTP ${got.status}`, retrievedOn: today }); continue; }
    if (/pdf/i.test(got.contentType)) { failures.push({ ...base, id, status: got.status, resolvedUrl: got.resolvedUrl, error: 'PDF. This repo has no PDF text extractor, so no text was saved', retrievedOn: today }); continue; }
    if (/<title>\s*Access Denied\s*<\/title>/i.test(got.html)) { failures.push({ ...base, id, status: got.status, resolvedUrl: got.resolvedUrl, error: 'Access Denied page served with HTTP 200', retrievedOn: today }); continue; }
    if (!/html/i.test(got.contentType)) { failures.push({ ...base, id, status: got.status, resolvedUrl: got.resolvedUrl, error: `not HTML (${got.contentType})`, retrievedOn: today }); continue; }
    const text = htmlToText(got.html);
    if (text.length < MIN_TEXT) { failures.push({ ...base, id, status: got.status, resolvedUrl: got.resolvedUrl, error: `extracted text only ${text.length} characters`, retrievedOn: today }); continue; }
    const host = new URL(entry.url).host;
    const committed = PUBLIC_DOMAIN_HOSTS.has(host);
    const file = committed ? `${SNAPSHOT_DIR}/${id}.txt` : `${LOCAL_DIR}/${id}.txt`;
    writeFileSync(file, text);
    sources.push({ ...base, id, resolvedUrl: got.resolvedUrl, status: got.status, retrievedOn: today, sha256: sha256(text),
      chars: text.length, file, committed, pageUpdated: pageUpdatedFrom(got.html),
      rights: committed ? 'US government public domain prose' : 'Not US government. Text kept out of the repo, hash only.' });
    console.log(`SNAPSHOT ok ${id} chars=${text.length}${committed ? '' : ' (not committed)'}`);
  } catch (err) {
    failures.push({ ...base, id, status: null, error: String(err?.cause?.code ?? err?.name ?? err), retrievedOn: today });
    console.log(`SNAPSHOT FAIL ${entry.url} ${String(err?.cause?.code ?? err)}`);
  }
}

const index = {
  note: 'Generated by scripts/source-snapshots.mjs. One record per cited URL, fetched once. Text files hold the page text extracted from the fetched HTML, never edited by hand. sha256 is of the .txt file bytes (UTF-8).',
  generatedOn: today,
  urls: byUrl.size,
  sources,
  failures,
};
writeFileSync(SNAPSHOT_INDEX, `${JSON.stringify(index, null, 2)}\n`);
console.log(`SNAPSHOTS urls=${byUrl.size} ok=${sources.length} failed=${failures.length} committed=${sources.filter((s) => s.committed).length}`);
