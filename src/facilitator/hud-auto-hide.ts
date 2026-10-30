export const DEFAULT_AUTO_HIDE_DELAY_MS = 2500;

// HUD-COMPACT: below this measured bar width the utilities cluster (Skip, Park, Timer, Sound,
// Full screen, Pin, Shortcuts, Hide) no longer fits alongside Back, Lock and the gold primary, so
// it moves into the More sheet instead. Derived from the row it replaces: 8 ghost buttons at their
// 48px minimum (384px) plus 7 gaps of 8px (56px) plus the bar's own 16px side padding (32px) is
// 472px. 480px rounds that up with a few px of slack. Measured against the bar element itself
// (hudElementRef), not the viewport, because a portrait-format host caps the bar to 400px wide
// even on a much wider desktop viewport (question-chrome.css, "body:has([data-format=portrait])").
export const HUD_COMPACT_THRESHOLD_PX = 480;

export function getInitialHudVisibility(innerWidth?: number): boolean {
  return typeof innerWidth === "number" ? innerWidth <= 600 : false;
}

export function shouldRevealFromPointer(audiencePresentation: boolean): boolean {
  return !audiencePresentation;
}

export interface HUDAutoHideControllerOptions {
  autoHideDelay?: number;
  onHide: () => void;
  isPinned?: boolean;
  isHovered?: boolean;
  isFocused?: boolean;
  isSuppressed?: boolean;
  isVisible?: boolean;
  throttleMs?: number;
}

export class HUDAutoHideController {
  public autoHideDelay: number;
  public onHide: () => void;
  public isPinned: boolean;
  public isHovered: boolean;
  public isFocused: boolean;
  public isSuppressed: boolean;
  public isVisible: boolean;
  public throttleMs: number;

  private timer: ReturnType<typeof setTimeout> | null = null;
  private lastActivityTime = 0;

  constructor(options: HUDAutoHideControllerOptions) {
    this.autoHideDelay = options.autoHideDelay ?? DEFAULT_AUTO_HIDE_DELAY_MS;
    this.onHide = options.onHide;
    this.isPinned = options.isPinned ?? false;
    this.isHovered = options.isHovered ?? false;
    this.isFocused = options.isFocused ?? false;
    this.isSuppressed = options.isSuppressed ?? false;
    this.isVisible = options.isVisible ?? true;
    this.throttleMs = options.throttleMs ?? 250;
    this.resetTimer();
  }

  public updateState(state: {
    autoHideDelay?: number;
    isPinned?: boolean;
    isHovered?: boolean;
    isFocused?: boolean;
    isSuppressed?: boolean;
    isVisible?: boolean;
  }): void {
    let needsReset = false;
    if (state.autoHideDelay !== undefined && state.autoHideDelay !== this.autoHideDelay) {
      this.autoHideDelay = state.autoHideDelay;
      needsReset = true;
    }
    if (state.isPinned !== undefined && state.isPinned !== this.isPinned) {
      this.isPinned = state.isPinned;
      needsReset = true;
    }
    if (state.isHovered !== undefined && state.isHovered !== this.isHovered) {
      this.isHovered = state.isHovered;
      needsReset = true;
    }
    if (state.isFocused !== undefined && state.isFocused !== this.isFocused) {
      this.isFocused = state.isFocused;
      needsReset = true;
    }
    if (state.isSuppressed !== undefined && state.isSuppressed !== this.isSuppressed) {
      this.isSuppressed = state.isSuppressed;
      needsReset = true;
    }
    if (state.isVisible !== undefined && state.isVisible !== this.isVisible) {
      this.isVisible = state.isVisible;
      needsReset = true;
    }
    if (needsReset) this.resetTimer();
  }

  public clearTimer(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  public resetTimer(): void {
    this.clearTimer();
    if (
      this.isVisible &&
      !this.isPinned &&
      !this.isHovered &&
      !this.isFocused &&
      !this.isSuppressed
    ) {
      this.timer = setTimeout(() => {
        this.onHide();
        this.timer = null;
      }, this.autoHideDelay);
    }
  }

  public handleActivity(force = false): boolean {
    const now = Date.now();
    if (!force && now - this.lastActivityTime < this.throttleMs) return false;
    this.lastActivityTime = now;
    this.resetTimer();
    return true;
  }

  public isTimerActive(): boolean {
    return this.timer !== null;
  }

  public dispose(): void {
    this.clearTimer();
  }
}
