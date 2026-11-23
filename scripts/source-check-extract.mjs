#!/usr/bin/env node
// Source check, step 2. One model family proposes, per bank question, one verbatim quote from that question's saved
// source snapshots plus a verdict on whether it supports the bank's answer: supports, contradicts or silent.
//
//   family a: Claude, through the Claude Code CLI in print mode on the operator's Claude subscription login.
//   family b: OpenAI, through the Codex CLI in exec mode on the operator's ChatGPT subscription login.
//
// Both run with every API key variable removed from the child environment, so neither can fall back to a metered
// key. Family B refuses to start unless `codex login status` reports a ChatGPT login. Each family writes its own
// file, content/bank/source-check/family-<a|b>.json, and a rerun skips questions that already have an answer.
// The models only ever see committed snapshots, so every quote they give can be re-checked offline.
//
// Run: node --import tsx scripts/source-check-extract.mjs --family a|b [--concurrency 6] [--only bankId,...] [--redo]
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { SNAPSHOT_INDEX, answerLine, sha256, stemLines, verifyQuote } from './source-check-lib.mjs';
import { loadBankQuestions } from './source-check-questions.mjs';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
};
const FAMILY = arg('family');
const CONCURRENCY = Number(arg('concurrency', '6'));
const ONLY = arg('only') ? new Set(arg('only').split(',')) : null;
const REDO = process.argv.includes('--redo');
const OUT_DIR = 'content/bank/source-check';
const PROMPT_VERSION = 'source-check-v1';
const CALL_TIMEOUT_MS = 15 * 60 * 1000;
const CODEX = process.env.CODEX_BIN ?? 'codex';

const FAMILIES = {
  a: { label: 'Claude', model: 'claude-opus-5-5', cli: 'claude' },
  b: { label: 'OpenAI Codex', model: 'codex config default', cli: CODEX },
};
if (!FAMILIES[FAMILY]) {
  console.error('usage: --family a|b');
  process.exit(2);
}

// No metered fallback: strip every key variable before spawning a model CLI.
const childEnv = { ...process.env };
for (const key of Object.keys(childEnv)) if (/API_KEY|AUTH_TOKEN/i.test(key)) delete childEnv[key];

if (FAMILY === 'b') {
  // codex prints its login status on stderr, so read both streams.
  const got = spawnSync(CODEX, ['login', 'status'], { encoding: 'utf8', env: childEnv });
  const status = `${got.stdout ?? ''}${got.stderr ?? ''}`;
  if (!/Logged in using ChatGPT/i.test(status)) {
    console.error(`FAMILY_B STOP: codex login status is "${status.trim()}", not a ChatGPT subscription login.`);
    process.exit(3);
  }
}

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['sourceId', 'quote', 'verdict', 'claim', 'reason'],
  properties: {
    sourceId: { type: 'string', description: 'The SOURCE id the quote was copied from, or "" when there is no quote.' },
    quote: { type: 'string', description: 'One to three consecutive sentences copied character for character from that source.' },
    verdict: { type: 'string', enum: ['supports', 'contradicts', 'silent'] },
    claim: { type: 'string', description: 'One plain sentence stating what the quote says.' },
    reason: { type: 'string', description: 'Why that verdict, in 25 words or fewer.' },
  },
};

const index = JSON.parse(readFileSync(SNAPSHOT_INDEX, 'utf8'));
const snapshotsByUrl = new Map(index.sources.filter((s) => s.committed).map((s) => [s.url, s]));

function promptFor(q) {
  const snaps = q.sources.map((s) => snapshotsByUrl.get(s.url)).filter(Boolean);
  const blocks = snaps.map((s) => `=== SOURCE ${s.id} ===\nURL: ${s.url}\nRetrieved: ${s.retrievedOn}\n\n${readFileSync(s.file, 'utf8')}\n=== END SOURCE ${s.id} ===`);
  return [
    'You are checking the evidence behind one question in a pharmacist quiz game about vaccines.',
    'You are not editing the question. You only report what the cited source text says.',
    '',
    'Task: find the single passage in the SOURCE text below that best bears on the bank answer, copy it exactly, and say',
    'whether it supports the bank answer, contradicts it, or is silent on it.',
    '',
    'Rules for the quote:',
    '- Copy one to three consecutive sentences from ONE source, character for character, including its punctuation,',
    '  quote marks, dashes, symbols and capitalization. Line breaks may become spaces. Change nothing else.',
    '- No ellipses, no joining of separate passages, no paraphrase, no fixing of typos. At most 600 characters.',
    '- sourceId is the id after "SOURCE" in that source\'s header.',
    '- If the source is silent, still give the closest relevant passage, or empty sourceId and quote if nothing is relevant.',
    '',
    'Rules for the verdict (judge the bank answer, not the explanation):',
    '- supports: the quote by itself establishes the bank answer. For a FALSE statement, a quote that shows the statement',
    '  is wrong supports the answer. For a best-choice or myth question, the quote must establish the deciding fact.',
    '- contradicts: the source says something that makes the bank answer wrong.',
    '- silent: the source does not establish the answer either way.',
    '',
    'claim: one plain sentence saying what the quote states. reason: 25 words or fewer. Use no semicolons and no em dashes.',
    'Do not run any commands or tools. Answer only with the JSON object.',
    '',
    `QUESTION (${q.bankId}, kind ${q.kind})`,
    ...stemLines(q.question),
    `BANK ANSWER: ${answerLine(q.question)}`,
    `EXPLANATION SHOWN AFTER THE ANSWER: ${q.question.reveal}`,
    '',
    ...blocks,
  ].join('\n');
}

function run(cmd, args, input, cwd) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd, env: childEnv, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => child.kill('SIGKILL'), CALL_TIMEOUT_MS);
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('close', (code) => { clearTimeout(timer); resolve({ code, stdout, stderr }); });
    child.stdin.end(input);
  });
}

const scratch = mkdtempSync(join(tmpdir(), 'source-check-'));
const schemaFile = join(scratch, 'schema.json');
writeFileSync(schemaFile, JSON.stringify(SCHEMA));

async function askFamily(prompt, bankId) {
  if (FAMILY === 'a') {
    const res = await run('claude', ['-p', '--model', FAMILIES.a.model, '--tools', '', '--strict-mcp-config', '--no-session-persistence',
      '--output-format', 'json', '--json-schema', JSON.stringify(SCHEMA)], prompt, scratch);
    if (res.code !== 0) return { error: `claude exit ${res.code}: ${(res.stderr || res.stdout).slice(0, 300)}` };
    const out = JSON.parse(res.stdout);
    if (out.is_error || !out.structured_output) return { error: `claude returned no structured output: ${String(out.result).slice(0, 300)}` };
    const provider = Object.values(out.modelUsage ?? {})[0]?.provider ?? null;
    return { answer: out.structured_output, model: Object.keys(out.modelUsage ?? {})[0] ?? FAMILIES.a.model, provider };
  }
  const outFile = join(scratch, `${bankId.replace(/[^a-z0-9]+/gi, '-')}.json`);
  const res = await run(CODEX, ['exec', '--skip-git-repo-check', '--ephemeral', '--sandbox', 'read-only', '-C', scratch,
    '--output-schema', schemaFile, '-o', outFile, '-'], prompt, scratch);
  const model = (res.stderr + res.stdout).match(/^model:\s*(\S+)/m)?.[1] ?? null;
  if (/usage limit/i.test(res.stderr + res.stdout)) return { error: 'codex subscription usage limit reached', stop: true };
  if (res.code !== 0 || !existsSync(outFile)) return { error: `codex exit ${res.code}: ${(res.stderr || res.stdout).split('\n').filter((l) => /error/i.test(l)).slice(-2).join(' ').slice(0, 300)}` };
  return { answer: JSON.parse(readFileSync(outFile, 'utf8')), model, provider: 'openai-chatgpt-subscription' };
}

const outFile = `${OUT_DIR}/family-${FAMILY}.json`;
mkdirSync(OUT_DIR, { recursive: true });
const existing = existsSync(outFile) ? JSON.parse(readFileSync(outFile, 'utf8')) : null;
const results = existing?.results ?? {};
const questions = (await loadBankQuestions()).filter((q) => !ONLY || ONLY.has(q.bankId));
const todo = questions.filter((q) => {
  if (!q.sources.some((s) => snapshotsByUrl.has(s.url))) return false; // nothing committed to read
  return REDO || !results[q.bankId] || results[q.bankId].error;
});

function save() {
  const sorted = Object.fromEntries(Object.entries(results).sort(([a], [b]) => a.localeCompare(b)));
  const doc = {
    family: FAMILY,
    label: FAMILIES[FAMILY].label,
    cli: FAMILY === 'a' ? 'Claude Code CLI, print mode, no tools, subscription login' : 'Codex CLI, exec mode, read-only sandbox, ChatGPT subscription login',
    promptVersion: PROMPT_VERSION,
    snapshotIndexSha256: sha256(readFileSync(SNAPSHOT_INDEX, 'utf8')),
    results: sorted,
  };
  writeFileSync(outFile, `${JSON.stringify(doc, null, 2)}\n`);
}

console.log(`EXTRACT family=${FAMILY} questions=${questions.length} todo=${todo.length} concurrency=${CONCURRENCY}`);
let next = 0;
let stopped = false;
let done = 0;
async function worker() {
  while (!stopped && next < todo.length) {
    const q = todo[next++];
    const prompt = promptFor(q);
    const started = Date.now();
    let res;
    try {
      res = await askFamily(prompt, q.bankId);
    } catch (err) {
      res = { error: String(err).slice(0, 300) };
    }
    const base = { promptSha256: sha256(prompt), ranOn: new Date().toISOString().slice(0, 10), durationMs: Date.now() - started };
    if (res.stop) { stopped = true; console.error(`EXTRACT STOP ${res.error}`); }
    if (res.error) {
      results[q.bankId] = { ...base, error: res.error };
    } else {
      const a = res.answer;
      const snap = q.sources.map((s) => snapshotsByUrl.get(s.url)).find((s) => s && s.id === a.sourceId);
      // Recorded for the reader only. scripts/source-check-merge.mjs re-runs the check from scratch.
      const check = snap ? verifyQuote(a.quote, readFileSync(snap.file, 'utf8')) : { ok: false, reason: 'sourceId is not one of this question\'s snapshots' };
      results[q.bankId] = { ...base, model: res.model, provider: res.provider, sourceId: a.sourceId, quote: a.quote, verdict: a.verdict,
        claim: a.claim, reason: a.reason, quoteCheckAtRun: check.ok ? 'ok' : check.reason };
    }
    done += 1;
    save();
    console.log(`EXTRACT ${done}/${todo.length} ${q.bankId} ${results[q.bankId].error ? `ERROR ${results[q.bankId].error}` : `${results[q.bankId].verdict} quote=${results[q.bankId].quoteCheckAtRun}`} ${Math.round(base.durationMs / 1000)}s`);
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
save();
const errors = Object.values(results).filter((r) => r.error).length;
console.log(`EXTRACT_DONE family=${FAMILY} answered=${Object.keys(results).length - errors} errors=${errors}${stopped ? ' STOPPED' : ''}`);
process.exit(stopped ? 4 : 0);
