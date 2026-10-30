import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../../");

test("PHONE-01 / JUDGE-P01: index.html defines viewport-fit=cover and interactive-widget=resizes-content", () => {
  const indexHtml = fs.readFileSync(path.join(repoRoot, "index.html"), "utf8");
  assert.ok(
    indexHtml.includes("viewport-fit=cover"),
    "index.html must include viewport-fit=cover to enable safe area insets on mobile WebKit"
  );
  assert.ok(
    indexHtml.includes("interactive-widget=resizes-content"),
    "index.html must include interactive-widget=resizes-content to properly resize height on virtual keyboard appearance"
  );
  assert.doesNotMatch(
    indexHtml,
    /walkin\.mp3" as="fetch"/,
    "walk-in must not as=fetch-preload — that duplicated Smile without warming HTMLAudioElement",
  );
  assert.doesNotMatch(
    indexHtml,
    /menu-soft-loop\.mp3" as="fetch"/,
    "menu-soft must not as=fetch-preload, because music-warm's EARLY_PREFETCH owns media warm",
  );
  assert.doesNotMatch(indexHtml, /as="audio"/);
  const warm = fs.readFileSync(path.join(repoRoot, "src/engine/music-warm.ts"), "utf8");
  assert.match(warm, /EARLY_PREFETCH_ROLES = \['walkin', 'menu-soft'\]/);
});

test("PHONE-02 / JUDGE-P02: presentation.css defines .phone-viewport-container utility class", () => {
  const css = fs.readFileSync(path.join(repoRoot, "src/styles/presentation.css"), "utf8");
  assert.ok(
    css.includes(".phone-viewport-container"),
    "presentation.css must define .phone-viewport-container utility class"
  );
  assert.ok(
    css.includes("min-height: 100dvh;"),
    ".phone-viewport-container must specify min-height: 100dvh"
  );
  assert.ok(
    css.includes("touch-action: manipulation;"),
    ".phone-viewport-container must specify touch-action: manipulation"
  );
  assert.ok(
    css.includes("overscroll-behavior-y: contain;"),
    ".phone-viewport-container must specify overscroll-behavior-y: contain"
  );
});

test("PHONE-03 / JUDGE-P01: PhoneJoin stays within PhoneLayout rather than adding a second viewport", () => {
  const phoneJoin = fs.readFileSync(path.join(repoRoot, "src/phone/PhoneJoin.tsx"), "utf8");
  assert.ok(
    !phoneJoin.includes("min-h-screen"),
    "PhoneJoin.tsx must not use min-h-screen (which induces 100vh toolbar overflow)"
  );
  assert.ok(
    !phoneJoin.includes("min-h-[100dvh]"),
    "PhoneJoin.tsx must not add a second viewport below PhoneLayout"
  );
  assert.ok(
    phoneJoin.includes("phone-code-screen"),
    "PhoneJoin.tsx exposes its finite code-entry screen without taking a second viewport"
  );
});

test("PHONE-02 / JUDGE-P02: PhoneLayout owns the finite viewport and PhoneVote is its question child", () => {
  const phoneLayout = fs.readFileSync(path.join(repoRoot, "src/phone/PhoneLayout.tsx"), "utf8");
  assert.ok(
    phoneLayout.includes("phone-viewport-container"),
    "PhoneLayout.tsx must include phone-viewport-container class"
  );
  assert.ok(
    phoneLayout.includes('touchAction: "manipulation"'),
    "PhoneLayout.tsx must set touchAction: 'manipulation'"
  );

  const phoneVote = fs.readFileSync(path.join(repoRoot, "src/phone/PhoneVote.tsx"), "utf8");
  assert.ok(!phoneVote.includes("phone-viewport-container"), "PhoneVote must not establish a second viewport inside PhoneLayout");
  assert.ok(phoneVote.includes('data-screen="question"'), "PhoneVote declares the finite question screen");
  assert.ok(phoneVote.includes('minHeight: 0'), "PhoneVote can shrink inside the live viewport");
  assert.ok(
    phoneVote.includes("touchAction: 'manipulation'"),
    "PhoneVote.tsx must set touchAction: 'manipulation' on voting interactions"
  );
});
