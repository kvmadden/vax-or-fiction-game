import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import url from "node:url";

// Derives every localStorage key or key-prefix written anywhere in src/, the same way the
// privacy-storage sweep did (2026-09-28), then fails if the Privacy page's "On your device"
// list is missing one. This is deliberately NOT a hand list: it walks src/, finds every
// localStorage.setItem call site (direct or through window./globalThis.), resolves the key
// argument (string literal, a local const identifier, or a template literal's static prefix),
// and separately follows the storedIdentity(key, persistent) wrapper in src/network/room.ts to
// every call site that passes persistent=true (the only branch that touches localStorage instead
// of sessionStorage).

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const SRC_DIR = path.resolve(__dirname, "../../src");
const PRIVACY_PATH = path.resolve(SRC_DIR, "screens/site/Privacy.tsx");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith(".test.ts")) out.push(full);
  }
  return out;
}

const files = walk(SRC_DIR);
assert.ok(files.length > 50, `the sweep should see the whole src tree, saw only ${files.length} files`);

interface Finding {
  file: string;
  raw: string;
  resolved: string;
  isPrefix: boolean;
}

function resolveKeyArg(fileText: string, argExpr: string): { resolved: string; isPrefix: boolean } | null {
  const trimmed = argExpr.trim();

  // Plain string literal: "vrc_device_id" or 'vrc_device_id'
  const literalMatch = trimmed.match(/^["']([^"']+)["']$/);
  if (literalMatch) return { resolved: literalMatch[1], isPrefix: false };

  // Template literal: `vof-solo-best:${topicId}` -> the static text before the first ${ is the prefix
  const templateMatch = trimmed.match(/^`([^`$]*)\$\{/);
  if (templateMatch) return { resolved: templateMatch[1], isPrefix: true };

  // Bare identifier: STORAGE_KEY -> resolve its own const declaration in this file
  const identMatch = trimmed.match(/^([A-Za-z_$][A-Za-z0-9_$]*)$/);
  if (identMatch) {
    const ident = identMatch[1];
    const declMatch = fileText.match(new RegExp(`const\\s+${ident}\\s*=\\s*["']([^"']+)["']`));
    if (declMatch) return { resolved: declMatch[1], isPrefix: false };
    return null;
  }

  // Concatenation: KEY_PREFIX + topicId -> resolve the leading identifier as a prefix
  const concatMatch = trimmed.match(/^([A-Za-z_$][A-Za-z0-9_$]*)\s*\+/);
  if (concatMatch) {
    const ident = concatMatch[1];
    const declMatch = fileText.match(new RegExp(`const\\s+${ident}\\s*=\\s*["']([^"']+)["']`));
    if (declMatch) return { resolved: declMatch[1], isPrefix: true };
    return null;
  }

  return null;
}

const findings: Finding[] = [];
let directSetItemSites = 0;
let storedIdentitySites = 0;
let storedIdentityLocalSites = 0;

for (const file of files) {
  const text = fs.readFileSync(file, "utf8");

  // Direct localStorage.setItem / window.localStorage.setItem / globalThis.localStorage.setItem
  const setItemRe = /(?:window\.|globalThis\.)?localStorage\.setItem\(\s*([^,]+),/g;
  let m: RegExpExecArray | null;
  while ((m = setItemRe.exec(text))) {
    directSetItemSites += 1;
    const resolved = resolveKeyArg(text, m[1]);
    if (resolved) findings.push({ file, raw: m[1].trim(), resolved: resolved.resolved, isPrefix: resolved.isPrefix });
  }

  // storedIdentity(key, persistent) calls anywhere in src -- persistent truthy means localStorage
  const storedIdentityRe = /storedIdentity\(\s*([^,]+?)\s*,\s*([^)]+?)\s*\)/g;
  while ((m = storedIdentityRe.exec(text))) {
    if (file.endsWith("room.ts") && /export function storedIdentity/.test(text.slice(Math.max(0, m.index - 40), m.index))) continue;
    storedIdentitySites += 1;
    const persistentArg = m[2].trim();
    if (persistentArg === "true") {
      storedIdentityLocalSites += 1;
      const keyExpr = m[1].trim();
      const templateMatch = keyExpr.match(/^`([^`$]*)\$\{/);
      if (templateMatch) {
        findings.push({ file, raw: keyExpr, resolved: templateMatch[1], isPrefix: true });
      } else {
        const literalMatch = keyExpr.match(/^["']([^"']+)["']$/);
        if (literalMatch) findings.push({ file, raw: keyExpr, resolved: literalMatch[1], isPrefix: false });
      }
    }
  }
}

// De-dupe by resolved key
const byKey = new Map<string, Finding>();
for (const f of findings) byKey.set(f.resolved, f);
const uniqueKeys = [...byKey.values()];

test("the sweep sees a non-empty, expected set of localStorage write sites", () => {
  console.log(`[sweep] direct localStorage.setItem call sites: ${directSetItemSites}`);
  console.log(`[sweep] storedIdentity() call sites total: ${storedIdentitySites}, persistent (localStorage) sites: ${storedIdentityLocalSites}`);
  console.log(`[sweep] resolved unique localStorage keys/prefixes: ${uniqueKeys.map((f) => f.resolved).sort().join(", ")}`);
  // An empty sweep must fail loudly, not pass silently.
  assert.ok(directSetItemSites >= 3, `expected at least 3 direct localStorage.setItem sites, found ${directSetItemSites}`);
  assert.ok(storedIdentityLocalSites >= 2, `expected at least 2 persistent storedIdentity() sites, found ${storedIdentityLocalSites}`);
  assert.ok(uniqueKeys.length >= 5, `expected at least 5 resolved keys/prefixes, found ${uniqueKeys.length}`);
});

test("every localStorage key or prefix written in src/ is listed on the Privacy page", () => {
  const privacyText = fs.readFileSync(PRIVACY_PATH, "utf8");
  const onDeviceSection = privacyText.match(/<h2>On your device<\/h2>[\s\S]*?<h2>/)?.[0];
  assert.ok(onDeviceSection, "the Privacy page has an 'On your device' section");

  const missing: string[] = [];
  for (const finding of uniqueKeys) {
    if (!onDeviceSection!.includes(finding.resolved)) missing.push(`${finding.resolved} (from ${path.relative(SRC_DIR, finding.file)})`);
  }
  assert.deepEqual(missing, [], `Privacy page's 'On your device' list is missing: ${missing.join(", ")}`);
});
