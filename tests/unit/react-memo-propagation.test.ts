import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { register } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../");

// TW-2: register the framer-motion stub loader once, before any dynamic import of a component
// that imports 'framer-motion'. Node's default --test-isolation is "process" (one child process
// per test file), so this affects only this file's own module graph, not the other unit test
// files npm test also runs.
register("./support/stub-framer-motion-loader.mjs", import.meta.url);

// ==============================================================================
// Task 5.3 / Defect TYPE-04: React.memo Propagation across Presentation Components
// ==============================================================================

const TARGET_FILES = [
  "src/components/RestartRunModal.tsx",
  "src/components/ScaledStage.tsx",
  "src/components/show/ScoreBoard.tsx",
  "src/screens/TitleSlide.tsx",
  "src/screens/InstructionsSlide.tsx",
  "src/screens/QuestionShell.tsx",
  "src/screens/questions/BinaryQuestion.tsx",
  "src/screens/questions/EstimateQuestion.tsx",
  "src/screens/questions/MythAmongThree.tsx",
  "src/screens/questions/OrderQuestion.tsx",
  "src/screens/questions/WhichPatientQuestion.tsx",
  "src/screens/Lobby.tsx",
  "src/screens/Preflight.tsx",
  "src/screens/Question.tsx",
  "src/screens/Showdown.tsx",
  "src/screens/Leaderboard.tsx",
  "src/screens/Closing.tsx",
  "src/screens/ScreenRouter.tsx",
  "src/phone/PhoneLayout.tsx",
  "src/phone/PhoneJoin.tsx",
  "src/phone/PhoneVote.tsx",
  "src/phone/PhoneReveal.tsx",
  "src/phone/PhoneClosing.tsx",
  "src/facilitator/HUD.tsx"
];

test("TYPE-04 / Static Analysis: Presentation and slide components wrap components in React.memo", () => {
  const missingMemo: string[] = [];

  for (const relFile of TARGET_FILES) {
    const fullPath = path.join(repoRoot, relFile);
    const content = fs.readFileSync(fullPath, "utf8");

    // Must contain React.memo or memo( call (excluding imports and useMemo)
    const lines = content.split("\n");
    const hasMemo = lines.some(line => {
      if (line.includes("import") || line.includes("useMemo")) return false;
      return /\bReact\.memo\b|\bmemo\s*\(/.test(line);
    });

    if (!hasMemo) {
      missingMemo.push(relFile);
    }
  }

  assert.equal(
    missingMemo.length,
    0,
    `The following presentation files are missing React.memo optimization:\n${missingMemo.join("\n")}`
  );
});

test("TYPE-04 / Runtime Check: Target components have React.memo symbol ($$typeof === Symbol.for('react.memo'))", async () => {
  const MEMO_SYMBOL = Symbol.for("react.memo");

  // Dynamic imports of components
  const { RestartRunModal } = await import("../../src/components/RestartRunModal.js");
  const { ScaledStage } = await import("../../src/components/ScaledStage.js");
  const { ScoreBoard } = await import("../../src/components/show/ScoreBoard.js");
  const { TitleSlide, Wordmark } = await import("../../src/screens/TitleSlide.js");
  const { InstructionsSlide } = await import("../../src/screens/InstructionsSlide.js");
  const { QuestionShell } = await import("../../src/screens/QuestionShell.js");
  const { BinaryQuestion } = await import("../../src/screens/questions/BinaryQuestion.js");
  const { EstimateQuestion } = await import("../../src/screens/questions/EstimateQuestion.js");
  const { MythAmongThree } = await import("../../src/screens/questions/MythAmongThree.js");
  const { OrderQuestion } = await import("../../src/screens/questions/OrderQuestion.js");
  const { WhichPatientQuestion } = await import("../../src/screens/questions/WhichPatientQuestion.js");
  const { Lobby, QrCode } = await import("../../src/screens/Lobby.js");
  const { Preflight } = await import("../../src/screens/Preflight.js");
  const { Question } = await import("../../src/screens/Question.js");
  const { Showdown } = await import("../../src/screens/Showdown.js");
  const { Leaderboard } = await import("../../src/screens/Leaderboard.js");
  const { Closing } = await import("../../src/screens/Closing.js");
  const { ScreenRouter } = await import("../../src/screens/ScreenRouter.js");
  const { PhoneLayout } = await import("../../src/phone/PhoneLayout.js");
  const { PhoneJoin } = await import("../../src/phone/PhoneJoin.js");
  const { PhoneVote } = await import("../../src/phone/PhoneVote.js");
  const { PhoneReveal } = await import("../../src/phone/PhoneReveal.js");
  const { PhoneClosing } = await import("../../src/phone/PhoneClosing.js");
  const { HUDMemo } = await import("../../src/facilitator/HUD.js");

  const componentsToCheck = [
    { name: "RestartRunModal", component: RestartRunModal },
    { name: "ScaledStage", component: ScaledStage },
    { name: "ScoreBoard", component: ScoreBoard },
    { name: "TitleSlide", component: TitleSlide },
    { name: "Wordmark", component: Wordmark },
    { name: "InstructionsSlide", component: InstructionsSlide },
    { name: "QuestionShell", component: QuestionShell },
    { name: "BinaryQuestion", component: BinaryQuestion },
    { name: "EstimateQuestion", component: EstimateQuestion },
    { name: "MythAmongThree", component: MythAmongThree },
    { name: "OrderQuestion", component: OrderQuestion },
    { name: "WhichPatientQuestion", component: WhichPatientQuestion },
    { name: "Lobby", component: Lobby },
    { name: "QrCode", component: QrCode },
    { name: "Preflight", component: Preflight },
    { name: "Question", component: Question },
    { name: "Showdown", component: Showdown },
    { name: "Leaderboard", component: Leaderboard },
    { name: "Closing", component: Closing },
    { name: "ScreenRouter", component: ScreenRouter },
    { name: "PhoneLayout", component: PhoneLayout },
    { name: "PhoneJoin", component: PhoneJoin },
    { name: "PhoneVote", component: PhoneVote },
    { name: "PhoneReveal", component: PhoneReveal },
    { name: "PhoneClosing", component: PhoneClosing },
    { name: "HUDMemo", component: HUDMemo }
  ];

  for (const { name, component } of componentsToCheck) {
    assert.ok(component, name + " must be defined");
    const compAny = component;
    assert.equal(
      compAny["$$typeof"],
      MEMO_SYMBOL,
      "Expected component " + name + " to be wrapped in React.memo ($$typeof === Symbol.for('react.memo'))"
    );
  }
});

// ==============================================================================
// MOT-VQA-05: inline Framer Motion variants/transition objects must not be
// reallocated fresh on every render. React.memo on the component export (above)
// does not help here, since these are new object literals created inside the
// render body itself, defeating Framer Motion's own prop-equality checks.
// ==============================================================================

// TW9: the previous version of both tests below required one specific hoisting technique
// (useMemo) by matching its exact literal source text, so the objectively better fix for
// MythAmongThree (hoisting the per-item variants to a module-level constant, computed once ever
// instead of once per component instance) would fail a test meant to catch reallocation, not to
// mandate useMemo specifically. Checked structurally instead: the prop passed to Framer Motion
// must be a bare stable reference the map/JSX merely reads, never a fresh object literal it
// creates inline, which is true under useMemo, a module constant, or any other equally valid
// hoisting technique.
test("MOT-VQA-05: MythAmongThree does not re-create the per-item stagger variants on every statements.map() iteration", () => {
  const myth = fs.readFileSync(path.join(repoRoot, "src/screens/questions/MythAmongThree.tsx"), "utf8");
  const mapStart = myth.indexOf(".map((statementText");
  const mapEnd = myth.indexOf("PENDING SLOT (hidden");
  assert.ok(mapStart > -1 && mapEnd > mapStart, "the statements.map() block must exist and precede the pending-slot section");
  const mapBody = myth.slice(mapStart, mapEnd);
  const variantsProp = mapBody.match(/variants=\{([^}]*)\}/);
  assert.ok(variantsProp, "each mapped statement must pass a variants prop to its motion element");
  assert.match(
    variantsProp![1],
    /^[A-Za-z_$][\w$]*$/,
    `the per-item entrance variants must be a bare stable reference (useMemo, a module constant, or similar), not an inline object literal recreated every iteration: variants={${variantsProp![1]}}`,
  );
});

test("MOT-VQA-05: Showdown shares one stable transition reference across its lineup, duel and result sections", () => {
  const showdown = fs.readFileSync(path.join(repoRoot, "src/screens/Showdown.tsx"), "utf8");
  const openTags = [...showdown.matchAll(/<motion\.section\b[\s\S]*?>/g)]
    .map((match) => match[0])
    .filter((tag) => /className="showdown-stage-section\b/.test(tag));
  assert.equal(openTags.length, 3, "fixture assumption: three stage sections exist to share the transition");
  const sectionBlocks = openTags.map((tag) => {
    const match = tag.match(/transition=\{([^}]*)\}/);
    assert.ok(match, `each stage section must pass a transition prop: ${tag}`);
    return match![1].trim();
  });
  for (const transitionProp of sectionBlocks) {
    assert.match(
      transitionProp,
      /^[A-Za-z_$][\w$]*$/,
      `each stage section's transition must be a bare stable reference, not a fresh object literal per section: transition={${transitionProp}}`,
    );
  }
  const distinctReferences = new Set(sectionBlocks);
  assert.equal(distinctReferences.size, 1, `all three sections must share the exact same reference, not three separately computed ones: ${[...distinctReferences]}`);
  // TW-2: the checks above only look at the usage site (transition={stageTransition}), so a
  // plain `const stageTransition = {...}` declared straight in the render body (recreated fresh
  // on every single render, no memoization at all) is just as much a shared "bare identifier" at
  // all three usage sites as a real useMemo(() => ({...}), []) is. Showdown's three stage
  // sections are mutually exclusive (plain {stage === 'x' &&, no AnimatePresence overlap), so
  // unlike MythAmongThree's statements.map() there is no single render that ever mounts more
  // than one of them at once to compare rendered object identity across. Proving this one needs
  // genuine cross-render persistence this project has no harness for (jsdom or similar). Assert
  // on the declaration instead: the shared identifier must come from useMemo with an actual
  // dependency array, React's own documented guarantee that the factory only reruns when a
  // listed dependency changes, not from a plain const that merely happens to share that name
  // (and so is recreated on every render, whether or not anything relevant changed).
  const [sharedName] = distinctReferences;
  const useMemoDeclaration = new RegExp(`const ${sharedName} = useMemo\\(\\s*\\(\\)\\s*=>\\s*\\(`, 's');
  assert.match(showdown, useMemoDeclaration, `${sharedName} must be declared via useMemo, not a plain const recreated every render`);
  const factoryStart = showdown.search(useMemoDeclaration);
  const depsMatch = showdown.slice(factoryStart).match(/\}\),\s*(\[[^\]]*\])\s*\)/);
  assert.ok(depsMatch, `${sharedName}'s useMemo call must have a closed, readable dependency array`);
});

// TW-2: the two source-text checks above only look at the usage site (transition={someName},
// variants={someName}), so they cannot tell a memoized reference from a plain object literal
// assigned to a same-named const right in the render body: `const optionVariants = {...}`
// (recreated fresh on every render and every statements.map() call) is just as much a "bare
// identifier" at each usage site as `const optionVariants = useMemo(() => ({...}), [])` is. This
// renders MythAmongThree for real, through a stubbed motion.div (stub-framer-motion.mjs) that
// records the exact variants object each of the three statements.map() iterations receives, and
// proves those three iterations receive the identical reference, something no regex on the JSX
// text can see.
test("MOT-VQA-05 (TW-2): MythAmongThree's rendered statements.map() iterations pass the identical variants reference, not three separately created ones", async () => {
  const { resetCapturedMotionCalls, CAPTURED_CALLS } = await import("./support/stub-framer-motion.mjs");
  const { MythAmongThree } = await import("../../src/screens/questions/MythAmongThree.tsx");
  resetCapturedMotionCalls();
  const question = {
    id: "tw2-myth", type: "question", kind: "myth-among-three",
    statement: "Fixture myth prompt.",
    statements: ["First fixture statement.", "Second fixture statement.", "Third fixture statement."],
    mythIndex: 1,
  };
  renderToStaticMarkup(React.createElement(MythAmongThree, { question, interactive: true }));
  const slotCalls = CAPTURED_CALLS.filter((call) => call.tag === "div" && call.props.className === "answer-slot");
  assert.equal(slotCalls.length, 3, `expected one motion.div per statement, three total: ${JSON.stringify(CAPTURED_CALLS.map((c) => ({ tag: c.tag, className: c.props.className })))}`);
  const [first, second, third] = slotCalls.map((call) => call.props.variants);
  assert.ok(first, "each answer-slot must actually pass a variants prop");
  assert.ok(Object.is(first, second) && Object.is(second, third), `all three statements.map() iterations must receive the exact same variants object, not three separately created ones: ${JSON.stringify(slotCalls.map((c) => c.props.variants))}`);
});

// MEMO-MYTH (round 7): the rendered check above runs one render, and railVariants and
// optionVariants are both declared once per render, outside statements.map(). So a plain
// `const optionVariants = {...}` in the render body still hands all three iterations the same
// object and passes, while being recreated on every render (shown by a disposable mutation,
// a local evidence file). A single server render cannot compare identity across renders,
// so this applies Showdown's declaration check (above) to both objects: each must come from
// useMemo with a real dependency array, or be a module-scope constant (stable by definition,
// the alternative TW9 kept valid).
test("MOT-VQA-05 (MEMO-MYTH): MythAmongThree declares railVariants and optionVariants through useMemo with a dependency array, not as plain objects recreated every render", () => {
  const myth = fs.readFileSync(path.join(repoRoot, "src/screens/questions/MythAmongThree.tsx"), "utf8");
  for (const name of ["railVariants", "optionVariants"]) {
    assert.match(myth, new RegExp(`variants=\\{${name}\\}`), `fixture assumption: ${name} is passed as a variants prop`);
    if (new RegExp(`^const ${name}\\b`, "m").test(myth)) continue;
    const useMemoDeclaration = new RegExp(`const ${name} = useMemo\\(\\s*\\(\\)\\s*=>\\s*\\(`, "s");
    assert.match(myth, useMemoDeclaration, `${name} must be declared via useMemo (or at module scope), not a plain const recreated every render`);
    const factoryStart = myth.search(useMemoDeclaration);
    const nextStatement = myth.slice(factoryStart + 1).search(/\n\s*(?:const |return )/);
    const factory = nextStatement === -1 ? myth.slice(factoryStart) : myth.slice(factoryStart, factoryStart + 1 + nextStatement);
    assert.match(factory, /\}\),\s*\[[^\]]*\]\s*\);/, `${name}'s own useMemo call must close with a readable dependency array`);
  }
});
