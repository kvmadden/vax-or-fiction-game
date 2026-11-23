// Source check (bank evidence sweep). Pure helpers shared by scripts/source-snapshots.mjs,
// scripts/source-check-extract.mjs, scripts/source-check-merge.mjs and tests/unit/source-check.test.ts.
//
// The one rule this file exists to hold: a quote counts only when it is an exact substring of the saved source
// snapshot after whitespace normalization. A quote that fails is discarded. Nothing here repairs, trims or fuzzes a
// quote into a match.
import { createHash } from 'node:crypto';

export const SNAPSHOT_DIR = 'content/bank/source-snapshots';
export const SNAPSHOT_INDEX = `${SNAPSHOT_DIR}/index.json`;
export const VERDICTS = new Set(['supports', 'contradicts', 'silent']);

// Hosts whose page prose is US government work, so the full extracted text may be committed to a public repo.
// Any other host is still fetched and hashed, but its text stays out of the repo and its questions go to review.
export const PUBLIC_DOMAIN_HOSTS = new Set(['www.cdc.gov', 'wwwnc.cdc.gov', 'www.fda.gov', 'lhncbc.nlm.nih.gov']);

export const sha256 = (text) => createHash('sha256').update(text, 'utf8').digest('hex');

/** Collapses every run of whitespace (including no-break spaces and newlines) to one space and trims the ends. */
export function normalizeWhitespace(text) {
  return String(text).replace(/\s+/gu, ' ').trim();
}

/**
 * Returns { ok: true } when `quote` is a non-empty exact substring of `snapshot` after whitespace normalization on
 * both sides, otherwise { ok: false, reason }. No other normalization: case, punctuation, quote marks and dashes must
 * match the snapshot byte for byte.
 */
export function verifyQuote(quote, snapshot) {
  if (typeof quote !== 'string' || typeof snapshot !== 'string') return { ok: false, reason: 'not text' };
  const needle = normalizeWhitespace(quote);
  if (needle.length === 0) return { ok: false, reason: 'empty quote' };
  if (needle.length < 20) return { ok: false, reason: 'quote under 20 characters' };
  if (!normalizeWhitespace(snapshot).includes(needle)) return { ok: false, reason: 'not an exact substring of the snapshot' };
  return { ok: true };
}

/** A stable, readable snapshot id from a URL: host and path, lowercased, non-alphanumerics to dashes. */
export function snapshotIdFor(url) {
  const u = new URL(url);
  const host = u.host.replace(/^www\./, '');
  const path = u.pathname.replace(/\.(html?|htm|aspx?)$/i, '');
  const slug = `${host}${path}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return slug.length > 90 ? `${slug.slice(0, 80)}-${sha256(url).slice(0, 8)}` : slug;
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—',
  rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', hellip: '…', ge: '≥', le: '≤',
  deg: '°', reg: '®', trade: '™', copy: '©', middot: '·', bull: '•', times: '×',
  shy: '' };

export function decodeEntities(text) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, body) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[body.toLowerCase()] ?? whole;
  });
}

const BLOCK_TAGS = 'address|article|aside|blockquote|br|caption|dd|div|dl|dt|figcaption|figure|footer|h[1-6]|header|hr|li|main|nav|ol|p|pre|section|table|tbody|td|tfoot|th|thead|tr|ul';

/**
 * Extracts readable text from an HTML page. Prefers the page's <main> element when it has one (the article body on
 * CDC and FDA pages), else <body>. Scripts, styles and other non-prose elements are dropped. Block elements become
 * line breaks. Deterministic: the same HTML always gives the same text.
 */
export function htmlToText(html) {
  let doc = String(html);
  const main = doc.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i);
  const body = doc.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
  doc = main ? main[1] : body ? body[1] : doc;
  doc = doc
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|template|iframe|button|form|select)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(new RegExp(`</?(?:${BLOCK_TAGS})\\b[^>]*>`, 'gi'), '\n')
    .replace(/<[^>]+>/g, ''); // inline tags add no text, as in a browser's rendering
  return decodeEntities(doc)
    .split('\n')
    .map((line) => line.replace(/[ \t\r\f\v ]+/g, ' ').trim())
    .filter((line) => line.length > 0)
    .join('\n');
}

const MONTHS = { january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9,
  october: 10, november: 11, december: 12 };
const pad = (n) => String(n).padStart(2, '0');
// Full names, plus the AP-style abbreviations CDC prints (Sept., Oct.). An unknown word is not a month.
const monthNumber = (word) => MONTHS[word.toLowerCase()]
  ?? Object.entries(MONTHS).find(([name]) => word.length >= 3 && name.startsWith(word.toLowerCase()))?.[1] ?? null;

/** The page's own last-updated date as YYYY-MM-DD when it states one, else null. Reads the full HTML. */
export function pageUpdatedFrom(html) {
  // CDC pages print the date alone as the first line of <main>, with no label.
  for (const line of htmlToText(html).split('\n').slice(0, 3)) {
    const lead = line.match(/^([A-Z][a-z]+)\.?\s+(\d{1,2}),\s+(\d{4})$/);
    const month = lead && monthNumber(lead[1]);
    if (month) return `${lead[3]}-${pad(month)}-${pad(Number(lead[2]))}`;
  }
  const text = decodeEntities(String(html).replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ');
  const named = text.match(/(?:Last Reviewed|Page last reviewed|Last Updated|Updated|Published|Content current as of):?\s*([A-Z][a-z]+)\.?\s+(\d{1,2}),\s+(\d{4})/);
  if (named && monthNumber(named[1])) return `${named[3]}-${pad(monthNumber(named[1]))}-${pad(Number(named[2]))}`;
  const numeric = text.match(/(?:Content current as of|Last Reviewed|Last Updated):?\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (numeric) return `${numeric[3]}-${pad(Number(numeric[1]))}-${pad(Number(numeric[2]))}`;
  const meta = String(html).match(/<meta[^>]+(?:property|name)="(?:article:modified_time|cdc:last_updated|dcterms\.modified)"[^>]+content="(\d{4}-\d{2}-\d{2})/i);
  return meta ? meta[1] : null;
}

/**
 * The bank's answer for a deck question in plain words, so a reader (model or pharmacist) knows what a quote has to
 * support. Reads the deck question only, never writes it.
 */
export function answerLine(question) {
  const kind = question.kind ?? 'binary';
  if (kind === 'binary') return `The statement is ${question.answer ? 'TRUE' : 'FALSE'}.`;
  if (kind === 'which-patient') return `The best choice is: "${question.choices?.[question.bestIndex]}"`;
  if (kind === 'myth-among-three') return `The myth (the false statement) is: "${question.statements?.[question.mythIndex]}". The other two statements are true.`;
  if (kind === 'estimate') return `The answer is ${question.estimate?.value}${question.estimate?.unit ?? ''}.`;
  if (kind === 'order') return `The correct order is: ${(question.steps ?? []).map((s, i) => `(${i + 1}) ${s}`).join(' ')}`;
  return 'Unknown kind.';
}

/** The question as a reader sees it: stem, scenario and options, without the answer. */
export function stemLines(question) {
  const lines = [];
  if (question.scenario) lines.push(`Scenario: ${question.scenario}`);
  if (question.statement) lines.push(`Statement: ${question.statement}`);
  if (question.choices) question.choices.forEach((c, i) => lines.push(`Choice ${i + 1}: ${c}`));
  if (question.statements) question.statements.forEach((s, i) => lines.push(`Statement ${i + 1}: ${s}`));
  return lines;
}

/**
 * Decides one question from the two families' proposals, each already passed through verifyQuote. Returns
 * { outcome, reason } where outcome is 'verified' only when both quotes verified and both said supports.
 */
export function decide(a, b, { sourcesOk = true, rightsOk = true } = {}) {
  if (!sourcesOk) return { outcome: 'fetch-failure', reason: 'a cited source could not be fetched' };
  if (!rightsOk) return { outcome: 'rights', reason: 'a cited source is not public domain, so its text is not committed' };
  if (!a || !b) return { outcome: 'missing', reason: `no answer from ${!a && !b ? 'either family' : !a ? 'family A' : 'family B'}` };
  const verdicts = [a.verdict, b.verdict];
  if (verdicts.includes('contradicts')) return { outcome: 'contradicts', reason: 'at least one family read the source as contradicting the answer' };
  if (a.verdict === 'supports' && b.verdict === 'supports') {
    if (a.quoteOk && b.quoteOk) return { outcome: 'verified', reason: 'both quotes verified and both say supports' };
    return { outcome: 'disagree', reason: `both say supports but ${!a.quoteOk && !b.quoteOk ? 'neither quote' : !a.quoteOk ? 'the family A quote' : 'the family B quote'} failed the substring check` };
  }
  if (a.verdict === 'silent' && b.verdict === 'silent') return { outcome: 'silent', reason: 'both families found the source silent on the answer' };
  return { outcome: 'disagree', reason: `family A says ${a.verdict}, family B says ${b.verdict}` };
}
