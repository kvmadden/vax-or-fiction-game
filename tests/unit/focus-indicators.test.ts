import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../");

test("A11Y-02: WhichPatientQuestion does not suppress focus via outline: 'none'", () => {
  const filePath = path.join(repoRoot, "src/screens/questions/WhichPatientQuestion.tsx");
  const content = fs.readFileSync(filePath, "utf8");
  const matches = content.split("\n").filter((line) => /outline:\s*['"]none['"]/.test(line));
  assert.equal(
    matches.length,
    0,
    `Expected 0 occurrences of outline: 'none' in WhichPatientQuestion.tsx, found ${matches.length}`
  );
});

test("A11Y-02: PhoneJoin does not suppress focus via outline-none", () => {
  const filePath = path.join(repoRoot, "src/phone/PhoneJoin.tsx");
  const content = fs.readFileSync(filePath, "utf8");
  const matches = content.split("\n").filter((line) => /\boutline-none\b/.test(line));
  assert.equal(
    matches.length,
    0,
    `Expected 0 occurrences of outline-none in PhoneJoin.tsx, found ${matches.length}`
  );
});

test("A11Y-02: PhoneClosing does not suppress focus via outline-none", () => {
  const filePath = path.join(repoRoot, "src/phone/PhoneClosing.tsx");
  const content = fs.readFileSync(filePath, "utf8");
  const matches = content.split("\n").filter((line) => /\boutline-none\b/.test(line));
  assert.equal(
    matches.length,
    0,
    `Expected 0 occurrences of outline-none in PhoneClosing.tsx, found ${matches.length}`
  );
});

test("A11Y-03 / JUDGE-A03: presentation.css defines global accessible :focus-visible rules", () => {
  const filePath = path.join(repoRoot, "src/styles/presentation.css");
  const content = fs.readFileSync(filePath, "utf8");
  
  assert.match(
    content,
    /:focus-visible\s*\{[^}]*outline:\s*2px\s+solid\s+var\(--color-accent-teal\)/,
    "presentation.css must define :focus-visible with 2px solid var(--color-accent-teal)"
  );
  assert.match(
    content,
    /:focus-visible\s*\{[^}]*outline-offset:\s*2px/,
    "presentation.css must define :focus-visible with outline-offset: 2px"
  );
});

test("A11Y-03: tokens.css declares --color-accent-teal design token", () => {
  const filePath = path.join(repoRoot, "src/design/tokens.css");
  const content = fs.readFileSync(filePath, "utf8");
  assert.match(
    content,
    /--color-accent-teal:\s*#[0-9a-fA-F]{6}/,
    "tokens.css must define --color-accent-teal"
  );
});
