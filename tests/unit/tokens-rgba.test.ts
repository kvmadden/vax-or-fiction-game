import { describe, it } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";

describe("Task 5.4 / Defect DESIGN-04: Eliminate Raw rgba() Tokens", () => {
  const repoRoot = path.resolve(process.cwd());
  const srcDir = path.join(repoRoot, "src");

  function walkDir(dir: string): string[] {
    let files: string[] = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        files = files.concat(walkDir(fullPath));
      } else if (/\.(tsx?|jsx?|css|html)$/.test(entry.name)) {
        files.push(fullPath);
      }
    }
    return files;
  }

  it("DESIGN-04: Zero raw rgba() / rgb() calls in src component files", () => {
    const srcFiles = walkDir(srcDir);
    const violations: { file: string; match: string }[] = [];

    for (const file of srcFiles) {
      if (file.endsWith("tokens.css")) continue; // tokens.css defines --color-rim and --color-shadow per DS-03
      const content = fs.readFileSync(file, "utf8");
      const matches = content.match(/rgba?\s*\([^)]+\)/g);
      if (matches) {
        for (const m of matches) {
          violations.push({
            file: path.relative(repoRoot, file),
            match: m,
          });
        }
      }
    }

    assert.strictEqual(
      violations.length,
      0,
      `Expected 0 raw rgba() / rgb() calls in component files, found ${violations.length}:\n` +
        violations.slice(0, 10).map((v) => `  ${v.file}: ${v.match}`).join("\n")
    );
  });

  it("DESIGN-04: Total raw rgba() calls in entire src/ is <= 2 (restricted to tokens.css)", () => {
    const srcFiles = walkDir(srcDir);
    let totalRgba = 0;

    for (const file of srcFiles) {
      const content = fs.readFileSync(file, "utf8");
      const matches = content.match(/rgba?\s*\([^)]+\)/g);
      if (matches) {
        totalRgba += matches.length;
      }
    }

    assert.ok(
      totalRgba <= 2,
      `Expected total raw rgba() in src/ <= 2, found ${totalRgba}`
    );
  });

  it("DESIGN-04: the painted palette mixes color instead of a second TypeScript palette", () => {
    const css = fs.readFileSync(path.join(srcDir, "design/tokens.css"), "utf8");
    assert.match(css, /color-mix\(in srgb, var\(--color-light\) 4\.6%, transparent\)/);
    assert.strictEqual(fs.existsSync(path.join(srcDir, "design/tokens.ts")), false);
  });
});
