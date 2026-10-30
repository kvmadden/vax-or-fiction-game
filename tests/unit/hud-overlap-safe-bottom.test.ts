import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import React from "react";
import { renderToString } from "react-dom/server";
import BinaryQuestion from "../../src/screens/questions/BinaryQuestion";
import { MythAmongThree } from "../../src/screens/questions/MythAmongThree";
import Closing from "../../src/screens/Closing";
import { HUD } from "../../src/facilitator/HUD";
import { DEFAULT_AUTO_HIDE_DELAY_MS, HUDAutoHideController } from "../../src/facilitator/hud-auto-hide";
import type { BinaryQuestion as BinaryQuestionType, MythQuestion as MythQuestionType } from "../../src/data/types";
import { presentationBundle } from './css-declarations';

// ==============================================================================
// Task 2.6 / Defect JUDGE-F05: Fix Bottom HUD Overlap on Slide Citations (P1)
// ==============================================================================

test("JUDGE-F05: the question frame clears the HUD, not a Tailwind pad on the kind", () => {
  const sampleQuestion: BinaryQuestionType = {
    id: "q-binary-test",
    kind: "binary",
    statement: "MMR vaccine causes autism.",
    answer: false,
    emphasis: ["autism"],
    source: "CDC / Institute of Medicine Review",
    explanation: "Multiple global studies refute any link between MMR and autism.",
    citations: [
      {
        publisher: "CDC MMWR",
        lastVerified: "2024",
      },
    ],
  };

  const html = renderToString(
    React.createElement(BinaryQuestion, {
      question: sampleQuestion,
      interactive: true,
    })
  );

  assert.ok(!html.includes("pb-28"), "BinaryQuestion must not pad itself with Tailwind; the frame clears the HUD");
  assert.ok(!html.includes("padding-bottom:112px") && !html.includes("padding-bottom: 112px"));
  const flow = fs.readFileSync(new URL("../../src/styles/question-flow.css", import.meta.url), "utf8");
  assert.match(flow, /--question-hud-overlap/);
});

test("JUDGE-F05: MythAmongThree stage canvas includes safe bottom clearance (pb-28 / paddingBottom: 112px)", () => {
  const sampleQuestion: MythQuestionType = {
    id: "q-myth-test",
    kind: "myth-among-three",
    topic: "Vaccine Safety",
    statements: [
      "Thimerosal was removed from childhood vaccines in 2001.",
      "Natural immunity is always safer and more effective than vaccination.",
      "VAERS accepts all reports regardless of causality.",
    ],
    source: "WHO Global Advisory Committee on Vaccine Safety",
  };

  const html = renderToString(
    React.createElement(MythAmongThree, {
      question: sampleQuestion,
      interactive: true,
    })
  );

  assert.ok(!html.includes("pb-28"), "MythAmongThree must not pad itself with Tailwind; the frame clears the HUD");
  assert.ok(!html.includes("padding-bottom:112px") && !html.includes("padding-bottom: 112px"));
});

test("JUDGE-F05: Closing uses the source-aligned show frame instead of legacy inset padding", () => {
  const html = renderToString(
    React.createElement(Closing, {
      title: "Session Finale",
      eyebrow: "RECAP",
    })
  );

  assert.ok(html.includes('data-show-frame="true"'), "Closing must render inside the shared show frame");
  assert.ok(
    html.includes('class="show-frame closing-show-frame"'),
    "Closing must use the source-aligned closing show frame"
  );
  assert.ok(!html.includes("pb-28"), "Closing must not shrink the protected 16:9 frame with legacy HUD padding");
});

test("Showdown reserves HUD overlap the same way Closing does", () => {
  const source = fs.readFileSync(new URL("../../src/screens/Showdown.tsx", import.meta.url), "utf8");
  const css = presentationBundle();
  assert.match(source, /useStageHudOverlap\(shellRef, format, '--showdown-hud-overlap'\)/);
  assert.match(css, /--showdown-hud-overlap/);
});

test("portrait/square packing keeps HUD overlap inside 4-value inset", () => {
  const leaderboard = fs.readFileSync(new URL("../../src/styles/leaderboard.css", import.meta.url), "utf8");
  const chrome = fs.readFileSync(new URL("../../src/styles/question-chrome.css", import.meta.url), "utf8");
  const flow = fs.readFileSync(new URL("../../src/styles/question-flow.css", import.meta.url), "utf8");
  const closing = fs.readFileSync(new URL("../../src/styles/closing-critique.css", import.meta.url), "utf8");

  // Mid-run packing is one 4-value inset that bakes --*-hud-overlap. Companion
  // `bottom` after a 2-value `inset` is the wipe that made f5afc08 necessary.
  assert.match(leaderboard, /leaderboard-show-frame[\s\S]*?\.show-safe\s*\{[^}]*inset:[^}]*--leaderboard-hud-overlap/);
  assert.doesNotMatch(leaderboard, /leaderboard-show-frame[\s\S]*?\.show-safe\s*\{[^}]*\nbottom:/);

  assert.match(chrome, /showdown-show-frame[\s\S]*?\.show-safe\s*\{[^}]*inset:[^}]*--showdown-hud-overlap/);
  assert.doesNotMatch(chrome, /showdown-show-frame[\s\S]*?\.show-safe\s*\{[^}]*\nbottom:/);

  assert.match(flow, /question-show-frame[\s\S]*?\.show-safe\s*\{[^}]*inset:[^}]*--question-hud-overlap/);
  assert.doesNotMatch(flow, /question-show-frame[\s\S]*?\.show-safe\s*\{[^}]*\nbottom:/);

  assert.match(closing, /closing-show-frame[\s\S]*?\.show-safe\s*\{[^}]*inset:[^}]*--closing-hud-overlap/);
  assert.doesNotMatch(closing, /closing-show-frame[\s\S]*?\.show-safe\s*\{[^}]*\nbottom:/);
});

test("JUDGE-F05: HUD component instantiates with default 2500ms autoHideDelay and valid props", () => {
  assert.equal(typeof HUD, "function", "HUD must be a functional component");
  assert.equal(HUD.defaultProps?.autoHideDelay, 2500, "HUD defaultProps must specify 2500ms");
  assert.equal(DEFAULT_AUTO_HIDE_DELAY_MS, 2500, "DEFAULT_AUTO_HIDE_DELAY_MS constant must equal 2500");

  const element = React.createElement(HUD, {});
  assert.equal(element.type, HUD, "Instantiated element type must match HUD");
  assert.equal(element.props.autoHideDelay ?? HUD.defaultProps?.autoHideDelay, 2500);

  // Verify SSR rendering with default container handling
  const html = renderToString(React.createElement(HUD, {}));
  assert.equal(typeof html, "string", "HUD must safely render in SSR without throwing");
});

test("JUDGE-F05: HUD autoHide timer triggers onHide after 2500ms of inactivity", (t) => {
  t.mock.timers.enable();

  let hidden = false;
  const controller = new HUDAutoHideController({
    autoHideDelay: 2500,
    onHide: () => {
      hidden = true;
    },
    isVisible: true,
  });

  assert.equal(controller.isTimerActive(), true, "Timer must be active on initialization");
  assert.equal(hidden, false, "HUD must remain visible initially");

  // Advance 2400ms (threshold is 2500ms)
  t.mock.timers.tick(2400);
  assert.equal(hidden, false, "HUD must remain visible before 2500ms threshold");

  // Advance 100ms (2500ms elapsed)
  t.mock.timers.tick(100);
  assert.equal(hidden, true, "HUD must trigger onHide after 2500ms of inactivity");

  controller.dispose();
});

test("JUDGE-F05: HUD autoHide timer resets on user activity and throttles to eliminate render churn", (t) => {
  t.mock.timers.enable();

  let hidden = false;
  const controller = new HUDAutoHideController({
    autoHideDelay: 2500,
    onHide: () => {
      hidden = true;
    },
    isVisible: true,
    throttleMs: 250,
  });

  // Advance 2000ms
  t.mock.timers.tick(2000);
  assert.equal(hidden, false);

  // User activity occurs -> reset timer
  const handled = controller.handleActivity(true);
  assert.equal(handled, true, "Activity reset must be handled");

  // Rapid mousemove 50ms later -> throttled (returns false, avoids churn)
  t.mock.timers.tick(50);
  const rapidHandled = controller.handleActivity(false);
  assert.equal(rapidHandled, false, "Rapid activity within 250ms must be throttled to prevent render churn");

  // Advance 2000ms from the reset (total 4050ms, 2050ms since reset)
  t.mock.timers.tick(2000);
  assert.equal(hidden, false, "HUD must not hide because timer was reset");

  // Advance remaining 500ms
  t.mock.timers.tick(500);
  assert.equal(hidden, true, "HUD must hide after 2500ms has elapsed since the reset");

  controller.dispose();
});

test("JUDGE-F05: HUD autoHide timer is suppressed while hovered, focused, or pinned", (t) => {
  t.mock.timers.enable();

  let hidden = false;
  const controller = new HUDAutoHideController({
    autoHideDelay: 2500,
    onHide: () => {
      hidden = true;
    },
    isVisible: true,
    isHovered: true,
  });

  assert.equal(controller.isTimerActive(), false, "Timer must NOT be active while isHovered is true");
  t.mock.timers.tick(5000);
  assert.equal(hidden, false, "HUD must never auto-hide while hovered");

  // Pointer unhovers -> timer arms
  controller.updateState({ isHovered: false });
  assert.equal(controller.isTimerActive(), true, "Timer must arm after pointer unhovers");
  t.mock.timers.tick(2500);
  assert.equal(hidden, true, "HUD must auto-hide 2500ms after mouse leaves");

  // Re-open and test pinned suppression
  hidden = false;
  controller.updateState({ isVisible: true, isPinned: true });
  assert.equal(controller.isTimerActive(), false, "Timer must NOT be active while isPinned is true");
  t.mock.timers.tick(5000);
  assert.equal(hidden, false, "HUD must never auto-hide while pinned");

  controller.dispose();
});
