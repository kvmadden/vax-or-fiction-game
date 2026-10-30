import assert from "node:assert/strict";
import test from "node:test";
import { phonesCanVote } from "../../src/screens/setup-polling";
import { useGameStore } from "../../src/store/game-store";

test("phones can vote only on a live venue with polling on", () => {
  assert.equal(phonesCanVote("teams", "polling"), true);
  assert.equal(phonesCanVote("room", "polling"), true);
  assert.equal(phonesCanVote("offline", "polling"), false, "Offline never invites phones");
  assert.equal(phonesCanVote("teams", "facilitator"), false, "hands-up Teams stays hands up");
  assert.equal(phonesCanVote("room", "facilitator"), false, "huddle remount must not flip to phones");
  assert.equal(phonesCanVote("offline", "facilitator"), false);
});

test("a fresh host store starts polling so Teams ready-screen phones match the store", () => {
  assert.equal(useGameStore.getInitialState().interactionMode, "polling");
});
