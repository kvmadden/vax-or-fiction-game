import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { InstructionsSlide } from "../../src/screens/InstructionsSlide";
import { useGameStore } from "../../src/store/game-store";

function render(props: React.ComponentProps<typeof InstructionsSlide> = {}): string {
  return renderToStaticMarkup(React.createElement(InstructionsSlide, props));
}

test("instructions show the three canonical steps in an accessible ordered list", () => {
  const previousMode = useGameStore.getState().interactionMode;
  useGameStore.setState({ interactionMode: "facilitator" });
  try {
    const html = render();
    assert.match(html, /data-screen="instructions"/);
    assert.match(html, /data-format="widescreen"/);
    assert.match(html, /<h1>Talk first\. Reveal second\.<\/h1>/);
    assert.match(html, /<ol[^>]*aria-label="How this works"/);
    assert.equal((html.match(/class="instructions-source-step step-/g) ?? []).length, 3);
    for (const title of ["Make your call", "Hash it out", "See the evidence"]) {
      assert.ok(html.includes(title), `missing canonical step: ${title}`);
    }
    assert.doesNotMatch(html, /Vote on your phone\./, "hands-up instructions should not imply phone voting");
  } finally {
    useGameStore.setState({ interactionMode: previousMode });
  }
});

test("custom copy and steps render, and format takes precedence over formatId", () => {
  const html = render({
    title: "Practice together",
    steps: [{ number: "A", title: "First step", description: "A custom explanation." }],
    format: "square",
    formatId: "portrait",
    className: "custom-instructions",
  });
  assert.match(html, /data-format="square"/);
  assert.match(html, /class="screen instructions show-screen preshow-instructions custom-instructions"/);
  assert.match(html, /<h1>Practice together<\/h1>/);
  assert.match(html, /class="instructions-source-step step-A"/);
  assert.match(html, /First step/);
  assert.equal((html.match(/class="instructions-source-step step-/g) ?? []).length, 1);
  assert.doesNotMatch(html, /Make your call/);
});

test("phone-voting descriptions show only in a voting-enabled venue and mode", () => {
  const previousMode = useGameStore.getState().interactionMode;
  try {
    useGameStore.setState({ interactionMode: "polling" });
    assert.match(render({ venue: "teams" }), /Vote on your phone\./);
    assert.match(render({ venue: "room" }), /Vote on your phone\./);
    assert.doesNotMatch(render({ venue: "offline" }), /Vote on your phone\./);
    useGameStore.setState({ interactionMode: "facilitator" });
    assert.doesNotMatch(render({ venue: "teams" }), /Vote on your phone\./);
  } finally {
    useGameStore.setState({ interactionMode: previousMode });
  }
});

test("Start Question 1 is a real button only when an interactive start action exists", () => {
  const onStart = () => {};
  const html = render({ onStart });
  assert.match(html, /<button class="opening-screen-action facilitator-press" type="button">Start Question 1<\/button>/);
  assert.doesNotMatch(render({ interactive: false, onStart }), /Start Question 1/);
  assert.doesNotMatch(render({ interactive: true }), /Start Question 1/);
});
