import React, { useEffect, useState, useCallback, useRef } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useGameStore } from "../store/game-store";
import { useAudioStore } from "../engine/audio-store";
import { PRIMARY_SHORTCUTS, MORE_SHORTCUTS, arrowKeyAccessibleName, type ShortcutItem } from "./shortcuts";
import { cuePresenterKeyboardAction, tapUi } from "../engine/audio-cues";
import { slideAudioKind } from "../engine/audio-lifecycle";
import {
  ADVANCE,
  BACK,
  CLOSE_HELP,
  EXIT_FULLSCREEN,
  NAVIGATION_DEBOUNCE_MS,
  OPEN_HELP,
  REQUEST_FULLSCREEN,
  TOGGLE_AUDIO,
  mapKeyboardEvent,
  shouldPreventPresenterKeyDefault,
  shouldThrottleNavigation,
  type KeyboardAction,
  type KeyboardEventLike,
  type KeyboardStateLike,
} from "./keyboard-actions";
import { SCREEN_FADE_EASE, SCREEN_FADE_S } from "../ui/screen-fade";

export interface UseKeyboardControlsOptions {
  /**
   * Whether keyboard event listening is active.
   * @default true
   */
  enabled?: boolean;

  /**
   * State object or getter function returning current game state.
   * Defaults to reading reactively from Zustand store (`useGameStore.getState()`).
   */
  state?: KeyboardStateLike | (() => KeyboardStateLike);

  /**
   * Action dispatcher. Defaults to `useGameStore.getState().dispatch`.
   */
  dispatch?: (action: any) => void;

  /**
   * Custom action handler. Invoked whenever an action is mapped.
   * Return `false` to suppress default execution or store dispatch.
   */
  onAction?: (action: KeyboardAction, event: KeyboardEvent) => boolean | void;

  /** Custom fullscreen request handler override */
  onRequestFullscreen?: () => void;

  /** Custom fullscreen exit handler override */
  onExitFullscreen?: () => void;

  /** Custom audio toggle handler override */
  onToggleAudio?: () => void;

  /**
   * Event target or React ref to attach listener to.
   * Defaults to global `window`.
   */
  target?: Window | Document | HTMLElement | null | React.RefObject<HTMLElement | null>;

  /**
   * Whether to prevent browser default behavior for mapped navigation keys
   * (e.g. preventing page scroll on Space or Arrow keys).
   * @default true
   */
  preventDefault?: boolean;
}

export interface UseKeyboardControlsResult {
  /** Current fullscreen active status */
  isFullscreen: boolean;
  /** Request or exit fullscreen mode */
  toggleFullscreen: () => Promise<void>;
  /** Whether the help overlay is currently open in store */
  isHelpOpen: boolean;
  /** Open or close the shortcut help sheet */
  toggleHelp: () => void;
  /** Manually evaluate and execute a keyboard event */
  handleKeyboardEvent: (event: KeyboardEventLike) => KeyboardAction | null;
}

/**
 * useKeyboardControls
 *
 * Attaches keyboard navigation listeners to window or container,
 * delegating through mapKeyboardEvent to drive the VRC presentation state machine.
 */
function useKeyboardControls({
  enabled = true,
  state: stateProp,
  dispatch: dispatchProp,
  onAction,
  onRequestFullscreen,
  onExitFullscreen,
  onToggleAudio,
  target,
  preventDefault = true,
}: UseKeyboardControlsOptions = {}): UseKeyboardControlsResult {
  const storeDispatch = useGameStore((s) => s.dispatch);
  const isHelpOpen = useGameStore((s) => Boolean(s.help?.open));
  const lastNavDispatchRef = useRef<number>(0);

  const [isFullscreen, setIsFullscreen] = useState<boolean>(() => {
    if (typeof document !== "undefined") {
      return Boolean(document.fullscreenElement);
    }
    return false;
  });

  // Keep fullscreen state synchronized with DOM events
  useEffect(() => {
    if (typeof document === "undefined") return;
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, []);

  const toggleFullscreen = useCallback(async () => {
    if (typeof document === "undefined") return;
    if (document.fullscreenElement) {
      if (onExitFullscreen) {
        onExitFullscreen();
      } else if (document.exitFullscreen) {
        await document.exitFullscreen().catch(() => {});
      }
    } else {
      if (onRequestFullscreen) {
        onRequestFullscreen();
      } else if (document.documentElement?.requestFullscreen) {
        await document.documentElement.requestFullscreen().catch(() => {});
      }
    }
  }, [onRequestFullscreen, onExitFullscreen]);

  const toggleHelp = useCallback(() => {
    const activeDispatch = dispatchProp || storeDispatch;
    if (isHelpOpen) {
      activeDispatch({ type: CLOSE_HELP });
    } else {
      activeDispatch({ type: OPEN_HELP, returnFocusId: "presentation-stage" });
    }
  }, [dispatchProp, storeDispatch, isHelpOpen]);

  const handleKeyboardEvent = useCallback(
    (event: KeyboardEventLike): KeyboardAction | null => {
      let currentState: KeyboardStateLike;
      if (typeof stateProp === "function") {
        currentState = stateProp();
      } else if (stateProp) {
        currentState = stateProp;
      } else {
        currentState = useGameStore.getState();
      }

      const stateWithFullscreen: KeyboardStateLike = {
        ...currentState,
        fullscreenActive:
          isFullscreen ||
          Boolean(typeof document !== "undefined" && document.fullscreenElement),
        slideError:
          currentState.slideError === true ||
          Boolean(typeof document !== "undefined" && document.querySelector('[data-role="slide-error-boundary"]')),
        // NIT-9: PresenterPairing has no store flag, only its own mounted DOM (same pattern as
        // slideError above), and it traps Tab itself, so ? must not also open help under it.
        pairingOpen:
          currentState.pairingOpen === true ||
          Boolean(typeof document !== "undefined" && document.querySelector('[data-role="presenter-pairing"]')),
      };

      return mapKeyboardEvent(event, stateWithFullscreen);
    },
    [stateProp, isFullscreen]
  );

  // Attach keydown listener to window / target
  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (event: KeyboardEvent) => {
      let currentState: KeyboardStateLike;
      if (typeof stateProp === "function") {
        currentState = stateProp();
      } else if (stateProp) {
        currentState = stateProp;
      } else {
        currentState = useGameStore.getState();
      }

      const stateWithFullscreen: KeyboardStateLike = {
        ...currentState,
        fullscreenActive:
          isFullscreen ||
          Boolean(typeof document !== "undefined" && document.fullscreenElement),
        slideError:
          currentState.slideError === true ||
          Boolean(typeof document !== "undefined" && document.querySelector('[data-role="slide-error-boundary"]')),
        pairingOpen:
          currentState.pairingOpen === true ||
          Boolean(typeof document !== "undefined" && document.querySelector('[data-role="presenter-pairing"]')),
      };

      const action = mapKeyboardEvent(event, stateWithFullscreen);
      // Idle keys (setup, lobby, end screens) must still not scroll the ready sheet or stage.
      if (preventDefault && shouldPreventPresenterKeyDefault(event)) {
        event.preventDefault();
      }
      if (!action) return;

      if (action.type === ADVANCE || action.type === BACK) {
        const now = Date.now();
        if (shouldThrottleNavigation(lastNavDispatchRef.current, now, NAVIGATION_DEBOUNCE_MS)) {
          return;
        }
        lastNavDispatchRef.current = now;
      }

      if (onAction) {
        const intercept = onAction(action, event);
        if (intercept === false) return;
      }

      cuePresenterKeyboardAction(action.type, {
        phase: currentState.phase,
        votesLocked: Boolean(currentState.votesLocked),
        offlineMode: Boolean(currentState.offlineMode),
        slideType: slideAudioKind(Array.isArray(currentState.run) ? currentState.run[currentState.slideIndex] : null),
        run: Array.isArray(currentState.run) ? currentState.run : undefined,
        slideIndex: typeof currentState.slideIndex === "number" ? currentState.slideIndex : undefined,
      });

      const activeDispatch = dispatchProp || storeDispatch;

      switch (action.type) {
        case ADVANCE:
          activeDispatch(action);
          break;

        case BACK: {
          // WARNING-1 (premium-host-fix-4): the store's own 'BACK' case (game-store.ts) turns
          // the offline closing pager back a page instead of running its ordinary transition,
          // but that check is state-only (phase 'closing' + offlineMode). If Closing itself has
          // crashed (SlideErrorBoundary showing its fallback instead of Closing, so the pager
          // is not actually mounted), nothing is left to consume the closingBackStep bump this
          // dispatches and BACK goes dead with no way to recover. Same DOM-presence pattern this
          // file already uses for slideError above: dispatch the real transition directly
          // whenever the closing offline pager is not in the DOM to receive it.
          const closingWithNoPager = currentState.phase === "closing"
            && Boolean(currentState.offlineMode)
            && typeof document !== "undefined"
            && !document.querySelector('[data-role="closing-offline-pager"]');
          activeDispatch(closingWithNoPager ? { type: "BACK_FROM_CLOSING" } : action);
          break;
        }

        case REQUEST_FULLSCREEN:
          if (onRequestFullscreen) {
            onRequestFullscreen();
          } else if (
            typeof document !== "undefined" &&
            document.documentElement?.requestFullscreen
          ) {
            document.documentElement.requestFullscreen().catch(() => {});
          }
          break;

        case EXIT_FULLSCREEN:
          if (onExitFullscreen) {
            onExitFullscreen();
          } else if (
            typeof document !== "undefined" &&
            document.fullscreenElement &&
            document.exitFullscreen
          ) {
            document.exitFullscreen().catch(() => {});
          }
          break;

        case TOGGLE_AUDIO:
          if (onToggleAudio) {
            onToggleAudio();
          } else {
            useAudioStore.getState().toggleMute();
          }
          break;

        case OPEN_HELP:
          activeDispatch(action);
          break;

        case CLOSE_HELP: {
          activeDispatch(action);
          const returnId = currentState.help?.returnFocusId;
          if (typeof document !== "undefined" && returnId) {
            const el = document.getElementById(returnId);
            el?.focus?.();
          }
          break;
        }

        default:
          activeDispatch(action);
          break;
      }
    };

    let resolvedTarget: EventTarget | null = null;
    if (target && "current" in target) {
      resolvedTarget = target.current;
    } else if (target) {
      resolvedTarget = target;
    } else if (typeof window !== "undefined") {
      resolvedTarget = window;
    }

    if (!resolvedTarget) return;

    resolvedTarget.addEventListener("keydown", onKeyDown as EventListener);
    return () => {
      resolvedTarget?.removeEventListener("keydown", onKeyDown as EventListener);
    };
  }, [
    enabled,
    stateProp,
    dispatchProp,
    storeDispatch,
    onAction,
    onRequestFullscreen,
    onExitFullscreen,
    onToggleAudio,
    target,
    preventDefault,
    isFullscreen,
  ]);

  return {
    isFullscreen,
    toggleFullscreen,
    isHelpOpen,
    toggleHelp,
    handleKeyboardEvent,
  };
}

// ─── 5. SHORTCUT REFERENCE CHEAT SHEET MODAL ────────────────────────────────

/** One line of the sheet: key chips in mono gold, a plain label, a one-clause note. */
const ShortcutRow: React.FC<{ shortcut: ShortcutItem; primary?: boolean }> = ({ shortcut, primary = false }) => (
  <li
    data-role="shortcut-row"
    className={primary ? "shortcut-row shortcut-row--primary" : "shortcut-row"}
    style={{
      gap: "var(--kit-space-16)",
      minHeight: primary ? "56px" : "var(--kit-touch)",
      padding: "var(--kit-space-4) 0",
      borderBottom: primary ? "1px solid var(--color-hairline)" : "none",
    }}
  >
    <span className="shortcut-keys">
      {shortcut.keys.map((key, index) => (
        <React.Fragment key={key}>
          {index > 0 && (
            <span aria-hidden="true" style={{ color: "var(--color-ink-dim)", fontFamily: "var(--kit-font-mono)", fontSize: "16px" }}>
              {shortcut.keys.length === 2 && shortcut.keys[0] === "Shift" ? "+" : "·"}
            </span>
          )}
          <kbd
            className="shortcut-key"
            style={{
              minWidth: primary ? "44px" : "32px",
              height: primary ? "40px" : "32px",
              padding: "0 var(--kit-space-8)",
              backgroundColor: "var(--color-stage-deep)",
              color: "var(--color-gold)",
              border: "1px solid var(--color-hairline)",
              fontFamily: "var(--kit-font-mono)",
              fontSize: primary ? "22px" : "16px",
              fontWeight: 600,
            }}
          >
            {/* W10: a <kbd> has no ARIA role of its own, so an aria-label on it is not reliably
                read. Hide the arrow glyph from assistive tech and give it a real, visually hidden
                text name instead, which every screen reader reads regardless of role. */}
            {arrowKeyAccessibleName(key) ? (
              <>
                <span aria-hidden="true">{key}</span>
                <span className="sr-only">{arrowKeyAccessibleName(key)}</span>
              </>
            ) : key}
          </kbd>
        </React.Fragment>
      ))}
    </span>
    <span className="shortcut-copy">
      <span style={{ color: "var(--color-ink)", fontFamily: "var(--kit-font-sans)", fontSize: primary ? "24px" : "18px", fontWeight: 600, lineHeight: 1.2 }}>
        {shortcut.label}
      </span>
      <span style={{ color: "var(--color-ink-dim)", fontFamily: "var(--kit-font-sans)", fontSize: primary ? "18px" : "16px", lineHeight: 1.3 }}>
        {shortcut.description}
      </span>
    </span>
  </li>
);

/** The sheet body: five lines, then a More disclosure. Mounted with the sheet, so More resets on close. */
const HelpSheetBody: React.FC = () => {
  const [moreOpen, setMoreOpen] = useState(false);
  return (
    <div
      className="keyboard-help-sheet"
      data-role="keyboard-shortcut-list"
      style={{
        padding: "var(--kit-space-16) var(--kit-space-24) var(--kit-space-24)",
        backgroundColor: "var(--color-panel-navy)",
      }}
    >
      <ul
        data-role="keyboard-help-primary"
        style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "var(--kit-space-4)" }}
      >
        {PRIMARY_SHORTCUTS.map((shortcut) => (
          <ShortcutRow key={shortcut.label} shortcut={shortcut} primary />
        ))}
      </ul>

      <button
        type="button"
        data-role="keyboard-help-more"
        aria-expanded={moreOpen}
        onClick={() => { tapUi(); setMoreOpen((open) => !open); }}
        className="keyboard-help-more"
        style={{
          marginTop: "var(--kit-space-16)",
          minHeight: "var(--kit-touch)",
          padding: "0 var(--kit-space-12)",
          background: "transparent",
                  border: "1px solid var(--color-hairline)",
          color: "var(--color-ink-dim)",
          fontFamily: "var(--kit-font-sans)",
          fontSize: "18px",
          fontWeight: 600,
        }}
      >
        <span aria-hidden="true" style={{ fontFamily: "var(--kit-font-mono)" }}>{moreOpen ? "−" : "+"}</span>
        <span>{moreOpen ? "Fewer keys" : `More keys · ${MORE_SHORTCUTS.length}`}</span>
      </button>

      {moreOpen && (
        <ul
          data-role="keyboard-help-more-list"
          className="keyboard-help-more-list"
          style={{ listStyle: "none", margin: "var(--kit-space-12) 0 0", padding: 0, gap: "var(--kit-space-4) var(--kit-space-16)" }}
        >
          {MORE_SHORTCUTS.map((shortcut) => (
            <ShortcutRow key={shortcut.label} shortcut={shortcut} />
          ))}
        </ul>
      )}
    </div>
  );
};

export interface KeyboardHelpModalProps {
  isOpen: boolean;
  onClose: () => void;
  className?: string;
  style?: React.CSSProperties;
  triggerRef?: React.RefObject<HTMLElement | null>;
}

export const KeyboardHelpModal: React.FC<KeyboardHelpModalProps> = ({
  isOpen,
  onClose,
  className = "",
  style = {},
  triggerRef,
}) => {
  const shouldReduceMotion = useReducedMotion();
  const triggerRefInternal = useRef<HTMLElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const handleCloseHelp = useCallback(() => {
    tapUi();
    onClose();
  }, [onClose]);

  // WAI-ARIA Dialog Pattern: Focus trap, autoFocus, and focus restoration
  useEffect(() => {
    if (!isOpen) return;

    // Capture triggering element upon modal opening
    triggerRefInternal.current =
      triggerRef?.current || (document.activeElement as HTMLElement) || null;

    // The store's help.returnFocusId names the id an opener wants focus to land back on. It is
    // load-bearing for the compact More sheet's Shortcuts tile: that tile shares the sheet with
    // the sheet itself, and the sheet closes the moment help opens (HUD.tsx), so the captured
    // element above is already about to be removed from the DOM by the time this modal closes.
    // #hud-more, the button that actually opened the sheet the tile lived in, survives and is
    // what returnFocusId points at for that opener. Read once, at open time, not at close time,
    // so a later unrelated OPEN_HELP elsewhere cannot retarget an already-open sheet's close.
    const returnFocusId = useGameStore.getState().help?.returnFocusId ?? null;

    // 1. Move initial focus to the modal's primary action on open (autoFocus)
    const focusTimer = setTimeout(() => {
      if (closeButtonRef.current) {
        closeButtonRef.current.focus();
      } else if (dialogRef.current) {
        const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusable[0]) focusable[0].focus();
      }
    }, 0);
    const focusReturnTarget = triggerRef?.current || triggerRefInternal.current;

    // 2. Trap Tab and Shift+Tab cycling within focusable elements inside the modal
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "?") {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key === "Tab") {
        if (!dialogRef.current) return;
        const focusableElements = Array.from(
          dialogRef.current.querySelectorAll<HTMLElement>(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
          )
        );

        if (focusableElements.length === 0) {
          e.preventDefault();
          return;
        }

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (!firstElement || !lastElement) return;

        if (e.shiftKey) {
          if (
            document.activeElement === firstElement ||
            !dialogRef.current.contains(document.activeElement)
          ) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          if (
            document.activeElement === lastElement ||
            !dialogRef.current.contains(document.activeElement)
          ) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    // 3. Restore focus to the triggering button upon dismissal. An id target that is still in
    // the document wins over the captured element, since the captured element can itself have
    // been removed from the DOM by the time the sheet closes (the compact More sheet's case).
    return () => {
      clearTimeout(focusTimer);
      window.removeEventListener("keydown", handleKeyDown);
      const idTarget = returnFocusId && typeof document !== "undefined" ? document.getElementById(returnFocusId) : null;
      const target = idTarget && idTarget.isConnected ? idTarget : focusReturnTarget;
      if (target && typeof target.focus === "function") {
        target.focus();
        setTimeout(() => {
          if (target && typeof target.focus === "function") {
            target.focus();
          }
        }, 0);
      }
    };
  }, [isOpen, onClose, triggerRef]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="keyboard-help-overlay"
          initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{
            duration: shouldReduceMotion ? 0 : SCREEN_FADE_S,
            ease: SCREEN_FADE_EASE,
          }}
          role="dialog"
          aria-modal="true"
          aria-label="Keyboard Shortcuts"
          data-role="keyboard-help-modal"
          className={`keyboard-help-modal ${className}`}
          style={{
            // MOT-VQA-10: was an ad-hoc 82% color-mix and a hand-picked blur, inconsistent with
            // RestartRunModal's 85% and the evidence dialog's missing blur entirely. Points at
            // the same --kit-glass tokens all three now share.
            backgroundColor: "var(--kit-glass-fill-strong)",
            backdropFilter: "blur(var(--kit-glass-blur)) saturate(1.4)",
            ...style,
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              handleCloseHelp();
            }
          }}
        >
          <motion.div
            ref={dialogRef}
            initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{
              duration: shouldReduceMotion ? 0 : SCREEN_FADE_S,
              ease: SCREEN_FADE_EASE,
            }}
            className="keyboard-help-card"
            style={{
              backgroundColor: "var(--color-panel-navy)",
              borderColor: "var(--color-hairline)",
              boxShadow:
                "inset 0 1px 0 color-mix(in srgb, var(--color-light) 14%, transparent), 0 24px 48px color-mix(in srgb, var(--color-void) 60%, transparent)",
              fontFamily: "var(--kit-font-sans)",
            }}
          >
            {/* Header */}
            <div
              className="keyboard-help-header"
              style={{
                padding: "var(--kit-space-16) var(--kit-space-24)",
                borderColor: "var(--color-hairline)",
                backgroundColor: "var(--color-stage-deep)",
              }}
            >
              <div>
                <span
                  className="keyboard-help-kicker"
                  style={{
                    color: "var(--color-gold)",
                    fontFamily: "var(--kit-font-mono)",
                    fontSize: "16px",
                    letterSpacing: "0.20em",
                  }}
                >
                  Presenter
                </span>
                <h2
                  className="keyboard-help-title"
                  style={{ color: "var(--color-ink)", fontSize: "28px", margin: 0 }}
                >
                  Five keys run the show
                </h2>
              </div>

              {/* Close Button (min 44pt touch target). No `autoFocus`: React applies it during
                  commit, before the focus-restoration effect below runs, so it steals
                  document.activeElement out from under the capture and the sheet always
                  restored focus to itself instead of its opener. The effect's own focusTimer
                  moves focus here on the next tick, after the capture already ran. */}
              <button
                type="button"
                ref={closeButtonRef}
                onClick={handleCloseHelp}
                aria-label="Close shortcuts help"
                data-role="keyboard-help-close"
                className="keyboard-help-close"
                style={{
                  minWidth: "var(--kit-touch)",
                  minHeight: "var(--kit-touch)",
                  backgroundColor: "var(--color-canvas-navy)",
                  color: "var(--color-ink-muted)",
                  border: "1px solid var(--color-hairline)",
                }}
              >
                <span className="keyboard-help-close-mark">×</span>
              </button>
            </div>

            {/* Five lines that run the show; everything else behind More */}
            <HelpSheetBody />

            {/* Footer */}
            <div
              className="keyboard-help-footer"
              style={{
                padding: "var(--kit-space-12) var(--kit-space-24)",
                borderColor: "var(--color-hairline)",
                backgroundColor: "var(--color-stage-deep)",
                color: "var(--color-ink-dim)",
              }}
            >
              <span style={{ fontSize: "16px" }}>Keys work while the stage is focused.</span>
              <span style={{ fontFamily: "var(--kit-font-mono)", fontSize: "16px" }}>Esc or ? closes</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

// ─── 6. KEYBOARD COMPONENT ──────────────────────────────────────────────────

export interface KeyboardProps extends UseKeyboardControlsOptions {
  /** Whether to render the visual shortcut cheat-sheet modal when help is open. Default: true */
  renderHelpModal?: boolean;
  /** Custom CSS class name */
  className?: string;
  /** Custom inline style */
  style?: React.CSSProperties;
  /** Children wrapped by the Keyboard facilitator container */
  children?: React.ReactNode;
}

/**
 * Keyboard
 *
 * Facilitator keyboard controls component for Vax or Fiction.
 * Listens for hotkeys (porting keyboard.mjs) and drives presentation state,
 * with accessible shortcuts help modal overlay and full TypeScript support.
 */
export const Keyboard: React.FC<KeyboardProps> = ({
  renderHelpModal = true,
  className = "",
  style = {},
  children,
  ...controlOptions
}) => {
  const { isHelpOpen, toggleHelp } = useKeyboardControls(controlOptions);

  return (
    <div
      className={`vrc-keyboard-controller ${className}`}
      style={style}
      data-role="keyboard-controller"
    >
      {children}
      {renderHelpModal && (
        <KeyboardHelpModal
          isOpen={isHelpOpen}
          onClose={toggleHelp}
        />
      )}
    </div>
  );
};

export default Keyboard;
