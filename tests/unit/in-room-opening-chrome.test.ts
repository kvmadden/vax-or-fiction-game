import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Lobby } from "../../src/screens/Lobby";
import { TitleSlide } from "../../src/screens/TitleSlide";
import { RoomContext } from "../../src/presentation/RoomContext";

const room = { roomId: "ABCD", connectionStatus: "connected" as const, error: null };
const joinUrl = "https://vaxorfiction.com/join/ABCD";

test("in-room lobby shows QR plus Join a game plus the code, not a second host URL", () => {
  const html = renderToStaticMarkup(
    React.createElement(RoomContext.Provider, { value: room },
      React.createElement(Lobby, { venue: "room", interactionMode: "polling", roomCode: "ABCD", pollingUrl: joinUrl }),
    ),
  );
  assert.match(html, /data-role="qr-code"/);
  assert.match(html, />Join a game</);
  assert.match(html, /data-role="room-code">ABCD</);
  assert.match(html, /data-role="join-type-fallback"[^>]*>VaxOrFiction\.com</);
  assert.match(html, /scan\? Type/i);
  assert.doesNotMatch(html, /class="lobby-join-address"/);
});

test("Teams lobby renders QR code and typed fallback host matching room venue", () => {
  const html = renderToStaticMarkup(
    React.createElement(RoomContext.Provider, { value: room },
      React.createElement(Lobby, { venue: "teams", interactionMode: "polling", roomCode: "ABCD", pollingUrl: joinUrl }),
    ),
  );
  assert.match(html, /data-role="qr-code"/);
  assert.match(html, /data-role="join-type-fallback"[^>]*>VaxOrFiction\.com</);
  assert.doesNotMatch(html, /data-role="join-type-fallback"[^>]*>vaxorfiction\.com</);
  assert.match(html, />Join a game</);
  assert.match(html, /data-role="room-code">ABCD</);
});

test("in-room title drops the tagline so instructions can own how-to copy", () => {
  const roomTitle = renderToStaticMarkup(
    React.createElement(RoomContext.Provider, { value: room },
      React.createElement(TitleSlide, { venue: "room", interactive: false }),
    ),
  );
  assert.doesNotMatch(roomTitle, /Talk it through/);
  const teamsTitle = renderToStaticMarkup(
    React.createElement(RoomContext.Provider, { value: room },
      React.createElement(TitleSlide, { venue: "teams", interactive: false }),
    ),
  );
  assert.match(teamsTitle, /Talk it through\./);
  assert.match(teamsTitle, /Let the evidence surprise you\./);
});

test("opening beats crossfade without leftover slide chrome", () => {
  const router = readFileSync(new URL("../../src/screens/ScreenRouter.tsx", import.meta.url), "utf8");
  const fade = readFileSync(new URL("../../src/ui/screen-fade.ts", import.meta.url), "utf8");
  assert.match(fade, /SCREEN_FADE_S = 0\.26/);
  assert.match(router, /from "\.\.\/ui\/screen-fade"/);
  assert.match(router, /duration: SCREEN_FADE_S/);
  assert.doesNotMatch(router, /duration: 0\.2[^\d]/);
  assert.doesNotMatch(router, /x: direction === "forward"/);
  assert.doesNotMatch(router, /y:\s*22/);
  assert.match(router, /activePhase === "locked"/);
});
