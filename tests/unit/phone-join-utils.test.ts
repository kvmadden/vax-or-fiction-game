import test from "node:test";
import assert from "node:assert/strict";
import {
  assignedTeamForDevice,
  DIRECT_LINK_ROOM_ERROR,
  getOrCreateDeviceId,
  isJoinableRoomCode,
  joinRoomCodeError,
  sanitizeName,
  TYPED_ROOM_ERROR,
} from "../../src/phone/phone-join-utils";

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

test("phone join utilities preserve a returning attendee's stored device identity", () => {
  const local = new MemoryStorage();
  const session = new MemoryStorage();
  local.setItem("vof-device-id", "returning-device");

  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: local });
  Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: session });

  assert.equal(getOrCreateDeviceId(), "returning-device");
  assert.equal(local.getItem("vrc_device_id"), "returning-device");
});

test("phone join utilities keep name sanitization and deterministic team assignment", () => {
  assert.equal(sanitizeName(" \u202AAlex\u202C "), "Alex");
  assert.equal(assignedTeamForDevice("A"), "GOLD");
  assert.equal(assignedTeamForDevice("B"), "NAVY");
});

test("typed join accepts only the four-character host code", () => {
  assert.equal(joinRoomCodeError("AB23", "typed"), null);
  assert.equal(isJoinableRoomCode("AB23", "typed"), true);
  assert.equal(joinRoomCodeError("IO01", "typed"), TYPED_ROOM_ERROR);
  assert.equal(joinRoomCodeError("custom_room", "typed"), TYPED_ROOM_ERROR);
  assert.equal(isJoinableRoomCode("", "typed"), false);
});

test("address and QR join keep custom room IDs", () => {
  assert.equal(joinRoomCodeError("custom_room", "address"), null);
  assert.equal(isJoinableRoomCode("custom_room", "address"), true);
  assert.equal(joinRoomCodeError("AB23", "address"), null);
  assert.equal(joinRoomCodeError("bad room!", "address"), DIRECT_LINK_ROOM_ERROR);
});
