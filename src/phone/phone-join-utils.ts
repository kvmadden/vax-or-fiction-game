import { isManualRoomCode, isRoomId } from "../network/room";
import type { JoinProfile } from "../network/protocol";

export const DIRECT_LINK_ROOM_ERROR =
  "Enter a room ID using letters, numbers, underscores, or hyphens.";
export const TYPED_ROOM_ERROR =
  "Enter the four-character code shown on the screen (no I, O, 0 or 1).";

export type JoinRoomCodeSource = "address" | "typed";

/** Address/QR keeps custom room IDs. Typed entry uses the four-character host code. */
export function joinRoomCodeError(code: string, source: JoinRoomCodeSource): string | null {
  const trimmed = code.trim();
  if (source === "typed") return isManualRoomCode(trimmed) ? null : TYPED_ROOM_ERROR;
  return isRoomId(trimmed) ? null : DIRECT_LINK_ROOM_ERROR;
}

export function isJoinableRoomCode(code: string, source: JoinRoomCodeSource): boolean {
  return joinRoomCodeError(code, source) === null;
}

let memoryDeviceId: string | null = null;

export function getOrCreateDeviceId(): string {
  if (memoryDeviceId) return memoryDeviceId;

  try {
    const stored = localStorage.getItem("vrc_device_id") || localStorage.getItem("vof-device-id");
    if (stored) {
      memoryDeviceId = stored;
      try {
        localStorage.setItem("vrc_device_id", stored);
      } catch {
        // The recovered in-memory ID remains valid when storage is read-only.
      }
      return stored;
    }
  } catch {
    // Local storage can be unavailable in private browsing.
  }

  try {
    const stored = sessionStorage.getItem("vrc_device_id") || sessionStorage.getItem("vof-device-id");
    if (stored) {
      memoryDeviceId = stored;
      try {
        sessionStorage.setItem("vrc_device_id", stored);
      } catch {
        // The recovered in-memory ID remains valid when storage is read-only.
      }
      return stored;
    }
  } catch {
    // Session storage can be unavailable in private browsing.
  }

  const id = crypto.randomUUID();
  memoryDeviceId = id;
  try {
    localStorage.setItem("vrc_device_id", id);
  } catch {
    // Keep the generated ID in memory when local storage is unavailable.
  }
  try {
    sessionStorage.setItem("vrc_device_id", id);
  } catch {
    // Keep the generated ID in memory when session storage is unavailable.
  }
  return id;
}

export function sanitizeName(name: string): string {
  return name.replace(/[\u200E-\u200F\u202A-\u202E\u2066-\u2069]/g, "").trim();
}

export function assignedTeamForDevice(deviceId: string): NonNullable<JoinProfile["team"]> {
  const total = Array.from(deviceId).reduce(
    (sum, character) => sum + character.charCodeAt(0),
    0,
  );
  return total % 2 === 0 ? "NAVY" : "GOLD";
}
