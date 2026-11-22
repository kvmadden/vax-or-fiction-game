import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { InstructionsSlide } from "../../src/screens/InstructionsSlide";
import { useGameStore } from "../../src/store/game-store";
import { phonesCanVote } from "../../src/screens/setup-polling";

function render(props: React.ComponentProps<typeof InstructionsSlide> = {}): string {
  return renderToStaticMarkup(React.createElement(InstructionsSlide, props));
}

test("instructions show the three canonical steps in an accessible ordered list", () => {
  const html = render();
  assert.match(html, /data-screen="instructions"/);
  assert.match(html, /data-format="widescreen"/);
  assert.match(html, /<h1>Talk first\. Reveal second\.<\/h1>/);
  assert.match(html, /<ol[^>]*aria-label="How this works"/);
  assert.equal((html.match(/class="instructions-source-step step-/g) ?? []).length, 3);
  for (const title of ["Make your call", "Hash it out", "See the evidence"]) {
    assert.ok(html.includes(title), "missing canonical step: " + title);
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
  for (const venue of ["teams", "room", "offline"] as const) {
    for (const mode of ["polling", "facilitator"] as const) {
      assert.equal(
        phonesCanVote(venue, mode),
        venue !== "offline" && mode === "polling",
        venue + " / " + mode + " voting policy",
      );
    }
  }

  // Zustand's server-rendered hook reads its initial snapshot, not setState mutations.
  // Check rendered markup against that snapshot and test both modes via the policy above.
  const serverMode = useGameStore.getInitialState().interactionMode ?? "facilitator";
  for (const venue of ["teams", "room", "offline"] as const) {
    const html = render({ venue });
    if (phonesCanVote(venue, serverMode)) {
      assert.match(html, /Vote on your phone\./);
    } else {
      assert.doesNotMatch(html, /Vote on your phone\./);
    }
  }
});

test("Start Question 1 is a real button only when an interactive start action exists", () => {
  const onStart = () => {};
  const html = render({ onStart });
  assert.match(html, /<button class="opening-screen-action facilitator-press" type="button">Start Question 1<\/button>/);
  assert.doesNotMatch(render({ interactive: false, onStart }), /Start Question 1/);
  assert.doesNotMatch(render({ interactive: true }), /Start Question 1/);
});
