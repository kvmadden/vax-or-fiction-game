import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// Defect A11Y-05 & JUDGE-A07: Enforce prefers-reduced-motion media query and Framer Motion guards
test("A11Y-05 / JUDGE-A07: presentation.css includes @media (prefers-reduced-motion: reduce) override", () => {
  const cssPath = path.resolve(import.meta.dirname, "../../src/styles/presentation.css");
  const content = fs.readFileSync(cssPath, "utf-8");

  assert.ok(
    content.includes("@media (prefers-reduced-motion: reduce)"),
    "presentation.css must contain @media (prefers-reduced-motion: reduce)"
  );
  assert.ok(
    content.includes("animation-duration: 0.01ms !important"),
    "reduced-motion block must set animation-duration: 0.01ms !important"
  );
  assert.ok(
    content.includes("animation-iteration-count: 1 !important"),
    "reduced-motion block must set animation-iteration-count: 1 !important"
  );
  assert.ok(
    content.includes("transition-duration: 0.01ms !important"),
    "reduced-motion block must set transition-duration: 0.01ms !important"
  );
});

test("A11Y-05 / JUDGE-A07: Lobby.tsx guards Framer Motion components with shouldReduceMotion", () => {
  const lobbyPath = path.resolve(import.meta.dirname, "../../src/screens/Lobby.tsx");
  const content = fs.readFileSync(lobbyPath, "utf-8");

  assert.ok(
    content.includes("useReducedMotion"),
    "Lobby.tsx must import useReducedMotion from framer-motion"
  );
  assert.ok(
    content.includes("const shouldReduceMotion = useReducedMotion();"),
    "Lobby.tsx must initialize shouldReduceMotion"
  );
  // Status indicator pulse dot
  assert.ok(
    content.includes("!shouldReduceMotion &&"),
    "Status indicator looping pulse animation must be conditionally rendered with !shouldReduceMotion"
  );
  // Screen dissolve is ScreenRouter's job — Lobby must not nest a second opacity mount fade.
  assert.equal(
    content.includes("transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.26, ease: \"easeOut\" }}"),
    false,
    "Lobby must not nest a copy-reveal opacity transition under the router dissolve",
  );
  // Now playing bars
  assert.ok(
    content.includes("shouldReduceMotion"),
    "Now playing bars must respect shouldReduceMotion"
  );
});
