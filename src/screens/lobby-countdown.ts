/** Clock times that just passed still mean "starting soon." Older leftovers roll to tomorrow. */
const JUST_PASSED_MS = 10 * 60_000;

export function resolveLobbyStartMs(
  startTime?: number | string | null,
  nowMs: number = Date.now(),
): number | null {
  if (startTime === null || startTime === undefined || startTime === "") return null;
  let targetMs: number | null = null;
  if (typeof startTime === "number") targetMs = startTime;
  else {
    const trimmed = startTime.trim();
    if (/^\d+$/.test(trimmed)) targetMs = Number(trimmed);
    else if (/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.test(trimmed)) {
      const [, hours, minutes, seconds] = trimmed.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/)!;
      const target = new Date(nowMs);
      target.setHours(Number(hours), Number(minutes), Number(seconds ?? 0), 0);
      targetMs = target.getTime();
      if (targetMs < nowMs - JUST_PASSED_MS) targetMs += 24 * 60 * 60_000;
    } else {
      const parsed = Date.parse(trimmed);
      if (!Number.isNaN(parsed)) targetMs = parsed;
    }
  }
  if (targetMs === null || Number.isNaN(targetMs)) return null;
  return targetMs;
}

export function formatLobbyCountdown(
  startTime?: number | string | null,
  now?: number | Date,
): string | null {
  const nowMs = typeof now === "number" ? now : now instanceof Date ? now.getTime() : Date.now();
  const targetMs = resolveLobbyStartMs(startTime, nowMs);
  if (targetMs === null) return null;
  const deltaSeconds = Math.ceil((targetMs - nowMs) / 1000);
  if (deltaSeconds <= 0) return "STARTING SOON";
  const hours = Math.floor(deltaSeconds / 3600);
  const minutes = Math.floor((deltaSeconds % 3600) / 60);
  const seconds = deltaSeconds % 60;
  const pad = (value: number) => String(value).padStart(2, "0");
  return hours > 0 ? `STARTS IN ${hours}:${pad(minutes)}:${pad(seconds)}` : `STARTS IN ${pad(minutes)}:${pad(seconds)}`;
}
