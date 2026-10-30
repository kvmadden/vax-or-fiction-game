import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TitleSlide } from "../../src/screens/TitleSlide";
import { InstructionsSlide } from "../../src/screens/InstructionsSlide";
import { EstimateQuestion } from "../../src/screens/questions/EstimateQuestion";
import { vaxOrFictionDeck } from "../../src/data/decks/vax-or-fiction";
import { stagePlateId } from "../../src/design/theme";
import { ScaledStage } from "../../src/components/ScaledStage";
import { computeScale } from "../../src/engine/scaler";

const repoRoot = resolve(import.meta.dirname, "../..");

test("stage glass tokens and last-word backers ship for cards, reveal, and rail", () => {
  const tokens = readFileSync(resolve(repoRoot, "src/design/tokens.css"), "utf8");
  const css = readFileSync(resolve(repoRoot, "src/styles/presentation.css"), "utf8");
  const stage = readFileSync(resolve(repoRoot, "src/styles/question-stage.css"), "utf8");
  assert.match(tokens, /--kit-glass-fill:/);
  assert.match(tokens, /--kit-glass-blur:\s*18px/);
  assert.match(css, /backdrop-filter:\s*blur\(var\(--kit-glass-blur\)\)/);
  assert.match(css, /\.question-explanation-copy/);
  assert.match(css, /\.question-result-card/);
  assert.match(css, /\.status-rail/);
  // The posed stem is bare type. presentation.css no longer paints it.
  assert.doesNotMatch(css, /\.question-stage-copy/);
  assert.match(stage, /question-show-frame--binary \.question-stage-copy[\s\S]*background:\s*transparent/);
  const polish = css.slice(css.lastIndexOf("Live stage polish"));
  assert.doesNotMatch(polish, /question-stage-copy/);
  assert.doesNotMatch(polish, /background-color:\s*var\(--color-backer\)/);
});

test("chevron plates keep crisp clip-path geometry", () => {
  const stage = readFileSync(resolve(repoRoot, "src/styles/question-stage.css"), "utf8");
  assert.doesNotMatch(stage, /\.answer-bar::after\s*\{[^}]*clip-path:\s*none/);
  assert.doesNotMatch(
    stage,
    /:is\(\.answer-bar, \.order-bar\)\s*\{[^}]*clip-path:\s*none/,
  );
  const css = readFileSync(resolve(repoRoot, "src/styles/presentation.css"), "utf8");
  const polish = css.slice(css.lastIndexOf("Live stage polish"));
  assert.match(polish, /question-show-frame--binary \.answer-bar \{[^}]*clip-path:\s*polygon/);
  assert.match(polish, /estimate-answer-rail \.answer-bar::before \{[^}]*clip-path:\s*polygon/);
  // The framed question must not paint a second opaque panel under the stem.
  assert.doesNotMatch(
    polish,
    /question-beat-pane > \[data-screen="question"\][^}]*background(?:-color)?:\s*(?!transparent)/,
  );
  for (const file of [
    "src/screens/questions/BinaryQuestion.tsx",
    "src/screens/questions/EstimateQuestion.tsx",
    "src/screens/questions/MythAmongThree.tsx",
    "src/screens/questions/OrderQuestion.tsx",
    "src/screens/questions/WhichPatientQuestion.tsx",
  ]) {
    const source = readFileSync(resolve(repoRoot, file), "utf8");
    assert.doesNotMatch(source, /data-screen="question"[\s\S]{0,400}backgroundColor:/, `${file} paints a fill on the question root`);
  }
});

test("five estimate options read 2-2-1 off the option grid, not off a rail index", () => {
  const stage = readFileSync(resolve(repoRoot, "src/styles/question-stage.css"), "utf8");
  assert.match(stage, /\.estimate-answer-rail__options \{[^}]*grid-template-columns:\s*repeat\(2,/);
  assert.match(stage, /\.estimate-answer-rail__options:is\(\[data-count='1'\], \[data-count='3'\], \[data-count='5'\]\) > \.answer-slot:last-child/);
  assert.match(stage, /grid-column:\s*1 \/ -1/);
  assert.match(stage, /justify-self:\s*center/);
  assert.match(stage, /width:\s*var\(--stage-range-col\)/);
  // The rail's own first child is its report caption, so any positional selector
  // over the rail counts one too many. The grid that holds only options is the
  // element allowed to carry :last-child.
  assert.doesNotMatch(stage, /\.estimate-answer-rail\b[^{]*:nth-child/);
  const question = vaxOrFictionDeck.questions.find((entry) => entry.id === "q19")!;
  const html = renderToStaticMarkup(React.createElement(EstimateQuestion, { question }));
  assert.match(html, /class="estimate-answer-rail__options" data-count="5"/);
  assert.match(html, /Under 20%/);
  assert.match(html, /Over 65%/);
});

test("Curated 15 title drops the join pill and tagline; instructions drops join", () => {
  const title = renderToStaticMarkup(React.createElement(TitleSlide, { interactive: false }));
  assert.doesNotMatch(title, /Join a game/);
  assert.doesNotMatch(title, /Talk it through/);
  const instructions = renderToStaticMarkup(React.createElement(InstructionsSlide, { interactive: false }));
  assert.doesNotMatch(instructions, /Join a game/);
  assert.match(instructions, /data-beat="instructions"/);
});

test("screen router crossfades instead of sliding chrome offstage", () => {
  const router = readFileSync(resolve(repoRoot, "src/screens/ScreenRouter.tsx"), "utf8");
  const fade = readFileSync(resolve(repoRoot, "src/ui/screen-fade.ts"), "utf8");
  assert.match(router, /mode="sync"/);
  assert.doesNotMatch(router, /mode="wait"/);
  assert.doesNotMatch(router, /x: direction === "forward"/);
  assert.doesNotMatch(router, /y:\s*22/);
  assert.doesNotMatch(router, /y:\s*-12/);
  assert.match(fade, /SCREEN_FADE_S = 0\.26/);
  assert.match(fade, /SCREEN_FADE_EASE = \[0\.4, 0\.0, 0\.2, 1\]/);
  assert.match(router, /from "\.\.\/ui\/screen-fade"/);
  assert.match(router, /duration: SCREEN_FADE_S/);
  assert.doesNotMatch(router, /duration: 0\.2/);
  // One persistent lights+scrim field — sync crossfade must not stack two ShowFrame atmospheres.
  assert.match(router, /className="stage-atmosphere"/);
  assert.match(router, /function atmosphereScrimFor/);
  assert.match(router, /show-scrim--left/);
  assert.match(router, /show-scrim--center/);
  assert.match(router, /data-active=\{atmosphereScrim === "left"/);
  const indexCss = readFileSync(resolve(repoRoot, "src/index.css"), "utf8");
  assert.match(indexCss, /\.stage-atmosphere\s*\{/);
  assert.match(indexCss, /\.stage-atmosphere > \.show-scrim\[data-active="true"\]/);
  assert.match(indexCss, /\.screen-router-root \.show-frame > \.show-lights/);
  assert.match(indexCss, /display:\s*none\s*!important/);
  assert.match(
    indexCss,
    /\.screen-router-viewport:has\(~ \.screen-router-viewport\) \.lobby-footer/,
    'exiting lobby lyric band must hide while title enters',
  );
  assert.match(
    indexCss,
    /\.screen-router-viewport:has\(~ \.screen-router-viewport\) \.title-walkin/,
    'exiting title lyric band must hide when a later viewport is present',
  );
  assert.match(
    indexCss,
    /\.screen-router-viewport:has\(~ \.screen-router-viewport\) \.lobby-footer,\s*\n\.screen-router-viewport:has\(~ \.screen-router-viewport\) \.title-walkin \{\s*\n\s*display:\s*none\s*!important;/,
    'exiting walk-in bands must display:none, not merely fade',
  );
  const presentationSuite = readFileSync(resolve(repoRoot, "src/presentation/PresentationSuite.tsx"), "utf8");
  assert.equal(
    (presentationSuite.match(/<ScaledStage/g) ?? []).length,
    1,
    'one ScaledStage must persist so Preflight↔Lobby can sync-dissolve',
  );
  assert.doesNotMatch(
    presentationSuite,
    /\? <ScaledStage[\s\S]*: <ScaledStage/,
    'setup must not remount ScaledStage on ENTER_LOBBY',
  );
  assert.match(
    presentationSuite,
    /stageInSetupChrome/,
    'setup chrome must lag setup edges through the sync dissolve',
  );
  assert.match(
    presentationSuite,
    /SCREEN_FADE_S/,
    'setup chrome release must match ScreenRouter dissolve duration',
  );
  assert.match(
    presentationSuite,
    /setStageInSetupChrome\(setup\)/,
    'chrome must lag both ENTER_LOBBY and Back — not only leaving setup',
  );
  assert.doesNotMatch(
    presentationSuite,
    /if \(setup\) \{\s*setStageInSetupChrome\(true\)/,
    'Back into setup must not snap chrome before the Lobby exit dissolves',
  );
  assert.match(
    presentationSuite,
    /const stageFormat = stageInSetupChrome \? "widescreen" : displayFormat/,
    'content format must share the lagged chrome clock',
  );
  assert.match(
    presentationSuite,
    /ScreenRouter format=\{stageFormat\}/,
    'ScreenRouter must not take immediate displayFormat under a lagged canvas',
  );
  assert.match(
    presentationSuite,
    /format=\{stageFormat\}/,
  );
  assert.match(
    presentationSuite,
    /useViewportFormat\(format, !stageInSetupChrome\)/,
    'viewport override must wait until setup chrome releases',
  );
  assert.match(
    indexCss,
    /\.screen-router-viewport:has\(~ \.screen-router-viewport ~ \.screen-router-viewport\) \{\s*\n\s*visibility:\s*hidden\s*!important;/,
    'rapid sync advances must prune stale viewports beyond the complementary pair',
  );
  const presentation = readFileSync(resolve(repoRoot, "src/styles/presentation.css"), "utf8");
  assert.match(
    presentation,
    /\.question-beat-pane:has\(~ \.question-beat-pane ~ \.question-beat-pane\) \{\s*\n\s*visibility:\s*hidden\s*!important;/,
    'rapid beat dissolves must prune stale panes beyond the complementary pair',
  );
  const question = readFileSync(resolve(repoRoot, "src/screens/Question.tsx"), "utf8");
  assert.match(question, /question-beat-stack/);
  assert.match(question, /from "\.\.\/ui\/screen-fade"/);
  assert.match(question, /duration: reducedMotion \? 0 : SCREEN_FADE_S/);
  assert.match(question, /ease: SCREEN_FADE_EASE/);
  assert.doesNotMatch(question, /0\.32/);
  assert.doesNotMatch(question, /\[0\.16, 1, 0\.3, 1\]/);
  assert.doesNotMatch(question, /y: 16/);
  const lobby = readFileSync(resolve(repoRoot, "src/screens/Lobby.tsx"), "utf8");
  // ScreenRouter owns the dissolve — Lobby must not nest a second opacity mount fade.
  assert.doesNotMatch(lobby, /lobby-stage[\s\S]*?opacity:\s*0/);
  assert.match(lobby, /className="lobby-stage"/);
  const showdown = readFileSync(resolve(repoRoot, "src/screens/Showdown.tsx"), "utf8");
  assert.match(showdown, /from ['\"]\.\.\/ui\/screen-fade['\"]/);
  assert.doesNotMatch(showdown, /y:\s*12/);
  assert.match(showdown, /ease: SCREEN_FADE_EASE/);
  // Facilitator HUD must dissolve with the same opacity primitive — a y-slide
  // on the control strip fights the stage crossfade when the host advances.
  const hud = readFileSync(resolve(repoRoot, "src/facilitator/HUD.tsx"), "utf8");
  assert.match(hud, /from ["']\.\.\/ui\/screen-fade["']/);
  assert.match(hud, /duration: SCREEN_FADE_S/);
  assert.match(hud, /ease: SCREEN_FADE_EASE/);
  assert.doesNotMatch(hud, /y:\s*56/);
  assert.doesNotMatch(hud, /y:\s*40/);
  assert.doesNotMatch(hud, /\[0\.16, 1, 0\.3, 1\]/);
  // Phone announcer + join errors share the same opacity dissolve — no y-slide chrome.
  const phoneLayout = readFileSync(resolve(repoRoot, "src/phone/PhoneLayout.tsx"), "utf8");
  assert.match(phoneLayout, /from ["']\.\.\/ui\/screen-fade["']/);
  assert.doesNotMatch(phoneLayout, /y:\s*-16/);
  const phoneJoin = readFileSync(resolve(repoRoot, "src/phone/PhoneJoin.tsx"), "utf8");
  assert.match(phoneJoin, /from ["']\.\.\/ui\/screen-fade["']/);
  assert.doesNotMatch(phoneJoin, /y:\s*-8/);
  // Facilitator modals share the same opacity dissolve — no y-slide / scale snap.
  const restartModal = readFileSync(resolve(repoRoot, "src/components/RestartRunModal.tsx"), "utf8");
  assert.match(restartModal, /from ["']\.\.\/ui\/screen-fade["']/);
  assert.match(restartModal, /duration: shouldReduceMotion \? 0 : SCREEN_FADE_S/);
  assert.doesNotMatch(restartModal, /y:\s*12/);
  assert.doesNotMatch(restartModal, /\[0\.16, 1, 0\.3, 1\]/);
  const keyboardHelp = readFileSync(resolve(repoRoot, "src/facilitator/Keyboard.tsx"), "utf8");
  assert.match(keyboardHelp, /from ["']\.\.\/ui\/screen-fade["']/);
  assert.match(keyboardHelp, /duration: shouldReduceMotion \? 0 : SCREEN_FADE_S/);
  assert.doesNotMatch(keyboardHelp, /y:\s*12/);
  assert.doesNotMatch(keyboardHelp, /\[0\.16, 1, 0\.3, 1\]/);
  // Kind roots sit inside the beat-pane dissolve — mount slides must not compound it.
  for (const file of [
    "src/screens/questions/BinaryQuestion.tsx",
    "src/screens/questions/MythAmongThree.tsx",
    "src/screens/questions/OrderQuestion.tsx",
  ]) {
    const source = readFileSync(resolve(repoRoot, file), "utf8");
    assert.match(source, /initial=\{false\}/, `${file} must skip mount entrance under the beat fade`);
    assert.doesNotMatch(source, /hidden:\s*\{\s*opacity:\s*0,\s*y:/, `${file} must not slide on the y axis`);
    assert.doesNotMatch(source, /hidden:\s*\{\s*opacity:\s*0,\s*x:/, `${file} must not slide on the x axis`);
  }
  // Kind roots must not stack a private wash over the router's stage-atmosphere lights.
  for (const file of [
    "src/screens/questions/BinaryQuestion.tsx",
    "src/screens/questions/MythAmongThree.tsx",
    "src/screens/questions/EstimateQuestion.tsx",
    "src/screens/questions/OrderQuestion.tsx",
    "src/screens/questions/WhichPatientQuestion.tsx",
  ]) {
    const source = readFileSync(resolve(repoRoot, file), "utf8");
    assert.doesNotMatch(source, /radial-gradient/, `${file} must not paint a private atmosphere wash`);
    assert.doesNotMatch(source, /Background ambient/, `${file} must not declare a private ambient layer`);
  }
  const stageCss = readFileSync(resolve(repoRoot, "src/styles/question-stage.css"), "utf8");
  assert.doesNotMatch(stageCss, /\.order-question-wash/);
});

// TW9: the previous version of this test matched the exact literal source text of one specific
// technique (a lazy useState initializer calling computeScale in that precise shape), so a
// harmless rewrite of the same behavior would fail it even though nothing was wrong. The render
// is checked instead for the actual claim ("computes its scale before first paint, not after"): a
// bare `useState(1)` paints one frame at scale 1, then a resize effect corrects it after mount,
// a measured 0.125 layout shift. `window` is polyfilled here so the component takes its real
// (non-SSR-fallback) branch, and the very first render's own transform is compared against
// computeScale's real answer for that size, whatever hook or expression produced it.
test("MOT-VQA-03: ScaledStage's very first render already carries the real scale, not a hardcoded 1 corrected after mount", () => {
  const priorWindow = (globalThis as any).window;
  (globalThis as any).window = { innerWidth: 1920, innerHeight: 1080 };
  let html: string;
  try {
    html = renderToStaticMarkup(React.createElement(ScaledStage, { format: "widescreen" }, React.createElement("p", null, "content")));
  } finally {
    if (priorWindow === undefined) delete (globalThis as any).window;
    else (globalThis as any).window = priorWindow;
  }
  const expectedScale = computeScale(1920, 1080, "widescreen");
  assert.notEqual(expectedScale, 1, "fixture assumption: 1920x1080 against the widescreen format is not coincidentally scale 1");
  const scaleMatch = html.match(/transform:scale\(([\d.]+)\)/);
  assert.ok(scaleMatch, `the scaled content must render an inline transform:scale(...): ${html.slice(0, 400)}`);
  assert.ok(
    Math.abs(Number.parseFloat(scaleMatch![1]) - expectedScale) < 0.001,
    `the very first render must already use computeScale's real answer (${expectedScale}), not a placeholder that a later effect corrects: got ${scaleMatch![1]}`,
  );
});

test("MOT-VQA-03: ScaledStage's resize handler runs before paint, not after", () => {
  const source = readFileSync(resolve(repoRoot, "src/components/ScaledStage.tsx"), "utf8");
  // useEffect runs after the browser paints, and useLayoutEffect runs before. This is a real,
  // hook-specific timing guarantee React provides through exactly one API (useInsertionEffect is
  // the only other pre-paint hook, and is for CSS-in-JS style injection, not layout), not one
  // implementation choice among equally valid alternatives, so pinning the hook name here is
  // justified rather than brittle.
  assert.match(source, /useLayoutEffect\(/, "the resize handler must run before paint, not after");
  assert.doesNotMatch(
    source,
    /useEffect\(\s*\(\)\s*=>\s*\{\s*const handleResize/,
    "the resize handler must not be registered through useEffect",
  );
  assert.match(source, /import React, \{[^}]*useLayoutEffect/, "useLayoutEffect must be imported");
});

test("stagePlateId stays null so soft IMZ cannot return as stage art", () => {
  assert.equal(stagePlateId(undefined, "deliberating", 0), null);
  assert.equal(stagePlateId(undefined, "deliberating", 1), null);
  assert.equal(stagePlateId("plate-q02", "deliberating", 2), null);
  const presentation = readFileSync(resolve(repoRoot, "src/styles/presentation.css"), "utf8");
  assert.doesNotMatch(presentation, /\.show-plate-stack/);
  assert.doesNotMatch(presentation, /stage-plate-in/);
  assert.doesNotMatch(presentation, /show-plate--outgoing/);
  const tokens = readFileSync(resolve(repoRoot, "src/styles/tokens.css"), "utf8");
  assert.match(tokens, /--ease-screen-fade:\s*cubic-bezier\(0\.4,\s*0\.0,\s*0\.2,\s*1\)/);
  const questionStage = readFileSync(resolve(repoRoot, "src/styles/question-stage.css"), "utf8");
  assert.match(questionStage, /transition:\s*opacity[^;]*--ease-screen-fade/);
  assert.doesNotMatch(
    questionStage,
    /transition:\s*opacity[^;]*--ease-standard/,
    'show-frame opacity must not use ease-standard (late snap)',
  );
  const leaderboard = readFileSync(resolve(repoRoot, "src/styles/leaderboard.css"), "utf8");
  assert.doesNotMatch(leaderboard, /score-board-enter/);
  assert.doesNotMatch(
    leaderboard,
    /\.score-board__lane\s*\{[^}]*animation:/,
    'standings lanes must not nest an opacity enter under ScreenRouter dissolve',
  );
  assert.doesNotMatch(leaderboard, /translateY\(36px\)/);
  const indexCss = readFileSync(resolve(repoRoot, "src/index.css"), "utf8");
  assert.match(
    indexCss,
    /\.screen-router-viewport\s*\{[^}]*transition-property:\s*opacity\s*!important/,
    'Framer opacity dissolves must not leave transition:all on viewports',
  );
  assert.match(
    presentation,
    /\.question-beat-pane\s*\{[^}]*transition-property:\s*opacity\s*!important/,
  );
  for (const file of [
    "src/screens/questions/WhichPatientQuestion.tsx",
    "src/screens/questions/MythAmongThree.tsx",
    "src/screens/questions/EstimateQuestion.tsx",
    "src/screens/questions/BinaryQuestion.tsx",
  ]) {
    const source = readFileSync(resolve(repoRoot, file), "utf8");
    assert.doesNotMatch(
      source,
      /transition:\s*(?:shouldReduceMotion\s*\?\s*[^:]+:\s*)?["']all\b/,
      `${file} must not use transition:all — name the properties that change`,
    );
  }
});
