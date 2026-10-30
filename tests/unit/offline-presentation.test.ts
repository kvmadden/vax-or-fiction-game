import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ShowChrome } from "../../src/components/show/ShowChrome";
import { hostModeOptions, Preflight } from "../../src/screens/Preflight";
import { RoomContext } from "../../src/presentation/RoomContext";

test("offline show chrome does not invite phones or expose a room code", () => {
  const html = renderToStaticMarkup(
    React.createElement(
      ShowChrome,
      { roomId: "TM9K77", joinHost: "vaxorfiction.com", offline: true },
      React.createElement("p", null, "Question")
    )
  );

  assert.doesNotMatch(html, /Join at/i);
  assert.doesNotMatch(html, /TM9K77/);
  assert.doesNotMatch(html, /vaxorfiction\.com/);
});

test("offline setup omits phone pairing details and names the lobby action generically", () => {
  const previousWindow = globalThis.window;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { location: { origin: "http://localhost" }, addEventListener() {}, removeEventListener() {} },
  });

  let html = "";
  try {
    html = renderToStaticMarkup(
      React.createElement(Preflight, {
        venue: "offline",
        format: "widescreen",
        onSelectVenue: () => {},
        onLaunchLobby: () => {},
      })
    );
  } finally {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: previousWindow,
    });
  }

  assert.doesNotMatch(html, /setup-room-card/);
  assert.doesNotMatch(html, /Open Teams Lobby/);
  assert.match(html, /aria-label="Open the lobby"/);
  assert.match(html, /Hands-up play is selected/);
  assert.doesNotMatch(html, /Phone voting is ready/);
  assert.doesNotMatch(html, /setup-offline-backup/);
  assert.doesNotMatch(html, /Save offline copy on this laptop/);
});

test("the host menu is Curated 8, Curated 15, and the Quick demo", () => {
  const options = hostModeOptions("vax-or-fiction");
  assert.deepEqual(options.map((option) => option.id), ["curated8", "curated15", "demo", "rehearsal"]);
  assert.deepEqual(options.map((option) => option.label), ["Curated 8", "Curated 15", "Quick demo", "Practice run"]);
  assert.ok(options.every((option) => option.id !== "full" && option.id !== "lightning"));
});

test("phone venues point at this show for offline play and do not download the classic file", () => {
  const previousWindow = globalThis.window;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { location: { origin: "http://localhost" } },
  });

  try {
    const room = renderToStaticMarkup(React.createElement(Preflight, { venue: "room", format: "widescreen" }));
    const teams = renderToStaticMarkup(React.createElement(Preflight, { venue: "teams", format: "widescreen" }));
    const offline = renderToStaticMarkup(React.createElement(Preflight, { venue: "offline", format: "widescreen" }));
    for (const html of [room, teams]) {
      assert.match(html, /data-role="setup-offline-backup"/);
      assert.doesNotMatch(html, /classic\/downloads\/Vax-or-Fiction\.html/);
      assert.match(html, /Choose Offline to run this same show/);
      assert.match(html, /There is no second file/);
    }
    assert.doesNotMatch(offline, /setup-offline-backup/);
  } finally {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: previousWindow,
    });
  }
});

test("setup describes room readiness without claiming disconnected phone voting is live", () => {
  const previousWindow = globalThis.window;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { location: { origin: "http://localhost" }, addEventListener() {}, removeEventListener() {} },
  });
  try {
    for (const [connectionStatus, expected] of [
      ["connected", "Phone voting is ready"],
      ["connecting", "Connecting phone voting…"],
      ["reconnecting", "Connecting phone voting…"],
      ["offline", "Phone voting is not connected"],
    ] as const) {
      const html = renderToStaticMarkup(React.createElement(RoomContext.Provider,
        { value: { roomId: "TEST", connectionStatus, error: null } },
        React.createElement(Preflight, { venue: "teams", format: "widescreen" })));
      assert.ok(html.includes(expected), `${connectionStatus} gives the correct readiness message`);
      if (connectionStatus !== "connected") assert.doesNotMatch(html, /Phone voting is ready|Live phone voting is on/);
    }
  } finally {
    Object.defineProperty(globalThis, "window", { configurable: true, value: previousWindow });
  }
});

test("WARNING-4 (premium-host-fix-3): setup-live-line is sr-only only at the offline venue", () => {
  const previousWindow = globalThis.window;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { location: { origin: "http://localhost" }, addEventListener() {}, removeEventListener() {} },
  });
  try {
    // W1 (pass 2): sr-only hid this line for every venue, hiding online/in-room's only visible
    // "phone voting not connected" signal. Offline alone has that state covered elsewhere (the
    // hands-up copy on the card itself), so offline alone keeps it screen-reader-only.
    for (const venue of ["room", "teams"] as const) {
      const html = renderToStaticMarkup(React.createElement(Preflight, { venue, format: "widescreen" }));
      assert.match(html, /class="setup-live-line"/, `${venue} must show the live line visibly`);
      assert.doesNotMatch(html, /class="setup-live-line sr-only"/, `${venue} must not be sr-only`);
    }
    const offlineHtml = renderToStaticMarkup(React.createElement(Preflight, { venue: "offline", format: "widescreen" }));
    assert.match(offlineHtml, /class="setup-live-line sr-only"/, "offline alone stays sr-only");
  } finally {
    Object.defineProperty(globalThis, "window", { configurable: true, value: previousWindow });
  }
});
