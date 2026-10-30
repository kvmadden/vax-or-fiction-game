import test from "node:test";
import assert from "node:assert/strict";
import { useGameStore } from "../../src/store/game-store";
import {
  REQUEST_RESTART_RUN,
  CONFIRM_RESTART_RUN,
  CANCEL_RESTART_RUN,
  handleKeyboardEvent,
} from "../../src/facilitator/keyboard-actions";

// ==============================================================================
// Task 1.3 / JUDGE-F02 Unit Tests
// ==============================================================================

test("JUDGE-F02 / Action Constants: keyboard actions expose required restart actions", () => {
  assert.equal(REQUEST_RESTART_RUN, "REQUEST_RESTART_RUN");
  assert.equal(CONFIRM_RESTART_RUN, "CONFIRM_RESTART_RUN");
  assert.equal(CANCEL_RESTART_RUN, "CANCEL_RESTART_RUN");
});

test("JUDGE-F02 / game-store: REQUEST_RESTART_RUN opens confirmation modal", () => {
  useGameStore.setState({ restartRunConfirmationOpen: false });
  assert.equal(useGameStore.getState().restartRunConfirmationOpen, false);

  useGameStore.getState().dispatch({ type: "REQUEST_RESTART_RUN" });
  assert.equal(useGameStore.getState().restartRunConfirmationOpen, true);
});

test("JUDGE-F02 / game-store: CANCEL_RESTART_RUN closes confirmation modal without affecting run", () => {
  useGameStore.setState({
    restartRunConfirmationOpen: true,
    slideIndex: 3,
    phase: "question" as any,
  });

  useGameStore.getState().dispatch({ type: "CANCEL_RESTART_RUN" });
  const state = useGameStore.getState();
  assert.equal(state.restartRunConfirmationOpen, false);
  assert.equal(state.slideIndex, 3);
  assert.equal(state.phase, "question");
});

test("JUDGE-F02 / game-store: CONFIRM_RESTART_RUN closes modal and resets run to initial slide", () => {
  useGameStore.setState({
    restartRunConfirmationOpen: true,
    slideIndex: 4,
    phase: "revealed" as any,
    run: [
      { id: "q1", type: "question" },
      { id: "q2", type: "question" },
    ] as any,
    pollVotes: { q1: { true: 5 } },
    votesLocked: true,
  });

  useGameStore.getState().dispatch({ type: "CONFIRM_RESTART_RUN" });
  const state = useGameStore.getState();
  assert.equal(state.restartRunConfirmationOpen, false);
  assert.equal(state.slideIndex, 0);
  assert.equal(state.votesLocked, false);
  assert.deepEqual(state.pollVotes, {});
});

test("JUDGE-F02 / Keyboard: Shift+R triggers REQUEST_RESTART_RUN", () => {
  const state = { restartRunConfirmationOpen: false } as any;
  const event = {
    key: "R",
    shiftKey: true,
    repeat: false,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
  };

  const action = handleKeyboardEvent(event, state);
  assert.deepEqual(action, { type: REQUEST_RESTART_RUN });
});

test("JUDGE-F02 / Keyboard: When restartRunConfirmationOpen is true, Escape returns CANCEL_RESTART_RUN", () => {
  const state = { restartRunConfirmationOpen: true } as any;
  const event = {
    key: "Escape",
    shiftKey: false,
    repeat: false,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
  };

  const action = handleKeyboardEvent(event, state);
  assert.ok(action, "Escape must return an action when confirmation modal is open");
  assert.equal(action.type, CANCEL_RESTART_RUN, "Escape must dispatch CANCEL_RESTART_RUN");
});

test("JUDGE-F02 / Keyboard: When restartRunConfirmationOpen is true, other keys return null (guarded)", () => {
  const state = { restartRunConfirmationOpen: true } as any;
  const nonEscapeKeys = [" ", "Enter", "ArrowRight", "ArrowLeft", "PageDown", "PageUp", "r", "R", "t", "s", "k"];

  for (const key of nonEscapeKeys) {
    const event = {
      key,
      shiftKey: false,
      repeat: false,
      metaKey: false,
      ctrlKey: false,
      altKey: false,
    };
    const action = handleKeyboardEvent(event, state);
    assert.equal(action, null, `Key '${key}' should return null when restartRunConfirmationOpen is true`);
  }
});

// ==============================================================================
// RestartRunModal Component SSR Tests
// ==============================================================================

import React from "react";
import { renderToString } from "react-dom/server";
import { RestartRunModal } from "../../src/components/RestartRunModal";

test("JUDGE-F02 / RestartRunModal: Does not render when isOpen is false", () => {
  const html = renderToString(React.createElement(RestartRunModal, { isOpen: false }));
  assert.equal(html, "", "RestartRunModal should render nothing when isOpen is false");
});

test("JUDGE-F02 / RestartRunModal: Renders accessible dialog with Confirm and Cancel buttons when open", () => {
  const html = renderToString(React.createElement(RestartRunModal, { isOpen: true }));

  assert.ok(html.includes('role="dialog"'), "Modal must have role='dialog'");
  assert.ok(html.includes('aria-modal="true"'), "Modal must have aria-modal='true'");
  assert.ok(html.includes('id="restart-modal-title"'), "Modal must have id='restart-modal-title'");
  assert.ok(html.includes('id="restart-modal-description"'), "Modal must have id='restart-modal-description'");
  assert.ok(html.includes('Restart this run?'), "Modal must contain title 'Restart this run?'");
  assert.ok(html.includes('>Restart</span>') || html.includes('Restart'), "Modal must have a Restart button");
  assert.ok(html.includes('Cancel'), "Modal must have 'Cancel' button");
  assert.ok(html.includes('data-action="confirm-restart"'), "Modal must have data-action='confirm-restart'");
  assert.ok(html.includes('data-action="cancel-restart"'), "Modal must have data-action='cancel-restart'");
});
