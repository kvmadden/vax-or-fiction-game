#!/usr/bin/env node
// Source check, step 2. One model family proposes, per bank question, one verbatim quote from that question's saved
// source snapshots plus a verdict on whether it supports the bank's answer: supports, contradicts or silent.
//
//   family a, via claude: Claude Code CLI in print mode, on the operator's Claude subscription login.
//   family b, via codex:  Codex CLI in exec mode, on the operator's ChatGPT subscription login.
//   family b, via grok:   Grok CLI in single-prompt mode, on the operator's xAI subscription (OIDC) login. Questions
//                         go in batches that share snapshots, and the reply is one JSON object keyed by bank id.
//
// Every run removes all API key variables from the child environment, so no family can fall back to a metered key.
// Codex refuses to start unless `codex login status` reports a ChatGPT login. Grok refuses unless every saved
// credential is an OIDC user login. Each family and provider writes its own file,
// content/bank/source-check/family-<a|b>-<via>.json, and a rerun retries only questions without an answer.
// The models only ever see committed snapshots, so every quote they give can be re-checked offline.
//
// Run: node --import tsx scripts/source-check-extract.mjs --family a|b [--via claude|codex|grok]
//        [--concurrency 6] [--only bankId,...] [--redo]
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

import { SNAPSHOT_INDEX, VERDICTS, answerLine, sha256, stemLines, verifyQuote } from './source-check-lib.mjs';
import { loadBankQuestions } from './source-check-questions.mjs';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
};
const FAMILY = arg('family');
const VIA = arg('via', FAMILY === 'a' ? 'claude' : 'codex');
const CONCURRENCY = Number(arg('concurrency', '6'));
const ONLY = arg('only') ? new Set(arg('only').split(',')) : null;
const REDO = process.argv.includes('--redo');
const OUT_DIR = 'content/bank/source-check';
const CALL_TIMEOUT_MS = 15 * 60 * 1000;
const CODEX = process.env.CODEX_BIN ?? 'codex';
const GROK = process.env.GROK_BIN ?? 'grok';
const BATCH_CHARS = 160000; // snapshot text per Grok call
const BATCH_QUESTIONS = 8;

const PROVIDERS = {
  claude: { family: 'a', label: 'Claude', model: 'claude-opus-5-5', promptVersion: 'source-check-v1',
    cli: 'Claude Code CLI, print mode, no tools, subscription login' },
  codex: { family: 'b', label: 'OpenAI Codex', model: null, promptVersion: 'source-check-v1',
    cli: 'Codex CLI, exec mode, read-only sandbox, ChatGPT subscription login' },
  grok: { family: 'b', label: 'xAI Grok', model: 'grok-4.7', promptVersion: 'source-check-v1-batch',
    cli: 'Grok CLI, single-prompt mode, terminal commands, web search and subagents denied, xAI subscription login' },
};
const PROVIDER = PROVIDERS[VIA];
if (!PROVIDER || PROVIDER.family !== FAMILY) {
  console.error('usage: --family a [--via claude] | --family b --via codex|grok');
  process.exit(2);
}

// No metered fallback: strip every key variable before spawning a model CLI.
const childEnv = { ...process.env };
for (const key of Object.keys(childEnv)) if (/API_KEY|AUTH_TOKEN/i.test(key)) delete childEnv[key];

if (VIA === 'codex') {
  // codex prints its login status on stderr, so read both streams.
  const got = spawnSync(CODEX, ['login', 'status'], { encoding: 'utf8', env: childEnv });
  const status = `${got.stdout ?? ''}${got.stderr ?? ''}`;
  if (!/Logged in using ChatGPT/i.test(status)) {
    console.error(`FAMILY_B STOP: codex login status is "${status.trim()}", not a ChatGPT subscription login.`);
    process.exit(3);
  }
}
if (VIA === 'grok') {
  const authPath = process.env.GROK_AUTH_FILE ?? join(homedir(), '.grok', 'auth.json');
  const creds = existsSync(authPath) ? Object.values(JSON.parse(readFileSync(authPath, 'utf8'))) : [];
  const modes = creds.map((c) => c.auth_mode);
  if (creds.length === 0 || modes.some((m) => m !== 'oidc')) {
    console.error(`FAMILY_B STOP: grok credentials are ${JSON.stringify(modes)}, not only an OIDC subscription login.`);
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
const snapsFor = (q) => [...new Set(q.sources.map((s) => snapshotsByUrl.get(s.url)).filter(Boolean))];

const RULES = [
  'You are checking the evidence behind questions in a pharmacist quiz game about vaccines.',
  'You are not editing any question. You only report what the cited source text says.',
  '',
  'Task: for each question, find the single passage in that question\'s SOURCE text that best bears on the bank answer,',
  'copy it exactly, and say whether it supports the bank answer, contradicts it, or is silent on it.',
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
];

const sourceBlock = (s) => `=== SOURCE ${s.id} ===\nURL: ${s.url}\nRetrieved: ${s.retrievedOn}\n\n${readFileSync(s.file, 'utf8')}\n=== END SOURCE ${s.id} ===`;
const questionBlock = (q, header) => [
  header,
  ...stemLines(q.question),
  `BANK ANSWER: ${answerLine(q.question)}`,
  `EXPLANATION SHOWN AFTER THE ANSWER: ${q.question.reveal}`,
];

function singlePrompt(q) {
  return [
    ...RULES,
    'Do not run any commands or tools. Answer only with the JSON object.',
    '',
    ...questionBlock(q, `QUESTION (${q.bankId}, kind ${q.kind})`),
    '',
    ...snapsFor(q).map(sourceBlock),
  ].join('\n');
}

function batchPrompt(batch) {
  const snaps = [...new Set(batch.flatMap(snapsFor))];
  return [
    'Never run terminal commands. Do not use any tools. Everything you need is in this message.',
    '',
    ...RULES,
    '',
    'Each question may only be answered from the SOURCES listed for it.',
    'Your final message must be the full answer itself: one JSON object and nothing else, no code fence, no commentary.',
    'Its keys are the question ids below. Each value is an object with exactly these string fields:',
    '{"sourceId": "...", "quote": "...", "verdict": "supports" | "contradicts" | "silent", "claim": "...", "reason": "..."}',
    '',
    ...batch.flatMap((q) => [...questionBlock(q, `QUESTION ${q.bankId} (kind ${q.kind}). SOURCES: ${snapsFor(q).map((s) => s.id).join(', ')}`), '']),
    ...snaps.map(sourceBlock),
    '',
    `Reminder: reply with one JSON object whose keys are exactly: ${batch.map((q) => q.bankId).join(', ')}.`,
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
    child.stdin.end(input ?? '');
  });
}

const scratch = mkdtempSync(join(tmpdir(), 'source-check-'));
const schemaFile = join(scratch, 'schema.json');
writeFileSync(schemaFile, JSON.stringify(SCHEMA));

/** The first top-level JSON object in a model's text reply, or null. Never edits the content. */
function parseObject(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

/** Asks the provider about one unit (a list of questions). Returns { answers: { bankId: answer }, model } or { error }. */
async function ask(unit, prompt) {
  if (VIA === 'claude') {
    const res = await run('claude', ['-p', '--model', PROVIDER.model, '--tools', '', '--strict-mcp-config', '--no-session-persistence',
      '--output-format', 'json', '--json-schema', JSON.stringify(SCHEMA)], prompt, scratch);
    if (res.code !== 0) return { error: `claude exit ${res.code}: ${(res.stderr || res.stdout).slice(0, 300)}` };
    const out = JSON.parse(res.stdout);
    if (out.is_error || !out.structured_output) return { error: `claude returned no structured output: ${String(out.result).slice(0, 300)}` };
    return { answers: { [unit[0].bankId]: out.structured_output }, model: Object.keys(out.modelUsage ?? {})[0] ?? PROVIDER.model, provider: Object.values(out.modelUsage ?? {})[0]?.provider ?? null };
  }
  if (VIA === 'codex') {
    const outFile = join(scratch, `${unit[0].bankId.replace(/[^a-z0-9]+/gi, '-')}.json`);
    const res = await run(CODEX, ['exec', '--skip-git-repo-check', '--ephemeral', '--sandbox', 'read-only', '-C', scratch,
      '--output-schema', schemaFile, '-o', outFile, '-'], prompt, scratch);
    const model = (res.stderr + res.stdout).match(/^model:\s*(\S+)/m)?.[1] ?? null;
    if (/usage limit/i.test(res.stderr + res.stdout)) return { error: 'codex subscription usage limit reached', stop: true };
    if (res.code !== 0 || !existsSync(outFile)) return { error: `codex exit ${res.code}: ${(res.stderr || res.stdout).split('\n').filter((l) => /error/i.test(l)).slice(-2).join(' ').slice(0, 300)}` };
    return { answers: { [unit[0].bankId]: JSON.parse(readFileSync(outFile, 'utf8')) }, model, provider: 'openai-chatgpt-subscription' };
  }
  // grok: the prompt goes in a file (batches run to hundreds of kilobytes), and the reply is the text events joined.
  const promptFile = join(scratch, `batch-${sha256(unit.map((q) => q.bankId).join(',')).slice(0, 12)}.txt`);
  writeFileSync(promptFile, prompt);
  const res = await run(GROK, ['--prompt-file', promptFile, '-m', PROVIDER.model, '--cwd', scratch, '--deny', 'run_terminal_command',
    '--disable-web-search', '--no-subagents', '--output-format', 'streaming-json'], '', scratch);
  let text = '';
  for (const line of res.stdout.split('\n')) {
    try {
      const event = JSON.parse(line);
      if (event.type === 'text' && typeof event.data === 'string') text += event.data;
    } catch { /* not an event line */ }
  }
  if (/rate limit|usage limit|quota/i.test(res.stderr) && !text) return { error: `grok limit: ${res.stderr.slice(0, 200)}`, stop: true };
  if (res.code !== 0 && !text) return { error: `grok exit ${res.code}: ${res.stderr.slice(0, 300)}` };
  const parsed = parseObject(text);
  if (!parsed) return { error: `grok reply is not one JSON object: ${text.slice(0, 200)}` };
  return { answers: parsed, model: PROVIDER.model, provider: 'xai-subscription' };
}

const outFile = `${OUT_DIR}/family-${FAMILY}-${VIA}.json`;
mkdirSync(OUT_DIR, { recursive: true });
const existing = existsSync(outFile) ? JSON.parse(readFileSync(outFile, 'utf8')) : null;
const results = existing?.results ?? {};
const questions = (await loadBankQuestions()).filter((q) => !ONLY || ONLY.has(q.bankId));
const todo = questions.filter((q) => snapsFor(q).length > 0 && (REDO || !results[q.bankId] || results[q.bankId].error));

/** Grok units: questions grouped by the snapshots they share, packed up to BATCH_CHARS and BATCH_QUESTIONS. */
function units() {
  if (VIA !== 'grok') return todo.map((q) => [q]);
  const groups = new Map();
  for (const q of todo) {
    const key = snapsFor(q).map((s) => s.id).sort().join('|');
    groups.set(key, [...(groups.get(key) ?? []), q]);
  }
  const out = [];
  let current = [];
  const sizeOf = (qs) => [...new Set(qs.flatMap(snapsFor))].reduce((n, s) => n + s.chars, 0);
  for (const group of [...groups.values()].sort((a, b) => sizeOf(b) - sizeOf(a))) {
    for (let i = 0; i < group.length; i += BATCH_QUESTIONS) {
      const chunk = group.slice(i, i + BATCH_QUESTIONS);
      const withChunk = sizeOf([...current, ...chunk]);
      if (current.length > 0 && (withChunk > BATCH_CHARS || current.length + chunk.length > BATCH_QUESTIONS)) {
        out.push(current);
        current = [];
      }
      current = [...current, ...chunk];
    }
  }
  if (current.length > 0) out.push(current);
  return out;
}

function save() {
  const sorted = Object.fromEntries(Object.entries(results).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(outFile, `${JSON.stringify({
    family: FAMILY,
    via: VIA,
    label: PROVIDER.label,
    model: PROVIDER.model,
    cli: PROVIDER.cli,
    promptVersion: PROVIDER.promptVersion,
    snapshotIndexSha256: sha256(readFileSync(SNAPSHOT_INDEX, 'utf8')),
    results: sorted,
  }, null, 2)}\n`);
}

const work = units();
console.log(`EXTRACT family=${FAMILY} via=${VIA} questions=${questions.length} todo=${todo.length} calls=${work.length} concurrency=${CONCURRENCY}`);
let next = 0;
let stopped = false;
let done = 0;
async function worker() {
  while (!stopped && next < work.length) {
    const unit = work[next++];
    const prompt = VIA === 'grok' ? batchPrompt(unit) : singlePrompt(unit[0]);
    const started = Date.now();
    let res;
    try {
      res = await ask(unit, prompt);
    } catch (err) {
      res = { error: String(err).slice(0, 300) };
    }
    const base = { promptSha256: sha256(prompt), ranOn: new Date().toISOString().slice(0, 10), durationMs: Date.now() - started, ...(unit.length > 1 ? { batch: unit.map((q) => q.bankId) } : {}) };
    if (res.stop) { stopped = true; console.error(`EXTRACT STOP ${res.error}`); }
    for (const q of unit) {
      const a = res.answers?.[q.bankId];
      const shapeOk = a && typeof a === 'object' && ['sourceId', 'quote', 'claim', 'reason'].every((k) => typeof a[k] === 'string') && VERDICTS.has(a.verdict);
      if (res.error || !shapeOk) {
        results[q.bankId] = { ...base, error: res.error ?? (a ? 'answer is missing a field or has an unknown verdict' : 'no answer for this id in the reply') };
        continue;
      }
      const snap = snapsFor(q).find((s) => s.id === a.sourceId);
      // Recorded for the reader only. scripts/source-check-merge.mjs re-runs the check from scratch.
      const check = snap ? verifyQuote(a.quote, readFileSync(snap.file, 'utf8')) : { ok: false, reason: 'sourceId is not one of this question\'s snapshots' };
      results[q.bankId] = { ...base, model: res.model, provider: res.provider, sourceId: a.sourceId, quote: a.quote, verdict: a.verdict,
        claim: a.claim, reason: a.reason, quoteCheckAtRun: check.ok ? 'ok' : check.reason };
    }
    done += 1;
    save();
    const summary = unit.map((q) => results[q.bankId].error ? `${q.bankId}:ERROR` : `${q.bankId}:${results[q.bankId].verdict}/${results[q.bankId].quoteCheckAtRun === 'ok' ? 'ok' : 'bad'}`).join(' ');
    console.log(`EXTRACT ${done}/${work.length} ${Math.round(base.durationMs / 1000)}s ${summary}${res.error ? ` (${res.error.slice(0, 120)})` : ''}`);
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
save();
const errors = Object.values(results).filter((r) => r.error).length;
console.log(`EXTRACT_DONE family=${FAMILY} via=${VIA} answered=${Object.keys(results).length - errors} errors=${errors}${stopped ? ' STOPPED' : ''}`);
process.exit(stopped ? 4 : 0);
