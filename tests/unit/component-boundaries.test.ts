import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();

function source(relativePath: string): string {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

test("component modules do not attach test utilities to React components", () => {
  const hud = source("src/facilitator/HUD.tsx");
  const keyboard = source("src/facilitator/Keyboard.tsx");

  assert.doesNotMatch(hud, /Object\.assign\(HUD/);
  assert.doesNotMatch(keyboard, /Object\.assign\(Keyboard/);
});

test("effect synchronization is not hidden behind reducer dispatch names", () => {
  assert.doesNotMatch(source("src/facilitator/HUD.tsx"), /useReducer/);
  assert.doesNotMatch(source("src/screens/Question.tsx"), /useReducer/);
});

test("PhoneJoin consumes the shared device identity utility", () => {
  const phoneJoin = source("src/phone/PhoneJoin.tsx");

  assert.match(phoneJoin, /import\s*\{[^}]*getOrCreateDeviceId[^}]*\}\s*from\s*["']\.\/phone-join-utils["']/s);
  assert.doesNotMatch(phoneJoin, /function getOrCreateDeviceId/);
});
