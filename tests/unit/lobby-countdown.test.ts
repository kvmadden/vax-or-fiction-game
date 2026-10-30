import assert from "node:assert/strict";
import test from "node:test";
import { formatLobbyCountdown, resolveLobbyStartMs } from "../../src/screens/lobby-countdown";

test("a same-day HH:MM that just passed says starting soon", () => {
  const now = Date.parse("2026-09-17T09:05:00");
  assert.equal(formatLobbyCountdown("09:00", now), "STARTING SOON");
});

test("an HH:MM after midnight rolls to tomorrow instead of starting soon", () => {
  const now = Date.parse("2026-09-17T23:50:00");
  const target = resolveLobbyStartMs("00:15", now);
  assert.ok(target !== null && target > now);
  assert.match(formatLobbyCountdown("00:15", now) ?? "", /STARTS IN/);
});

test("a live countdown formats minutes and hours", () => {
  const now = Date.parse("2026-09-17T09:00:00");
  assert.equal(formatLobbyCountdown("09:01:05", now), "STARTS IN 01:05");
  assert.equal(formatLobbyCountdown("11:00:00", now), "STARTS IN 2:00:00");
});
