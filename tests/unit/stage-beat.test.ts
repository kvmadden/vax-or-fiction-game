import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Question } from "../../src/screens/Question";
import type { Question as QuestionData } from "../../src/data/types";

const question: QuestionData = {
  id: "stage-beat-binary",
  type: "question",
  kind: "binary",
  statement: "A staged binary statement.",
  answer: true,
  reveal: "A complete explanation with its necessary condition.",
  takeaway: "A useful teaching point.",
};

const stage = (phase: "deliberating" | "locked" | "revealed" | "explaining", extra: Record<string, unknown> = {}) =>
  renderToStaticMarkup(React.createElement(Question, {
    question,
    phase,
    autoDeliberateDelayMs: 0,
    interactionMode: "polling",
    ...extra,
  }));

test("posed, locked, revealed, and explaining each name their beat in large rail words", () => {
  const open = stage("deliberating");
  assert.match(open, /data-stage-beat="posed"/);
  assert.match(open, /data-role="status-rail"[^>]*data-state="open"/);
  assert.match(open, /class="status-rail__phase">Voting open</);

  const locked = stage("locked");
  assert.match(locked, /data-stage-beat="locked"/);
  assert.match(locked, /data-role="status-rail"[^>]*data-state="locked"/);
  assert.match(locked, /class="status-rail__phase">Votes locked</);

  const zeroLock = renderToStaticMarkup(React.createElement(Question, {
    question,
    phase: "locked",
    autoDeliberateDelayMs: 0,
    interactionMode: "polling",
    votes: {},
  }));
  assert.match(zeroLock, /class="status-rail__phase">Votes locked</);

  const revealed = stage("revealed");
  assert.match(revealed, /data-stage-beat="result"/);
  assert.match(revealed, /class="status-rail__phase">Revealed</);
  assert.match(revealed, /data-role="status-rail-hint"[^>]*>Space · explain</);

  const explaining = stage("explaining");
  assert.match(explaining, /data-stage-beat="explanation"/);
  assert.match(explaining, /class="status-rail__phase">Why it matters</);
  assert.match(explaining, /data-role="status-rail-hint"[^>]*>Space · next</);
});

test("a missing question is a next beat, never a blank or No question loaded", () => {
  const html = renderToStaticMarkup(React.createElement(Question, {
    question: null as unknown as QuestionData,
    phase: "deliberating",
    autoDeliberateDelayMs: 0,
  }));
  assert.match(html, /data-stage-beat="next"/);
  assert.match(html, />Next question</);
  assert.match(html, /Look up\. The next one is coming\./);
  assert.doesNotMatch(html, /No question loaded/);
});

test("an empty explanation still has walk-through copy", () => {
  const html = stage("explaining", {
    question: { ...question, reveal: "", takeaway: "" },
  });
  assert.match(html, /Look up\. The presenter is walking through the evidence\./);
});

test("ScreenRouter keeps locked on the question shell", () => {
  const source = readFileSync(new URL("../../src/screens/ScreenRouter.tsx", import.meta.url), "utf8");
  assert.match(source, /activePhase === "locked"/);
});
