import assert from "node:assert/strict";
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
