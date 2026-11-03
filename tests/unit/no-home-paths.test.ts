import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import test from "node:test";

// No file in the repo names a home folder. A home path in a doc is noise and gives away the machine it was written on, so a path
// on the machine is written from the home folder as ~ (the same path, which a shell still expands), and a link to a file in
// this repo starts with a slash, which GitHub reads from the repo root. The patterns are built from pieces so this file
// does not match itself.
const repoRoot = resolve(import.meta.dirname, "../..");
// A name in a path, read to its end: whatever follows it (a slash, a space, a quote, markup, punctuation or the end of the
// line) is a character no name has.
const NAME = "[A-Za-z0-9._-]+";
const AFTER = "(?![A-Za-z0-9._-])";
// Not inside a longer path such as /api/Users/123/, which is a route and not a folder, so a word, a dot or a dash cannot
// come right before it. A file:// URL can.
const HOME_PATH = new RegExp(["(?<![\\w.-])/", "Users", "/", NAME, AFTER].join(""));
// A home folder reached through a mounted volume, as on the macOS data volume, whose path runs System, Volumes, Data, Users.
const VOLUME_HOME = new RegExp(["/", "Volumes", "/[^/]+/", "Users", "/", NAME, AFTER].join(""));
// The same in a JSON string, where every slash is escaped.
const ESCAPED_HOME = new RegExp(["(?<![\\w.-])\\\\/", "Users", "\\\\/", NAME].join(""));
const LINUX_HOME = new RegExp(["(?<![\\w.:/-])/", "home", "/", "[a-z_][a-z0-9_-]*", AFTER].join(""));
const WINDOWS_HOME = new RegExp(["[A-Za-z]:", "\\\\", "Users", "\\\\"].join(""), "i");
// The folder Claude keeps a project's logs in spells the home path with dashes.
const ENCODED_HOME = new RegExp(["projects/", "-", "Users", "-", "[A-Za-z]"].join(""));
const namesHome = (line: string) => [HOME_PATH, VOLUME_HOME, ESCAPED_HOME, LINUX_HOME, WINDOWS_HOME, ENCODED_HOME].some((pattern) => pattern.test(line));
const BINARY = /\.(?:png|jpe?g|gif|webp|avif|ico|mp3|m4a|wav|ogg|mp4|woff2?|ttf|otf|pdf|zip|gz)$/i;

// Walks the working tree rather than asking git, so the check also runs on a plain copy with no .git folder.
const SKIP_DIRS = new Set([".git", "node_modules", "dist", "coverage", ".vite"]);
function repoFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) out.push(...repoFiles(resolve(dir, entry.name)));
    } else if (entry.isFile()) {
      out.push(relative(repoRoot, resolve(dir, entry.name)));
    }
  }
  return out;
}

test("no file in the repo names a home folder", () => {
  const files = repoFiles(repoRoot);
  assert.ok(files.length > 500, `the scan sees the repo (${files.length} files)`);
  const offenders: string[] = [];
  let read = 0;
  for (const file of files) {
    if (BINARY.test(file)) continue;
    let text: string;
    try {
      text = readFileSync(resolve(repoRoot, file), "utf8");
    } catch {
      continue;
    }
    // A file with a NUL byte is binary whatever its name says.
    if (text.includes("\0")) continue;
    read += 1;
    text.split("\n").forEach((line, index) => {
      if (namesHome(line)) offenders.push(`${file}:${index + 1}`);
    });
  }
  assert.ok(read > 400, `and reads its text files (${read})`);
  assert.deepEqual(offenders, [], "write the path from the home folder as ~, or link the file from the repo root");
});

test("the guard knows a home folder when it sees one, and a route that only looks like one", () => {
  // Built from pieces, so this file names no home folder of its own.
  const users = ["", "Users", "tester"].join("/");
  const home = ["", "home", "tester"].join("/");
  const caught = [
    `cd ${users}/dev`, `the work sits in ${users}`, `${users}, then the repo`, `${users}: the root`, `${users}; next`,
    `"path": "${users.replace(/\//g, "\\/")}\\/dev"`, `open file://${users}/notes.md`, `[notes](${users}/notes.md)`,
    `${users}</code>`, `**${users}**`, `${["", "System", "Volumes", "Data"].join("/")}${users}/dev`, `${["", "Volumes", "Macintosh HD"].join("/")}${users}`,
    `${home}/dev`, `logs in ${home}`, `${home}: there`, ["C:", "Users", "tester", "dev"].join("\\"), ["projects/", "-", "Users", "-", "tester/1.jsonl"].join(""),
  ];
  const passed = ["the route /api" + users + "/ answers", "~/dev/vax-or-fiction", "the repo root", "<worktrees>/vof-cleanup", "src/looks/look.ts", "/homepage/", "a/home/b",
    ["", "Users", "<name>", "dev"].join("/"), ["", "Users", "*", "Library"].join("/")];
  for (const line of caught) assert.equal(namesHome(line), true, `caught: ${line}`);
  for (const line of passed) assert.equal(namesHome(line), false, `left alone: ${line}`);
});

// Prose is stricter than the rest of the repo. A README, SECURITY.md, CONTRIBUTING.md, or any plain-text file under docs/
// (Markdown, text, logs, JSON, YAML, CSV or Python) names no machine path at all, not even from ~, and no local server
// address: a reader needs the step, not the address. Code, config and tests may still use loopback addresses. The home
// and volume patterns are built from pieces, as above, so this file does not match the check before it.
const PROSE = /(?:^|\/)(?:README[^/]*\.md|SECURITY\.md|CONTRIBUTING\.md)$|^docs\/.*\.(?:md|markdown|txt|text|log|json|jsonl|py|ya?ml|csv|tsv)$/i;
const PROSE_PATTERNS: [string, RegExp][] = [
  ["a home folder", new RegExp(["(?<![\\w-])/", "Users", "/"].join(""))],
  ["a mounted volume", new RegExp(["(?<![\\w-])/", "Volumes", "/"].join(""))],
  ["a private system folder", /\/private\/(?:tmp|var)\b/],
  ["a temporary folder path", /(?<![\w.~-])\/tmp\//],
  ["a folder under ~/dev", /(?:~|\$HOME|\$\{HOME\})\/dev(?![\w-])/],
  ["a loopback host name", /localhost/i],
  ["a loopback or wildcard address", /(?<![\d.])(?:127\.0\.0\.1|0\.0\.0\.0)(?!\d)|\[::1\]/],
];

// Names from the author's own setup, kept as SHA-256 digests so this file does not spell them out: a disk, a variable
// prefix, a workspace and its nickname. Each word is checked whole and in its underscore or hyphen parts, and each pair of
// words is checked too.
const PRIVATE = new Set([
  "281fc54d9f4eac1d86906d272731264bd7787c8e65e52f2f70fe80d9c21e8b90",
  "e649cd1b32b872ff33594130b5c30c5976667e936a9e088e9b372b557ad2ea69",
  "fe905daa8dedc9a2208ecd34757ed3522ef22b0c3ba475dd83629597ca65b4f3",
  "aa6cc0f6e747162d0f7c7f6964af3ca55fdcee0d24688d7b82ea426d9bfe44ae",
]);

// Prose lines allowed to keep a match, as { "path": [line numbers] }, each with the reason. Empty: no prose in this repo
// needs one.
const PROSE_ALLOWED: Record<string, number[]> = {};

const digests = new Map<string, string>();
function digest(text: string): string {
  let hex = digests.get(text);
  if (!hex) {
    hex = createHash("sha256").update(text).digest("hex");
    digests.set(text, hex);
  }
  return hex;
}

function wordParts(word: string): string[] {
  const marks = [...word.matchAll(/_/g)].map((match) => match.index ?? 0);
  const starts = [0, ...marks.map((index) => index + 1)];
  const ends = [...marks, word.length];
  const out: string[] = [];
  for (const start of starts) {
    for (const end of ends) {
      if (end <= start) continue;
      out.push(word.slice(start, end));
      if (end < word.length) out.push(word.slice(start, end + 1));
    }
  }
  return out;
}

function namesPrivate(line: string, names: Set<string> = PRIVATE): boolean {
  const words = line.toLowerCase().match(/[a-z0-9_-]+/g) ?? [];
  return words.some((word, index) =>
    wordParts(word.replace(/-/g, "_")).some((part) => names.has(digest(part))) ||
    (index > 0 && names.has(digest(`${words[index - 1]} ${word}`))));
}

const proseFindings = (line: string) => [
  ...PROSE_PATTERNS.filter(([, pattern]) => pattern.test(line)).map(([what]) => what),
  ...(namesPrivate(line) ? ["a private name"] : []),
];

test("READMEs and docs name no machine path, private name or loopback address", () => {
  const prose = repoFiles(repoRoot).filter((file) => PROSE.test(file));
  assert.ok(prose.includes("README.md") && prose.length > 5, `the scan sees the prose (${prose.length} files)`);
  const read = (file: string) => readFileSync(resolve(repoRoot, file), "utf8").split("\n");
  const hits: string[] = [];
  for (const file of prose) {
    read(file).forEach((line, index) => {
      if (PROSE_ALLOWED[file]?.includes(index + 1)) return;
      for (const what of proseFindings(line)) hits.push(`${file}:${index + 1}: ${what}`);
    });
  }
  for (const [file, numbers] of Object.entries(PROSE_ALLOWED)) {
    const lines = read(file);
    for (const n of numbers) assert.ok(proseFindings(lines[n - 1] ?? "").length > 0, `${file}:${n} no longer needs its allowlist entry`);
  }
  assert.deepEqual(hits, [], "say what the reader does instead of giving the address, and write paths with placeholders such as <repo>");
});

test("the prose guard catches what it is for and leaves ordinary text alone", () => {
  // Built from pieces, so this file names no home folder of its own.
  const users = ["", "Users", "someone"].join("/");
  const caught = [`cd ${users}/x`, `see ..${users}`, ["", "Volumes", "Disk", "x"].join("/"), "file:///private/tmp/x", "at ../../private/tmp/x",
    "clone at /tmp/x", "see ~/dev/x", "open http://localhost:3000", "--bind 127.0.0.1.", "listen on 0.0.0.0", "http://[::1]:8080"];
  const passed = [`the route /api${users}/ answers`, "src/tmp/cache", "version 10.0.0.0", "file://<repo>/test/a.js", "real estate", "~/development"];
  for (const line of caught) assert.ok(proseFindings(line).length > 0, `caught: ${line}`);
  for (const line of passed) assert.deepEqual(proseFindings(line), [], `left alone: ${line}`);
  const decoy = new Set([digest("decoy_"), digest("a decoy")]);
  assert.equal(namesPrivate("X_DECOY_PATH=1", decoy), true);
  assert.equal(namesPrivate("in a decoy folder", decoy), true);
  assert.equal(namesPrivate("decoys and decoying", decoy), false);
});
