import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PhoneJoin } from "../../src/phone/PhoneJoin";
import { PhoneLayout } from "../../src/phone/PhoneLayout";

test("participant join copy does not claim anonymity after requiring a name", () => {
  const manualRoomHtml = renderToStaticMarkup(React.createElement(PhoneJoin, { initialRoomCode: "" }));
  const linkedRoomHtml = renderToStaticMarkup(React.createElement(PhoneJoin, { initialRoomCode: "ROOM42" }));
  assert.doesNotMatch(manualRoomHtml, /Anonymous/i);
  assert.doesNotMatch(linkedRoomHtml, /report never names anyone/i);
  assert.match(manualRoomHtml, /No sign-in/i);
  assert.match(manualRoomHtml, /JOIN THE GAME/i);
  assert.match(manualRoomHtml, /4-character code on the screen/i);
  assert.doesNotMatch(manualRoomHtml, /ATTENDEE CONSOLE|facilitator screen|ENTER PRESENTATION/i);
  assert.doesNotMatch(manualRoomHtml, /Device ID:/i);
});

test("participant footer uses plain session copy and preserves entered name", () => {
  const html = renderToStaticMarkup(
    React.createElement(
      PhoneLayout,
      { attendeeName: "Alex", connectionStatus: "connected", showWakeLockIndicator: false },
      React.createElement("p", null, "Question"),
    ),
  );
  assert.match(html, />Alex</);
  assert.match(html, />In session</);
  assert.doesNotMatch(html, /VOTER CLIENT|LIVE SESSION|Device ID:/i);
});
