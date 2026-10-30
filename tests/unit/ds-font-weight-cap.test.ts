import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// DS-11. IBM Plex Sans is registered (src/styles/fonts.css) only at
// 400/500/600/700, and font-weight 800/900 has no matching face. Before capping these to 700, I
// rendered the same text at 700 vs 900 and at 700 vs 800 (three representative sizes: an 11-14px
// label, a 28px title-case line, and 64px display digits) and diff'd the raster output pixel for
// pixel: 0 differing pixels at every size in both comparisons (a local evidence file/
// weight-compare.log and weight-compare-800.log, gitignored scratch). This browser does not
// synthesize a bolder face when only 700 is loaded, so capping to 700 is a zero-visual-change
// cleanup, not a restyle.
const root = path.resolve(import.meta.dirname, "../..");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(css|tsx|ts)$/.test(entry.name)) out.push(full);
  }
  return out;
}

function findHeavyWeightsIn(dir: string, relativeTo: string): string[] {
  const findings: string[] = [];
  for (const file of walk(dir)) {
    const text = fs.readFileSync(file, "utf8");
    for (const match of text.matchAll(/font-weight:\s*(800|900)\b/g)) {
      findings.push(`${path.relative(relativeTo, file)}: font-weight: ${match[1]}`);
    }
    for (const match of text.matchAll(/fontWeight:\s*(800|900)\b/g)) {
      findings.push(`${path.relative(relativeTo, file)}: fontWeight: ${match[1]}`);
    }
  }
  return findings;
}

function findHeavyWeights(): string[] {
  return findHeavyWeightsIn(path.join(root, "src"), root);
}

test("no component declares font-weight 800 or 900 when IBM Plex Sans loads only to 700 (DS-11)", () => {
  assert.deepEqual(findHeavyWeights(), []);
});

// TW4: this control previously wrote src/styles/__ds11-control.css, inside the real source tree
// Vite and TypeScript watch, and a killed run before the finally could leave it there. Planted
// in a scratch os.tmpdir() directory instead, entirely outside src/, so the scanner is proven on
// a real violation without ever touching the tree the real test above scans.
test("the heavy-weight scanner actually catches a violation (control)", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ds11-control-"));
  try {
    fs.writeFileSync(path.join(tmpDir, "__ds11-control.css"), ".x { font-weight: 900; }\n");
    const findings = findHeavyWeightsIn(tmpDir, tmpDir);
    assert.ok(findings.some((f) => f.includes("__ds11-control.css")), "the scanner must flag the planted violation");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
