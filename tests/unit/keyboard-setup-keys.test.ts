import assert from "node:assert/strict";
import test from "node:test";
import {
  ADD_TIME,
  ADVANCE,
  BACK,
  CLOSE_HELP,
  HUD_HIDE,
  HUD_SHOW,
  LOCK_VOTES,
  OPEN_HELP,
  PARK,
  RESTART_TIMER,
  REVEAL,
  SKIP,
  TOGGLE_AUDIO,
  TOGGLE_DISCUSSION,
  TOGGLE_PAUSE,
  TOGGLE_TIMER,
  mapKeyboardEvent,
  shouldPreventPresenterKeyDefault,
} from "../../src/facilitator/keyboard-actions";

const SETUP = ["deckPicker", "formatPicker", "modePicker", "preFlight"] as const;
const SHOW_KEYS = [
  "ArrowRight",
  "ArrowLeft",
  "PageDown",
  "PageUp",
  " ",
  "Enter",
  "s",
  "S",
  "1",
  "2",
  "3",
  "t",
  "T",
  "l",
  "L",
  "r",
  "R",
  "p",
  "P",
  "+",
  "=",
  "k",
  "K",
] as const;

test("VOF-46 / VOF-47: show-running keys map to nothing on every setup phase", () => {
  for (const phase of SETUP) {
    const state = { phase, modeId: "full" };
    for (const key of SHOW_KEYS) {
      assert.equal(mapKeyboardEvent({ key }, state), null, `${JSON.stringify(key)} must do nothing on ${phase}`);
    }
    assert.equal(
      mapKeyboardEvent({ key: "R", shiftKey: true }, state),
      null,
      `Shift+R must do nothing on ${phase}`,
    );
  }
});

test("VOF-46: setup still keeps mute, fullscreen, HUD, help and the parked discussion key", () => {
  const phase = "preFlight";
  assert.deepEqual(mapKeyboardEvent({ key: "m" }, { phase }), { type: TOGGLE_AUDIO });
  assert.deepEqual(mapKeyboardEvent({ key: "M", shiftKey: true }, { phase }), { type: TOGGLE_AUDIO });
  assert.deepEqual(mapKeyboardEvent({ key: "f" }, { phase }), { type: "REQUEST_FULLSCREEN" });
  assert.deepEqual(mapKeyboardEvent({ key: "f" }, { phase, fullscreenActive: true }), { type: "EXIT_FULLSCREEN" });
  assert.deepEqual(mapKeyboardEvent({ key: "h" }, { phase, hud: { visible: false } }), { type: HUD_SHOW, restore: true });
  assert.deepEqual(
    mapKeyboardEvent({ key: "h" }, { phase, hud: { visible: true } }),
    { type: HUD_HIDE, releaseFocus: true, suppress: true },
  );
  assert.deepEqual(
    mapKeyboardEvent({ key: "?" }, { phase }),
    { type: OPEN_HELP, returnFocusId: "presentation-stage" },
  );
  assert.deepEqual(mapKeyboardEvent({ key: "d" }, { phase }), { type: TOGGLE_DISCUSSION });
});

test("VOF-46: Enter reveals only a question on stage", () => {
  for (const phase of ["lobby", "closing", "outro", "showdown", "leaderboard", ...SETUP]) {
    assert.equal(mapKeyboardEvent({ key: "Enter" }, { phase }), null, `Enter must do nothing on ${phase}`);
    assert.equal(mapKeyboardEvent({ key: "s" }, { phase }), null, `S must do nothing on ${phase}`);
    assert.equal(mapKeyboardEvent({ key: "k" }, { phase }), null, `K must do nothing on ${phase}`);
  }
  assert.deepEqual(mapKeyboardEvent({ key: "Enter" }, { phase: "entering" }), { type: REVEAL });
  assert.deepEqual(mapKeyboardEvent({ key: "Enter" }, { phase: "deliberating" }), { type: REVEAL });
  assert.deepEqual(mapKeyboardEvent({ key: "Enter" }, { phase: "locked" }), { type: REVEAL });
  assert.deepEqual(mapKeyboardEvent({ key: "Enter" }, {}), { type: REVEAL }, "missing phase keeps the on-stage map");
});

test("off setup, the same keys keep their show meanings", () => {
  const live = { phase: "entering", modeId: "full" };
  assert.deepEqual(mapKeyboardEvent({ key: "ArrowRight" }, live), { type: ADVANCE });
  assert.deepEqual(mapKeyboardEvent({ key: " " }, live), { type: ADVANCE });
  assert.deepEqual(mapKeyboardEvent({ key: "ArrowLeft" }, live), { type: BACK });
  assert.deepEqual(mapKeyboardEvent({ key: "s" }, live), { type: SKIP });
  assert.deepEqual(mapKeyboardEvent({ key: "t" }, live), { type: TOGGLE_TIMER });
  assert.deepEqual(mapKeyboardEvent({ key: "l" }, live), { type: LOCK_VOTES });
  assert.deepEqual(mapKeyboardEvent({ key: "r" }, live), { type: RESTART_TIMER });
  assert.deepEqual(mapKeyboardEvent({ key: "p" }, live), { type: TOGGLE_PAUSE });
  assert.deepEqual(mapKeyboardEvent({ key: "+" }, live), { type: ADD_TIME });
  assert.deepEqual(mapKeyboardEvent({ key: "k" }, live), { type: PARK });
  assert.deepEqual(mapKeyboardEvent({ key: "R", shiftKey: true }, live), { type: "REQUEST_RESTART_RUN" });
});

test("idle presenter keys still block page scroll on the ready sheet and lobby", () => {
  const stage = { tagName: "DIV" };
  for (const key of [" ", "ArrowUp", "ArrowDown", "ArrowLeft", "PageDown", "Home", "End"] as const) {
    assert.equal(shouldPreventPresenterKeyDefault({ key, target: stage }), true, `${JSON.stringify(key)} must not scroll the stage`);
  }
  assert.equal(shouldPreventPresenterKeyDefault({ key: " ", target: { tagName: "INPUT" } }), false);
  assert.equal(shouldPreventPresenterKeyDefault({ key: " ", target: { tagName: "BUTTON" } }), false);
  assert.equal(shouldPreventPresenterKeyDefault({ key: "m", target: stage }), false);
});

test("VOF-46: Enter/S/K stay idle on title and instructions even when phase is leftover entering", () => {
  const title = { id: "title", type: "title", title: "Vax or Fiction?" };
  const instructions = { id: "instructions", type: "instructions", title: "Talk first." };
  const question = { id: "q1", type: "question", kind: "binary", answer: true };
  const opening = { phase: "entering", modeId: "full", run: [title, instructions, question], slideIndex: 0 };
  assert.equal(mapKeyboardEvent({ key: "Enter" }, opening), null);
  assert.equal(mapKeyboardEvent({ key: "s" }, opening), null);
  assert.equal(mapKeyboardEvent({ key: "k" }, opening), null);
  assert.deepEqual(mapKeyboardEvent({ key: "ArrowRight" }, opening), { type: ADVANCE });
  const how = { ...opening, slideIndex: 1 };
  assert.equal(mapKeyboardEvent({ key: "Enter" }, how), null);
  assert.equal(mapKeyboardEvent({ key: "s" }, how), null);
  const live = { ...opening, slideIndex: 2 };
  assert.deepEqual(mapKeyboardEvent({ key: "Enter" }, live), { type: REVEAL });
  assert.deepEqual(mapKeyboardEvent({ key: "s" }, live), { type: SKIP });
  assert.deepEqual(mapKeyboardEvent({ key: "k" }, live), { type: PARK });
  assert.deepEqual(mapKeyboardEvent({ key: "t" }, live), { type: TOGGLE_TIMER });
  assert.equal(mapKeyboardEvent({ key: "t" }, opening), null);
  assert.equal(mapKeyboardEvent({ key: "l" }, opening), null);
  assert.equal(mapKeyboardEvent({ key: "+" }, opening), null);
});

test("VOF-46: Enter/S/K stay idle on focus, fork, and halftime leftover entering", () => {
  const focus = { id: "focus-1", type: "focus", title: "Next block" };
  const fork = { id: "fork", type: "fork" };
  const halftime = { id: "halftime", type: "halftime" };
  const question = { id: "q1", type: "question", kind: "binary", answer: true };
  const run = [focus, fork, halftime, question];
  for (const slideIndex of [0, 1, 2]) {
    const state = { phase: "entering", modeId: "full", run, slideIndex };
    assert.equal(mapKeyboardEvent({ key: "Enter" }, state), null, `Enter idle on ${run[slideIndex]?.type}`);
    assert.equal(mapKeyboardEvent({ key: "s" }, state), null, `S idle on ${run[slideIndex]?.type}`);
    assert.equal(mapKeyboardEvent({ key: "k" }, state), null, `K idle on ${run[slideIndex]?.type}`);
    assert.equal(mapKeyboardEvent({ key: "t" }, state), null, `T idle on ${run[slideIndex]?.type}`);
    assert.equal(mapKeyboardEvent({ key: "l" }, state), null, `L idle on ${run[slideIndex]?.type}`);
    assert.equal(mapKeyboardEvent({ key: "+" }, state), null, `+ idle on ${run[slideIndex]?.type}`);
    assert.deepEqual(mapKeyboardEvent({ key: "ArrowRight" }, state), { type: ADVANCE });
  }
  const live = { phase: "entering", modeId: "full", run, slideIndex: 3 };
  assert.deepEqual(mapKeyboardEvent({ key: "Enter" }, live), { type: REVEAL });
});

test("a slide error maps Space to skip so recovery matches the on-screen key", () => {
  const errored = { phase: "entering", modeId: "full", slideError: true };
  assert.deepEqual(mapKeyboardEvent({ key: " " }, errored), { type: SKIP });
  assert.deepEqual(mapKeyboardEvent({ key: "s" }, errored), { type: SKIP });
  assert.deepEqual(mapKeyboardEvent({ key: " " }, { phase: "entering" }), { type: ADVANCE });
});

test("NIT-9: ? does nothing while the presenter pairing dialog is open", () => {
  const pairing = { phase: "preFlight", modeId: "full", pairingOpen: true };
  // The pairing dialog's own focus trap owns Tab. Before this fix ? still opened the keyboard
  // help sheet underneath it (z-index 50 under the pairing dialog's 80), and the two dialogs'
  // Tab traps fought over focus.
  assert.equal(mapKeyboardEvent({ key: "?" }, pairing), null);
  // If help were somehow already open, ? still closes it. Pairing does not trap that shut.
  const pairingWithHelpOpen = { ...pairing, help: { open: true } };
  assert.deepEqual(mapKeyboardEvent({ key: "?" }, pairingWithHelpOpen), { type: CLOSE_HELP });
  // Once pairing closes, ? opens help again as normal.
  const notPairing = { ...pairing, pairingOpen: false };
  assert.deepEqual(mapKeyboardEvent({ key: "?" }, notPairing), { type: OPEN_HELP, returnFocusId: "presentation-stage" });
});
