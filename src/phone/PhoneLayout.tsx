import React, { useCallback, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Zap } from "lucide-react";
import type { ConnectionStatus } from '../network/protocol';
import { useWakeLock } from "./useWakeLock";
import type { UseWakeLockOptions, UseWakeLockResult } from "./useWakeLock";
import { ShowWordmark } from "../components/show/ShowWordmark";
import { triggerTactileFeedback } from "./phone-vote-utils";
import { tapUi } from "../engine/audio-cues";
import { SCREEN_FADE_EASE, SCREEN_FADE_S } from "../ui/screen-fade";

export type { UseWakeLockOptions, UseWakeLockResult };

/**
 * Announcement severity types.
 */
export type AnnouncementType = "info" | "success" | "warning" | "error" | "accent";

/**
 * Action button inside the announcer bar.
 */
export interface AnnouncementAction {
  label: string;
  onClick: () => void;
}

/**
 * Props for the PhoneLayout component.
 */
export interface PhoneLayoutProps {
  /** Main mobile screen contents (e.g. PhoneVote, questions, attendee views) */
  children: React.ReactNode;
  /** Custom title / branding header (defaults to "VAX OR FICTION") */
  title?: string;
  /** Room or session join code (e.g. "VF-104") */
  roomCode?: string;
  connectionStatus?: ConnectionStatus;
  /** The presenter's screen is away from the room; the chip says so instead of a green connected. */
  hostDown?: boolean;
  /** Attendee or player display nickname */
  attendeeName?: string;
  /**
   * Which mark the app bar carries: the inline compact wordmark, the classic's compact stacked mark (once a
   * participant is registered), or none when the screen's own hero mark is the one mark on screen (critique
   * item 23: one mark per screen). With "none" the hero wrapper carries the phone-branding hook instead.
   */
  brandMark?: "compact" | "stacked" | "none";
  /** One backdrop that survives Join: rendered under the bar and the content, never inside the content column. */
  backdrop?: React.ReactNode;
  /** Team assignment badge ('NAVY' | 'GOLD' | custom) */
  team?: "NAVY" | "GOLD" | string;
  /** Explicit notification message to display in the persistent announcer bar */
  announcement?: string | null;
  /** Semantic severity of the announcement */
  announcementType?: AnnouncementType;
  /** Eyebrow kicker / label displayed above the announcement body */
  announcementTitle?: string;
  /** Optional actionable button inside the announcer bar */
  announcementAction?: AnnouncementAction;
  /** Callback fired when user dismisses the announcement */
  onDismissAnnouncement?: () => void;
  /** Whether the announcement can be dismissed by the user (default: true if onDismiss given) */
  dismissibleAnnouncement?: boolean;
  /** Whether to enable the HTML5 Wake Lock API to prevent phone sleep (default: true) */
  enableWakeLock?: boolean;
  /** Callback triggered when wake lock status changes */
  onWakeLockChange?: (active: boolean) => void;
  /** Whether to render the wake lock toggle indicator in the header (default: true) */
  showWakeLockIndicator?: boolean;
  /** Custom element rendered in the header between wordmark and status */
  headerContent?: React.ReactNode;
  /** Custom actions rendered on the right side of the header */
  headerActions?: React.ReactNode;
  /** Custom persistent footer content rendered above bottom safe area */
  footer?: React.ReactNode;
  /** Whether to render the top header bar (default: true) */
  showHeader?: boolean;
  /** Whether to render the bottom footer bar (default: true) */
  showFooter?: boolean;
  /**
   * QUEUED-SCROLL: identifies which screen `children` is showing. The content box scrolls to top
   * whenever this changes, so a screen never opens part-scrolled from whatever the previous screen
   * left behind. Omit it on a layout whose content never changes screens.
   */
  scrollResetKey?: string | number;
  /** Additional CSS class name */
  className?: string;
  /** Inline style overrides */
  style?: React.CSSProperties;
}

/**
 * PhoneLayout
 *
 * Mobile-first presentation wrapper designed for attendees and voters on smartphones.
 * Features:
 * 1. Safe Area Insets: Full support for notch/Dynamic Island (top) and home indicator (bottom).
 * 2. Persistent Announcer Bar: Live notification drawer for broadcasts, phase updates, and alerts.
 * 3. HTML5 Wake Lock API: Keeps the phone awake throughout the game session, with auto re-acquisition.
 * 4. Responsive & Accessible: WCAG compliant 44px tap targets, high contrast tokens, zero inline hex.
 */
export const PhoneLayout: React.FC<PhoneLayoutProps> = React.memo(({
  children,
  title,
  roomCode: propRoomCode,
  connectionStatus,
  hostDown = false,
  attendeeName: propAttendeeName,
  brandMark = "compact",
  backdrop,
  team: propTeam,
  announcement: propAnnouncement,
  announcementType = "info",
  announcementTitle,
  announcementAction,
  onDismissAnnouncement,
  dismissibleAnnouncement,
  enableWakeLock = true,
  onWakeLockChange,
  showWakeLockIndicator = true,
  headerContent,
  headerActions,
  footer,
  showHeader = true,
  showFooter = true,
  scrollResetKey,
  className = "",
  style = {},
}) => {
  const shouldReduceMotion = useReducedMotion();
  const isLiveShell = className.split(/\s+/).includes("phone-live-shell");
  const isRemoteShell = className.split(/\s+/).includes("remote-shell");

  // MOT-VQA-01 / QUEUED-SCROLL: `scrollResetKey` names which screen is showing. Keying the content
  // box on it gives every screen change a fresh DOM node, which both starts scrolled to the top
  // (QUEUED-SCROLL, no separate effect needed) and lets framer-motion run its normal mount-time
  // enter transition (MOT-VQA-01) without wrapping `children` in an extra element: an extra layer
  // between .phone-app-content and its child would break phone-critique.css's `:has(> ...)`
  // finite-screens rule, which depends on that direct-child relationship. `firstScreenKey` captures
  // whatever key was current on this component's own first render, once, so that first screen (and
  // any re-render that has not yet changed screens) never animates in. Only a later, different key does.
  const [firstScreenKey] = useState(scrollResetKey);
  const isFirstScreen = scrollResetKey === firstScreenKey;

  const effectiveRoomCode = propRoomCode;

  // Wake Lock Hook
  const {
    isSupported: wakeLockSupported,
    isActive: wakeLockActive,
    toggle: toggleWakeLock,
  } = useWakeLock({
    enabled: enableWakeLock,
    onRequestSuccess: () => onWakeLockChange?.(true),
    onRelease: () => onWakeLockChange?.(false),
  });

  // Track user-dismissed announcement keys so new announcements re-appear
  const [dismissedKey, setDismissedKey] = useState<string | null>(null);
  const activeAnnouncement = propAnnouncement ?? null;

  // Check if current announcement was dismissed
  const isAnnouncementVisible = Boolean(
    activeAnnouncement && activeAnnouncement !== dismissedKey
  );

  const handleDismissAnnouncement = useCallback(() => {
    tapUi();
    triggerTactileFeedback();
    if (activeAnnouncement) {
      setDismissedKey(activeAnnouncement);
    }
    onDismissAnnouncement?.();
  }, [activeAnnouncement, onDismissAnnouncement]);

  const isDismissible = dismissibleAnnouncement ?? Boolean(onDismissAnnouncement);

  // Semantic styles for announcer bar
  const announcerStyles = useMemo(() => {
    switch (announcementType) {
      case "success":
        return {
          borderColor: "var(--color-verdict-true)",
          glyphColor: "var(--color-verdict-true)",
          glyph: "✓",
          badgeBg: "color-mix(in srgb, var(--color-verdict-true) 15%, transparent)",
        };
      case "warning":
        return {
          borderColor: "var(--color-time-warning)",
          glyphColor: "var(--color-time-warning)",
          glyph: "!",
          badgeBg: "color-mix(in srgb, var(--color-time-warning) 15%, transparent)",
        };
      case "error":
        return {
          borderColor: "var(--color-emphasis-red)",
          glyphColor: "var(--color-emphasis-red)",
          glyph: "×",
          badgeBg: "color-mix(in srgb, var(--color-emphasis-red) 15%, transparent)",
        };
      case "accent":
        return {
          borderColor: "var(--color-gold)",
          glyphColor: "var(--color-gold)",
          glyph: <Zap size={14} className="fill-current" />,
          badgeBg: "color-mix(in srgb, var(--color-anticipation-gold) 15%, transparent)",
        };
      case "info":
      default:
        return {
          borderColor: "var(--color-accent-cobalt)",
          glyphColor: "var(--color-accent-cobalt)",
          glyph: "·",
          badgeBg: "color-mix(in srgb, var(--color-accent-cobalt) 15%, transparent)",
        };
    }
  }, [announcementType]);

  // Team badge colors
  const teamColor = propTeam === "GOLD" ? "var(--color-gold)" : "var(--color-accent-cobalt)";

  return (
    <div
      className={`phone-shell phone-viewport-container phone-layout-container ${className || ""}`}
      data-role="phone-layout"
      data-wake-lock={wakeLockActive ? "active" : "idle"}
      data-screen="phone"
      style={{
        // A live phone is a finite device frame. `minHeight` alone lets children extend the
        // document and turns an answer/reveal into a browser-scroll surface.
        minHeight: isLiveShell ? 0 : "100dvh",
        height: isLiveShell ? "100dvh" : undefined,
        touchAction: "manipulation",
        overscrollBehaviorY: "contain",
        backgroundColor: "var(--color-stage-deep)",
        color: "var(--color-ink)",
        fontFamily: "var(--kit-font-sans)",
        display: "flex",
        flexDirection: "column",
        width: "100vw",
        maxWidth: "none",
        margin: 0,
        position: "relative",
        overflowX: "hidden",
        overflowY: isLiveShell ? "hidden" : undefined,
        boxSizing: "border-box",
        ...style,
      }}
    >
      {backdrop}

      {/* ── TOP HEADER / STATUS BAND (Safe area top: notch & Dynamic Island) ── */}
      {showHeader && (
        <header
          className="phone-app-bar"
          data-role="phone-header"
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "var(--kit-space-8)",
              minHeight: "var(--kit-touch)",
              flexWrap: "nowrap",
            }}
          >
            {/* Wordmark / Custom Title. "none" leaves the mark to the screen's hero (one mark per screen). */}
            {brandMark !== "none" && (
              <div
                data-role="phone-branding"
                data-mark={brandMark}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  fontSize: "15px",
                  fontWeight: 700,
                  letterSpacing: "0.04em",
                }}
              >
                {title ? (
                  <span>{title}</span>
                ) : brandMark === "stacked" ? (
                  <ShowWordmark stacked />
                ) : (
                  <ShowWordmark compact />
                )}
              </div>
            )}

            {/* Custom Header Content if injected. min-width: 0 lets a long pace readout (solo's own Run streak,
                Climb path or Best target) shrink instead of forcing the bar wider than the phone -- a flex item's
                default min-width is its own content size, not 0. */}
            {headerContent && <div style={{ flex: "1 1 auto", minWidth: 0 }}>{headerContent}</div>}

            {/* Header Right Status Band. It holds solo's own topic label next to the pace readout, and the
                label's own ellipsis truncation (solo.css) only takes effect once every flex ancestor between
                it and this row stops refusing to shrink. phone-live.css already sets this band's min-width: 0
                (and its flex: 1); the inline value below just keeps that in one place with the rest of this
                row's sizing, for the same isLiveShell condition. */}
            <div
              data-role="phone-status-band"
              data-leads={brandMark === "none" ? "true" : "false"}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--kit-space-4)",
                flex: isLiveShell ? "1 1 auto" : undefined,
                minWidth: isLiveShell ? 0 : undefined,
                justifyContent: isLiveShell ? "flex-end" : undefined,
              }}
            >
              {/* Room Code Badge */}
              {effectiveRoomCode && (
                <div
                  data-role="phone-room-chip"
                  style={{
                    fontSize: "14px",
                    fontWeight: 600,
                    fontFamily: "var(--kit-font-mono)",
                    letterSpacing: "0.08em",
                    color: "var(--color-ink-muted)",
                    backgroundColor: "var(--color-canvas-navy)",
                    padding: "4px 8px",
                    borderRadius: "var(--kit-space-4)",
                    border: "1px solid var(--color-hairline)",
                  }}
                >
                  <span className="sr-only">Room </span>{effectiveRoomCode}
                </div>
              )}

              {/* Participant name: the live bar carries it (critique item 11); the footer keeps its own copy. */}
              {isLiveShell && propAttendeeName && (
                <span data-role="phone-attendee-label" className="phone-bar-name">
                  <span className="sr-only">You: </span>{propAttendeeName}
                </span>
              )}

              {/* Team Assignment Pill */}
              {propTeam && (
                <div
                  data-role="phone-team-chip"
                  style={{
                    fontSize: "14px",
                    fontWeight: 700,
                    letterSpacing: "0.06em",
                    color: "var(--color-stage-deep)",
                    backgroundColor: teamColor,
                    padding: "4px 8px",
                    borderRadius: "var(--kit-space-4)",
                  }}
                >
                  {propTeam}
                </div>
              )}

              {/* Live Connection Dot */}
              {(connectionStatus || hostDown) && (
              <div
                data-role="phone-connection-status"
                data-host={hostDown ? "down" : "up"}
                aria-label={hostDown ? "The presenter's screen is away" : connectionStatus ? `Connection: ${connectionStatus}` : "Connection status unavailable"}
                title={hostDown ? "The presenter's screen is away" : connectionStatus ? `Connection: ${connectionStatus}` : "Connection status unavailable"}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                  fontSize: "14px",
                  color: hostDown ? "var(--color-gold)" : connectionStatus === "connected" || connectionStatus === "local rehearsal" ? "var(--color-verdict-true)" : connectionStatus === "connecting" || connectionStatus === "reconnecting" ? "var(--color-gold)" : "var(--color-ink-dim)",
                  padding: "4px 8px",
                }}
              >
                <span
                  style={{
                    display: "inline-block",
                    width: "10px",
                    height: "10px",
                    borderRadius: "50%",
                    backgroundColor: hostDown ? "var(--color-gold)" : connectionStatus === "connected" || connectionStatus === "local rehearsal" ? "var(--color-verdict-true)" : connectionStatus === "connecting" || connectionStatus === "reconnecting" ? "var(--color-gold)" : "var(--color-ink-dim)",
                  }}
                />
                <span className={isLiveShell ? "sr-only" : undefined}>{hostDown ? 'presenter away' : (connectionStatus ?? 'offline')}</span>
              </div>
              )}

              {/* Wake Lock Status Indicator / Toggle Button */}
              {showWakeLockIndicator && (
                <button
                  type="button"
                  data-role="wake-lock-status"
                  onClick={() => {
                    tapUi();
                    triggerTactileFeedback();
                    void toggleWakeLock();
                  }}
                  title={
                    wakeLockSupported
                      ? wakeLockActive
                        ? "Screen Wake Lock is ACTIVE (phone will not sleep). Tap to toggle."
                        : "Screen Wake Lock is INACTIVE. Tap to keep screen awake."
                      : "Wake Lock API is not supported on this browser."
                  }
                  aria-label={
                    wakeLockActive
                      ? "Screen Wake Lock is active - tap to toggle"
                      : "Screen Wake Lock is inactive - tap to keep screen awake"
                  }
                  style={{
                    minWidth: "var(--kit-touch)",
                    minHeight: "var(--kit-touch)",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "4px",
                    padding: "4px 8px",
                    backgroundColor: wakeLockActive ? "color-mix(in srgb, var(--color-accent-teal) 15%, transparent)" : "var(--color-canvas-navy)",
                    border: wakeLockActive ? "1px solid var(--color-vax)" : "1px solid var(--color-hairline)",
                    borderRadius: "var(--kit-space-4)",
                    color: wakeLockActive ? "var(--color-vax)" : "var(--color-ink-dim)",
                    cursor: wakeLockSupported ? "pointer" : "default",
                    fontSize: "14px",
                    fontFamily: "var(--kit-font-mono)",
                    fontWeight: 600,
                    transition: "color 150ms ease, border-color 150ms ease, background-color 150ms ease",
                  }}
                >
                  <Zap size={14} className={wakeLockActive ? "fill-current" : undefined} />
                  <span style={{ display: "none" }}>AWAKE</span>
                </button>
              )}

              {/* Extra Header Actions if provided */}
              {headerActions}
            </div>
          </div>
        </header>
      )}

      {/* ── PERSISTENT ANNOUNCER BAR (Live notifications / Facilitator captions) ── */}
      <AnimatePresence mode="wait">
        {isAnnouncementVisible && (
          <motion.section
            key={activeAnnouncement}
            data-role="announcer-bar"
            data-type={announcementType}
            role={announcementType === "error" ? "alert" : "status"}
            aria-live="polite"
            initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0 }}
            transition={{ duration: shouldReduceMotion ? 0.01 : SCREEN_FADE_S, ease: SCREEN_FADE_EASE }}
            style={{
              position: "sticky",
              top: showHeader ? "max(calc(env(safe-area-inset-top, 0px) + 52px), 56px)" : 0,
              zIndex: 25,
              paddingLeft: "max(env(safe-area-inset-left, 0px), 16px)",
              paddingRight: "max(env(safe-area-inset-right, 0px), 16px)",
              // Fresh-review finding: with no header (the remote, showHeader={false}), this bar
              // sticks at the very top of the viewport itself, so its own padding is the only
              // thing standing between it and the notch. With a header, the header already clears
              // the notch, and this bar sits below it, so the fixed 8px is enough either way.
              paddingTop: showHeader ? "8px" : "max(calc(env(safe-area-inset-top, 0px) + 8px), 8px)",
              paddingBottom: "8px",
              backgroundColor: "var(--color-stage-deep)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "var(--kit-space-12)",
                backgroundColor: "var(--color-panel-navy)",
                border: `1px solid ${announcerStyles.borderColor}`,
                boxShadow: "inset 0 1px 0 color-mix(in srgb, var(--color-light) 14%, transparent), 0 16px 32px color-mix(in srgb, var(--color-canvas-navy) 40%, transparent)",
                borderRadius: "var(--kit-radius-12)",
                padding: "12px 16px",
                minHeight: "48px",
                boxSizing: "border-box",
              }}
            >
              {/* Glyph Icon Badge */}
              <div
                data-role="announcer-icon"
                style={{
                  width: "28px",
                  height: "28px",
                  borderRadius: "var(--kit-space-8)",
                  backgroundColor: announcerStyles.badgeBg,
                  color: announcerStyles.glyphColor,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 700,
                  fontSize: "14px",
                  flexShrink: 0,
                }}
              >
                {announcerStyles.glyph}
              </div>

              {/* Announcer Text Content */}
              <div
                data-role="announcer-text-content"
                style={{
                  flex: "1 1 auto",
                  minWidth: 0,
                  display: "flex",
                  flexDirection: "column",
                  gap: "4px",
                }}
              >
                {announcementTitle && (
                  <div
                    data-role="announcer-title"
                    style={{
                      fontSize: "14px",
                      fontFamily: "var(--kit-font-mono)",
                      fontWeight: 700,
                      letterSpacing: "0.08em",
                      color: announcerStyles.glyphColor,
                      textTransform: "uppercase",
                    }}
                  >
                    {announcementTitle}
                  </div>
                )}
                <div
                  data-role="announcer-message"
                  style={{
                    fontSize: "14px",
                    fontWeight: 500,
                    color: "var(--color-ink)",
                    lineHeight: 1.35,
                    wordBreak: "break-word",
                  }}
                >
                  {activeAnnouncement}
                </div>
              </div>

              {/* Action Button if specified */}
              {announcementAction && (
                <button
                  type="button"
                  data-role="announcer-action"
                  onClick={() => {
                    tapUi();
                    triggerTactileFeedback();
                    announcementAction.onClick();
                  }}
                  style={{
                    minHeight: "var(--kit-touch)",
                    padding: "8px 12px",
                    borderRadius: "var(--kit-space-8)",
                    backgroundColor: "var(--color-canvas-navy)",
                    border: `1px solid ${announcerStyles.borderColor}`,
                    color: "var(--color-ink)",
                    fontSize: "14px",
                    fontWeight: 600,
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                    flexShrink: 0,
                  }}
                >
                  {announcementAction.label}
                </button>
              )}

              {/* Dismiss Button */}
              {isDismissible && (
                <button
                  type="button"
                  data-role="announcer-dismiss"
                  onClick={handleDismissAnnouncement}
                  aria-label="Dismiss notification"
                  style={{
                    minWidth: "var(--kit-touch)",
                    minHeight: "var(--kit-touch)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "transparent",
                    border: "none",
                    color: "var(--color-ink-dim)",
                    cursor: "pointer",
                    fontSize: "18px",
                    fontWeight: 700,
                    padding: 0,
                    flexShrink: 0,
                  }}
                >
                  ×
                </button>
              )}
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      {/* ── MAIN CONTENT VIEWPORT ── */}
      <motion.main
        key={scrollResetKey ?? 'static'}
        data-role="phone-content"
        className="phone-app-content phone-scroll-body"
        initial={isFirstScreen || shouldReduceMotion ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: shouldReduceMotion ? 0 : SCREEN_FADE_S, ease: SCREEN_FADE_EASE }}
        style={{
          flex: "1 1 auto",
          display: "flex",
          flexDirection: "column",
          width: "100%",
          paddingLeft: "max(env(safe-area-inset-left, 0px), 16px)",
          paddingRight: "max(env(safe-area-inset-right, 0px), 16px)",
          paddingTop: isRemoteShell ? "8px" : "16px",
          minHeight: 0,
          // QUEUED-COMMENTS: every live route scrolls here by default. Voting and reveal screens fit a
          // canonical phone with nothing to scroll, but a short or sideways phone that cannot fit them
          // scrolls instead of clipping (PHO-UIUX-01, src/styles/phone-critique.css). They are not a
          // fixed, page-based screen set. The presenter remote is the one exception that must never
          // scroll: cue text truncates instead.
          overflowY: isRemoteShell ? "hidden" : "auto",
          WebkitOverflowScrolling: isRemoteShell ? "auto" : "touch",
          boxSizing: "border-box",
        }}
      >
        {children}
      </motion.main>

      {/* ── BOTTOM BAR (Safe area bottom: home indicator / gesture bar) ── */}
      {showFooter && (
        <footer
          className="phone-app-footer"
          data-role="phone-footer"
        >
          {footer ? (
            footer
          ) : (
            <>
              <div
                data-role="phone-attendee-label"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                <span style={{ color: "var(--color-vax)" }}>·</span>
                <span>{propAttendeeName || "Participant"}</span>
              </div>
              <div
                data-role="phone-footer-branding"
                style={{
                  fontFamily: "var(--kit-font-mono)",
                  fontSize: "14px",
                  letterSpacing: "0.06em",
                  color: "var(--color-ink-dim)",
                }}
              >
                In session
              </div>
            </>
          )}
        </footer>
      )}
    </div>
  );
});

PhoneLayout.displayName = "PhoneLayout";

export default PhoneLayout;
