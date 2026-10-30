import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";

// DS-13: .walkin-lyrics-track references --font-sans, which is never
// declared anywhere in the codebase (the real token is --kit-font-sans). The class itself matches
// no live element today (grepped: zero uses of the literal class name outside this one CSS rule,
// and the real walk-in lyrics feature renders .walkin-lyric / .vrc-lyric-scroll instead), so this is
// harmless right now. It stops being harmless the moment someone revives that class, so it gets a
// real fallback rather than being left to silently fall through to the browser default font.

/**
 * Files under `dir` (recursively) whose extension is one of `extensions` that contain `needle`.
 * Previously this test shelled out to `grep -rl ... || true`, reading any grep failure (a bad
 * path, a permissions error, grep missing) as "no hits", indistinguishable from the search never
 * actually running. Worse, the exit code this test's own execSync call actually receives at
 * runtime comes from whatever /bin/sh resolves `grep` to, not the operator's interactive-shell
 * ugrep alias: on this machine that is BSD grep (/usr/bin/grep), which returns the same exit
 * code 1 for "no matches" and for a nonexistent search path, so no exit-code check can tell them
 * apart here at all. A plain Node walk sidesteps the ambiguity entirely: a real filesystem error
 * throws (readdirSync/readFileSync throw on a bad path), and "found nothing" is only ever an
 * honestly empty array.
 */
function filesContaining(dir: string, needle: string, extensions: readonly string[]): string[] {
  const hits: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist") continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      hits.push(...filesContaining(full, needle, extensions));
    } else if (extensions.some((ext) => entry.name.endsWith(ext)) && readFileSync(full, "utf8").includes(needle)) {
      hits.push(full);
    }
  }
  return hits;
}

test(".walkin-lyrics-track is unreachable from any live component (still true, DS-13 context)", () => {
  const root = resolve(import.meta.dirname, "../..");
  const hits = filesContaining(join(root, "src"), "walkin-lyrics-track", [".tsx", ".ts"]);
  assert.deepEqual(hits, [], "if this now fails, a component reached .walkin-lyrics-track and DS-13's fallback is load-bearing, not just defensive");
});

test("the scanner actually catches a planted hit (control)", () => {
  const tmpDir = mkdtempSync(join(tmpdir(), "ds13-control-"));
  try {
    writeFileSync(join(tmpDir, "__ds13-control.tsx"), "export const x = 'walkin-lyrics-track';\n");
    const hits = filesContaining(tmpDir, "walkin-lyrics-track", [".tsx", ".ts"]);
    assert.equal(hits.length, 1, "the scanner must flag the planted reference");
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test(".walkin-lyrics-track no longer references the undeclared --font-sans without a fallback (DS-13)", () => {
  const css = readFileSync(resolve(import.meta.dirname, "../../src/styles/preshow-stage.css"), "utf8");
  const ruleStart = css.indexOf(".walkin-lyrics-track {");
  const rule = css.slice(ruleStart, css.indexOf("}", ruleStart));
  assert.doesNotMatch(rule, /font-family:\s*var\(--font-sans\);/, "bare var(--font-sans) with no fallback must be gone");
  assert.match(rule, /font-family:\s*var\(--font-sans,\s*var\(--kit-font-sans\)\);/);
});
