import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PhoneJoin } from "../../src/phone/PhoneJoin";
import { useGameStore } from "../../src/store/game-store";

const render = (props: React.ComponentProps<typeof PhoneJoin> = {}) =>
  renderToStaticMarkup(
    React.createElement(PhoneJoin, {
      initialRoomCode: "ROOM-42",
      ...props,
    }),
  );

test("participant must provide a name; join offers no generated identity", () => {
  const empty = render();

  assert.match(
    empty,
    /<input(?=[^>]*data-role="nickname-input")(?=[^>]*required)[^>]*>/,
  );
  assert.match(
    empty,
    /<button(?=[^>]*data-role="join-submit-btn")(?=[^>]*disabled)[^>]*>/,
  );
  assert.doesNotMatch(empty, /Merry Sparrow 04|made-up nickname|generated identity/i);
  assert.doesNotMatch(empty, /leaderboard|showdown/i);
  assert.equal((empty.match(/What should we call you\?/g) ?? []).length, 1);

  const named = render({ initialNickname: "A self-chosen name" });
  assert.doesNotMatch(
    named,
    /<button(?=[^>]*data-role="join-submit-btn")(?=[^>]*disabled)[^>]*>/,
  );
});

test("join never asks a participant to select a team or side", () => {
  for (const html of [
    render({ teamsEnabled: true }),
    render({ initialRoomCode: "", teamsEnabled: true }),
  ]) {
    assert.doesNotMatch(html, /team-(?:navy|gold)-btn|team-radio-group|team-picker-section/);
    assert.doesNotMatch(html, /select a side|choose a side|clinical rigor side|frontline clarity side/i);
  }
});

test("host state rejects a new participant with a blank name", () => {
  const prior = useGameStore.getState().seenDevices;
  try {
    useGameStore.setState({ seenDevices: {} });
    useGameStore.getState().dispatch({ type: "HELLO", deviceId: "blank-name-device", nickname: "   " });
    assert.equal(useGameStore.getState().seenDevices["blank-name-device"], undefined);
  } finally {
    useGameStore.setState({ seenDevices: prior });
  }
});

test("a name that trips the display-name filter still joins, shown under the neutral fallback (DEF-32)", () => {
  const prior = useGameStore.getState().seenDevices;
  try {
    useGameStore.setState({ seenDevices: {} });
    useGameStore.getState().dispatch({ type: "HELLO", deviceId: "flagged-name-device", nickname: "total bastard" });
    const device = useGameStore.getState().seenDevices["flagged-name-device"];
    assert.ok(device, "the join must still succeed");
    assert.equal(device?.nickname, "Player");
  } finally {
    useGameStore.setState({ seenDevices: prior });
  }
});

test("an ordinary name is recorded exactly as typed (DEF-32)", () => {
  const prior = useGameStore.getState().seenDevices;
  try {
    useGameStore.setState({ seenDevices: {} });
    useGameStore.getState().dispatch({ type: "HELLO", deviceId: "clean-name-device", nickname: "Hancock" });
    assert.equal(useGameStore.getState().seenDevices["clean-name-device"]?.nickname, "Hancock");
  } finally {
    useGameStore.setState({ seenDevices: prior });
  }
});

// W8: the room-facing nickname is filtered, but the device record also keeps the raw, as-typed name so
// the player's own phone can show it back to them unfiltered (only the surfaces the room sees are filtered).
test("a flagged name is stored filtered for the room, and raw alongside it for the player's own device (W8)", () => {
  const prior = useGameStore.getState().seenDevices;
  try {
    useGameStore.setState({ seenDevices: {} });
    useGameStore.getState().dispatch({ type: "HELLO", deviceId: "flagged-name-device", nickname: "total bastard" });
    const device = useGameStore.getState().seenDevices["flagged-name-device"];
    assert.equal(device?.nickname, "Player", "the room-facing name is still filtered");
    assert.equal(device?.rawNickname, "total bastard", "the raw name is preserved for the owning device");
  } finally {
    useGameStore.setState({ seenDevices: prior });
  }
});
