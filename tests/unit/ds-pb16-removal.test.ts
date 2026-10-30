import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";

// DS-15: PresentationSuite.tsx applies a "pb-16" class to the stage
// wrapper, but Tailwind is not part of this build (confirmed: no tailwind.config.js, postcss.config.js
// does not reference tailwindcss) and .pb-16 has zero matching CSS rule anywhere in src. It was a
// phantom clearance buffer contributing 0px. The stale test that only string-matched for its
// presence (tests/unit/hud-layout-tokens.test.ts) is removed alongside it, since asserting a dead
// class stays present is not real coverage.

test("PresentationSuite no longer carries the dead pb-16 class (DS-15)", () => {
  const tsx = readFileSync(resolve(import.meta.dirname, "../../src/presentation/PresentationSuite.tsx"), "utf8");
  assert.doesNotMatch(tsx, /\bpb-16\b/, "pb-16 must be gone from the stage-wrapper className");
  assert.match(tsx, /className=\{stageInSetupChrome \? "presenter-setup-stage" : "stage-wrapper"\}/);
});

test("no CSS rule anywhere defines .pb-16 (it was never real, confirming this is a no-op removal)", () => {
  const root = resolve(import.meta.dirname, "../..");
  function walk(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full, out);
      else if (entry.name.endsWith(".css")) out.push(full);
    }
    return out;
  }
  for (const file of walk(join(root, "src"))) {
    assert.doesNotMatch(readFileSync(file, "utf8"), /\.pb-16\b/, `${file} must not define .pb-16`);
  }
});
