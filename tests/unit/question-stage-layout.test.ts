import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { OrderQuestion } from "../../src/screens/questions/OrderQuestion";
import { QUESTION_KINDS } from "../../src/engine/kinds";
import { vaxOrFictionDeck } from "../../src/data/decks/vax-or-fiction";

const repoRoot = resolve(import.meta.dirname, "../..");
const read = (file: string) => readFileSync(resolve(repoRoot, file), "utf8");

const STAGE = "src/styles/question-stage.css";
/** Every stylesheet that used to place the stem or a rail and no longer may. */
const FORMER_OWNERS = [
  "src/styles/presentation.css",
  "src/styles/question-flow.css",
  "src/styles/editorial-cards.css",
  "src/styles/question-chrome.css",
  "src/styles/opening-stage.css",
];
const STAGE_ELEMENTS = [
  "question-stage-copy",
  "question-stage-scenario",
  "answer-rail",
  "estimate-answer-rail",
  "order-rail",
];

/** Split a selector list on the commas that separate whole selectors. */
function selectorList(selector: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const character of selector) {
    if (character === "(" || character === "[") depth += 1;
    else if (character === ")" || character === "]") depth -= 1;
    if (character === "," && depth === 0) {
      parts.push(current);
      current = "";
    } else current += character;
  }
  parts.push(current);
  return parts.map((part) => part.trim()).filter(Boolean);
}

/**
 * Declaration blocks that target a posed-stage element itself rather than
 * something inside one: the subject of the selector is the stem, the scenario
 * or a rail. Rules about a bar or a label inside a rail are not placement.
 */
function stageBlocks(css: string): { selector: string; body: string }[] {
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .map((match) => ({ selector: match[1]!.trim(), body: match[2]! }))
    .filter((block) => selectorList(block.selector).some((one) => {
      const subject = one.split(/\s+|(?=>)/).filter(Boolean).at(-1) ?? "";
      return STAGE_ELEMENTS.some((name) => subject.includes(name));
    }));
}

test("the posed order rail is scrambled and unnumbered", () => {
  const question = vaxOrFictionDeck.questions.find((entry) => entry.kind === "order")!;
  const html = renderToStaticMarkup(
    React.createElement(OrderQuestion, { question, showControls: false }),
  );
  assert.match(html, /data-role="order-scramble-cue"/);
  assert.match(html, /Scrambled\. Put these in order on your device\./);
  const badges = [...html.matchAll(/font-mono font-bold[^>]*>([^<]+)</g)].map((match) => match[1]);
  assert.deepEqual(badges, [], "posed order rows do not wear 1..N as if they were already ranked");
  // 8.6: orderDisplay (the old, id-seeded and wire-recoverable shuffle) is retired. With no
  // displayOrder prop, OrderQuestion draws its own fresh random scramble (randomOrderScramble),
  // which by construction never lands on the authored order -- checked here against the actual
  // rendered rail, not a second computation.
  const renderedTexts = [...html.matchAll(/class="order-bar__label"[^>]*>([^<]*)</g)].map((match) => match[1]);
  assert.deepEqual(new Set(renderedTexts), new Set(question.steps), "every step's text renders exactly once");
  assert.notDeepEqual(renderedTexts, question.steps, "the rendered rail is genuinely scrambled, not the authored order");
  const source = read("src/screens/questions/OrderQuestion.tsx");
  assert.doesNotMatch(source, /displayKey: String\(index \+ 1\)/);
  assert.doesNotMatch(source, /displayKey: token\.toUpperCase\(\)/);
});

test("presentation.css is a thin kernel under 1000 lines", () => {
  const lines = read("src/styles/presentation.css").split("\n").length;
  assert.ok(lines <= 1000, `presentation.css is ${lines} lines; extract the next owner instead of growing the dump`);
});

test("question-stage.css is the last stylesheet the app loads", () => {
  const app = read("src/App.tsx");
  const imports = [...app.matchAll(/^import '(\.\/styles\/[^']+)';/gm)].map((match) => match[1]);
  assert.ok(imports.length > 1, "App.tsx imports the show stylesheets");
  assert.equal(imports.at(-1), "./styles/question-stage.css");
});

test("only question-stage.css flattens the myth split and the order list", () => {
  const stage = read(STAGE);
  assert.match(stage, /\.myth-main-split\s*\{[^}]*display:\s*contents/);
  assert.match(stage, /\.order-question-container > main\s*\{[^}]*display:\s*contents/);
  for (const file of FORMER_OWNERS) {
    const css = read(file);
    assert.doesNotMatch(
      css,
      /\.myth-main-split[^{]*\{[^}]*display\s*:/,
      `${file} still sets display on the myth split`,
    );
    assert.doesNotMatch(
      css,
      /\.order-question-container > main[^{]*\{[^}]*display\s*:/,
      `${file} still sets display on the order list`,
    );
  }
});

test("only question-stage.css places the stem panel and the answer rails", () => {
  for (const file of FORMER_OWNERS) {
    for (const block of stageBlocks(read(file))) {
      assert.doesNotMatch(
        block.body,
        /(^|[;\s])(position|top|right|bottom|left|inset|transform|translate|order|grid-template)\s*:/,
        `${file} positions a posed-stage element (${block.selector.slice(0, 120)}); `
          + "geometry for the stem and the rails belongs to question-stage.css only",
      );
    }
  }
});

test("no stylesheet re-centres an answer rail off its own canvas", () => {
  // A live-show hotfix centred the rails with left:50% + translateX(-50%). The
  // frame's `inset: auto` beat the offset but not the translate, so every rail
  // slid half its width off the left edge: binary lost a verdict, which-patient
  // lost A and C. Nothing may reintroduce a self-relative shift on a rail.
  for (const file of [STAGE, ...FORMER_OWNERS]) {
    const css = read(file);
    for (const block of stageBlocks(css)) {
      assert.doesNotMatch(block.body, /translateX\(\s*-?50%/, `${file}: ${block.selector.slice(0, 120)}`);
    }
  }
});

test("the stage owner gives every question kind exactly one rail track", () => {
  const stage = read(STAGE);
  const railSelector: Record<string, string> = {
    binary: "--binary .answer-rail",
    "myth-among-three": "--myth-among-three .answer-rail",
    "which-patient": "--which-patient .answer-rail",
    order: "--order .order-rail",
    estimate: "--estimate .estimate-answer-rail__options",
  };
  for (const kind of QUESTION_KINDS) {
    const selector = railSelector[kind]!;
    const tracks = stageBlocks(stage).filter(
      (block) => block.selector.trimEnd().endsWith(selector) && /display\s*:\s*(grid|flex)/.test(block.body),
    );
    assert.equal(tracks.length, 1, `${kind} must have one owner for its rail track, found ${tracks.length}`);
  }
});

test("the question beats do not clip the stage they hold", () => {
  const css = read("src/styles/presentation.css");
  for (const selector of [".question-beat-stack", ".question-beat-pane"]) {
    const block = stageOrOwn(css, selector);
    assert.match(block, /overflow:\s*visible/, `${selector} must not clip authored clinical copy`);
  }
  assert.doesNotMatch(
    css,
    /question-beat-pane > \[data-screen="question"\][^}]*overflow:\s*hidden/,
    "the mounted question surface must not clip",
  );
});

function stageOrOwn(css: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(`(^|\\n)${escaped}\\s*\\{([^}]*)\\}`));
  assert.ok(match, `${selector} is declared in presentation.css`);
  return match![2]!;
}

test("myth-among-three stem joins binary, estimate, and order in the transparent bare-type stem override", () => {
  const stage = read(STAGE);
  const block = stage.match(
    /body \.question-shell \.question-show-frame\.question-show-frame--[\s\S]*?\{([^}]*)\}/,
  );
  assert.ok(block, "found stem transparent override block in question-stage.css");
  assert.match(block[0], /\.question-show-frame--binary \.question-stage-copy/);
  assert.match(block[0], /\.question-show-frame--estimate \.question-stage-copy/);
  assert.match(block[0], /\.question-show-frame--order \.question-stage-copy/);
  assert.match(block[0], /\.question-show-frame--myth-among-three \.question-stage-copy/);
  assert.match(block[0], /\.question-show-frame--which-patient \.question-stage-copy/);
  assert.match(block[1], /background:\s*transparent/);
  assert.match(block[1], /border:\s*0/);
  assert.match(block[1], /box-shadow:\s*none/);
  assert.match(block[1], /backdrop-filter:\s*none/);
  assert.doesNotMatch(block[1], /!important/);
});

// STAGE-SPEC step 8 (spec section 5.5, the design call): 3 and 4 choices used to fall back to a
// single-column rail on every format, the bug the spec exists to fix. This test is updated
// deliberately, not re-blessed blind, to assert the spec's actual rule: a real 2x2 grid on wide
// and square (the base .answer-rail rule, no longer overridden down to one column by count), the
// 3-answer case's third card centered at its peers' own width (section 2.2's one sanctioned edge-
// rule exception), and portrait staying the one column it already was.
test("which-patient keeps its 2x2 grid at 3 and 4 choices on wide and square, with the third card centered at 3", () => {
  const stage = read(STAGE);
  const baseRail = stage.match(/\.question-show-frame--which-patient \.answer-rail \{([^}]*)\}/);
  assert.ok(baseRail, "found the base which-patient answer-rail rule in question-stage.css");
  assert.match(baseRail[1], /grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.doesNotMatch(
    stage,
    /\.question-show-frame--which-patient\s+\.answer-rail(?:\[data-count=['"]?[34]['"]?\]|:is\([^)]*data-count=['"]?[34]['"]?[^)]*\))[\s\S]{0,200}?grid-template-columns:\s*minmax\(0,\s*1fr\)/,
    "3 and 4 choices no longer force the single-column fallback on wide/square",
  );

  const centeredThird = stage.match(
    /\.question-show-frame--which-patient\s+\.answer-rail\[data-count=['"]?3['"]?\]\s+\.answer-slot\[data-slot=['"]?c['"]?\][\s\S]*?\{([^}]*)\}/,
  );
  assert.ok(centeredThird, "found the centered-third-card rule for which-patient's 3-answer grid");
  assert.match(centeredThird[1], /grid-column:\s*1\s*\/\s*-1/);
  assert.match(centeredThird[1], /justify-self:\s*center/);

  // STAGE-SPEC pass 4b fix: the previous pattern searched an unbounded `[\s\S]*?` from the first
  // `[data-format='portrait']` substring anywhere in the file to the first `:is(.answer-rail,` it
  // could find anywhere after, so any new rule landing in between (pass 4b's own F1 fix adds one,
  // a `:not([data-format='portrait'])` below-tally centering block that also happens to contain
  // `:is(.answer-rail,`) hijacked the match before it ever reached portrait's own real single-
  // column override. Tightened to the known real selector shape: the format attribute directly
  // followed by `.question-show-frame` and then the `:is(.answer-rail, ...)` group, with nothing
  // else allowed to sit between them.
  const portraitOverride = stage.match(
    /\[data-format=['"]?portrait['"]?\]\s+\.question-show-frame\s+:is\(\.answer-rail,[^)]*\)\s*\{([^}]*)\}/,
  );
  assert.ok(portraitOverride, "found portrait's single-column override for every rail");
  assert.match(portraitOverride[1], /grid-template-columns:\s*minmax\(0,\s*1fr\)/);
});

// STAGE-SPEC step 6 (spec section 3.5): the tally zone is now reserved by play mode (a data-tally
// attribute on the rail), not by beat, so W1/W2/STAT-SLOT-ENGINES's 0fr-to-1fr slot-width
// animation (asserted here before the rebuild) is retired by name in the spec: "The 0fr to 1fr
// slot animation ... is retired. The numbers fade in inside a fixed box instead." These two tests
// are updated deliberately, not re-blessed blind, to assert the new mechanism: a data-tally rail
// reserves a fixed --stage-tally-w column from the posed beat on (so the label never rewraps
// between posed and locked, W2's real defect, still fixed), and the numbers fade their opacity
// into that fixed box instead of the box's own width animating.
test("W2 (MOT-VQA-08 regression, superseded by STAGE-SPEC 3.5): the stat slot collapses while empty and reserves no width in hands-up play (data-tally='none')", () => {
  const stage = read(STAGE);
  const pollRuleStart = stage.indexOf(".answer-bar__poll {");
  assert.ok(pollRuleStart > -1, "the base .answer-bar__poll rule must exist");
  const pollRule = stage.slice(pollRuleStart, stage.indexOf("}", pollRuleStart));
  // MOT-VQA-08's always-reserve fix narrowed every which-patient/myth reply card, even in Offline
  // where stats never show. The base rule reserves nothing (min-width: 0); only a rail carrying
  // data-tally="beside" reserves the fixed --stage-tally-w column (below), so hands-up/offline
  // cards keep the W2 fix (no dead width) while polling cards get a stable reserved zone instead.
  assert.match(pollRule, /min-width:\s*0/, "the base stat slot reserves no width; only data-tally='beside' does");
  assert.match(
    stage,
    /\.answer-bar__poll:empty\s*\{\s*display:\s*none;\s*\}/,
    "the stat slot must collapse to display:none when empty",
  );
  // The beside zone is positioned absolutely, anchored from the card's real edges (a scoped
  // sweep found that a flex sibling here sat inside the label's own already-end-padded content
  // box, short of the card's true end, instead of in the zone that padding reserved for it), so
  // this only checks the reservation width is present, not the whole declaration block.
  const besideRuleStart = stage.indexOf("[data-tally='beside'] .answer-bar__poll {");
  assert.ok(besideRuleStart > -1, "the data-tally='beside' .answer-bar__poll rule must exist");
  const besideRule = stage.slice(besideRuleStart, stage.indexOf("}", besideRuleStart));
  assert.match(besideRule, /min-width:\s*var\(--stage-tally-w\)/, "a polling rail reserves the fixed tally-width column from the posed beat on, so the label never rewraps at lock");
  assert.match(besideRule, /position:\s*absolute/, "the zone is anchored from the card's own edges, independent of the label's flex flow");
  assert.match(
    stage,
    /\[data-tally='hidden'\]\s*\.answer-bar__poll\s*\{\s*display:\s*none;\s*\}/,
    "which-patient's 3/4-answer portrait ruling hides the tally zone outright",
  );
});

test("STAGE-SPEC 3.5: the fill-in is an opacity fade inside a fixed box, not a width animation, and does not use the late-snap ease-standard curve", () => {
  const stage = read(STAGE);
  const pollRuleStart = stage.indexOf(".answer-bar__poll {");
  assert.ok(pollRuleStart > -1, "the base .answer-bar__poll rule must exist");
  const pollRule = stage.slice(pollRuleStart, stage.indexOf("}", pollRuleStart));
  assert.doesNotMatch(pollRule, /interpolate-size:\s*allow-keywords/, "the fill-in must not depend on interpolate-size, which only Chromium supports");
  assert.match(pollRule, /display:\s*grid/, "the slot stays a grid so the figures stack, right-aligned and vertically centered");
  assert.match(pollRule, /opacity:\s*0/, "the slot starts invisible and fades in, rather than animating its own box size");
  assert.match(pollRule, /transition:\s*opacity[^;]*--ease-screen-fade/, "the fade uses the same screen-fade curve as the rest of the stage, not the late-snap ease-standard curve");
  assert.doesNotMatch(pollRule, /--ease-standard/, "must not use the late-snap ease-standard curve for this fade");
});

test("LOOK-1 (FAC-08, design call: Make it bigger): the explanation screen's statement steps up from the base 28px, clearing the 26px audience floor with room to spare, and keeps its muted color", () => {
  const flow = read("src/styles/question-flow.css");
  const ruleStart = flow.indexOf(".question-flow .question-beat-context {");
  assert.ok(ruleStart > -1, "the base .question-beat-context rule must exist");
  const rule = flow.slice(ruleStart, flow.indexOf("}", ruleStart));
  assert.match(rule, /color:\s*var\(--color-ink-muted\)/, "placement and muted color are unchanged, only the size steps up");
  const sizeMatch = rule.match(/font-size:\s*(\d+)px/);
  assert.ok(sizeMatch, "the rule must declare an explicit font-size");
  const size = Number(sizeMatch![1]);
  assert.ok(size > 28, `must be bigger than the prior 28px, got ${size}px`);
  assert.ok(size >= 26 + 4, `must clear the 26px audience floor with room to spare, got ${size}px`);
  // Stays clearly subordinate to the gold rule headline (question-explanation-copy h2, 56px).
  const headlineMatch = flow.match(/\.question-explanation-copy h2\s*\{[^}]*font-size:\s*(\d+)px/);
  assert.ok(headlineMatch, "the gold rule headline's rule must exist for comparison");
  assert.ok(size < Number(headlineMatch![1]), `must stay smaller than the gold rule headline (${headlineMatch![1]}px), got ${size}px`);
});

test("PORTRAIT (round 5, design call: Portrait keeps the old size): the portrait explanation-screen statement never follows LOOK-1/LOOK-1b's widescreen and square bump", () => {
  const flow = read("src/styles/question-flow.css");
  const baseStart = flow.indexOf(".question-flow .question-beat-context {");
  assert.ok(baseStart > -1, "the base .question-beat-context rule must exist");
  const baseSize = Number(flow.slice(baseStart, flow.indexOf("}", baseStart)).match(/font-size:\s*(\d+)px/)?.[1]);
  assert.ok(baseSize > 0, "the base rule must declare an explicit font-size");
  const portraitStart = flow.indexOf(".question-flow[data-format='portrait'] .question-beat-context {");
  assert.ok(portraitStart > -1, "a portrait-specific .question-beat-context override must exist");
  const portraitRule = flow.slice(portraitStart, flow.indexOf("}", portraitStart));
  const portraitSizeMatch = portraitRule.match(/font-size:\s*(\d+)px/);
  assert.ok(portraitSizeMatch, "the portrait override must declare an explicit font-size");
  const portraitSize = Number(portraitSizeMatch![1]);
  // The literal ruling: portrait must stay at its own pre-LOOK-1 size, never the widescreen and
  // square LOOK-1b size (36px) or anything past LOOK-1's own 32px step.
  assert.ok(portraitSize <= 28, `portrait must keep the size from before LOOK-1 (at most 28px), got ${portraitSize}px`);
  assert.ok(portraitSize < baseSize, `portrait must stay clearly under the widescreen and square size (${baseSize}px), got ${portraitSize}px`);
});

test("LOOK-1b (round 4, design call: One more step): the explanation screen's statement steps up again past LOOK-1's 32px, rendering about 36 to 44px at 1920x1080 (a 1.2x stage scale), keeping its placement and muted color and staying below the gold rule headline", () => {
  const flow = read("src/styles/question-flow.css");
  const ruleStart = flow.indexOf(".question-flow .question-beat-context {");
  assert.ok(ruleStart > -1, "the base .question-beat-context rule must exist");
  const rule = flow.slice(ruleStart, flow.indexOf("}", ruleStart));
  assert.match(rule, /color:\s*var\(--color-ink-muted\)/, "placement and muted color are unchanged, only the size steps up again");
  const sizeMatch = rule.match(/font-size:\s*(\d+)px/);
  assert.ok(sizeMatch, "the rule must declare an explicit font-size");
  const size = Number(sizeMatch![1]);
  assert.ok(size > 32, `must be one more step bigger than LOOK-1's 32px, got ${size}px`);
  // The widescreen canvas (1600x900) scales by 1.2x at a 1920x1080 viewport (computeScale).
  const renderedAt1080p = size * 1.2;
  assert.ok(
    renderedAt1080p >= 36 && renderedAt1080p <= 44,
    `must render about 36 to 44px at 1920x1080, got ${renderedAt1080p}px from a declared ${size}px`,
  );
  // Stays clearly subordinate to the gold rule headline (question-explanation-copy h2, 56px).
  const headlineMatch = flow.match(/\.question-explanation-copy h2\s*\{[^}]*font-size:\s*(\d+)px/);
  assert.ok(headlineMatch, "the gold rule headline's rule must exist for comparison");
  assert.ok(size < Number(headlineMatch![1]), `must stay smaller than the gold rule headline (${headlineMatch![1]}px), got ${size}px`);
});
