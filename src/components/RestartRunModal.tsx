import React, { useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { useGameStore } from "../store/game-store";
import { tapUi } from "../engine/audio-cues";
import { RotateCcw, X, AlertTriangle } from "lucide-react";
import { SCREEN_FADE_EASE, SCREEN_FADE_S } from "../ui/screen-fade";

export interface RestartRunModalProps {
  /** Optional override for modal open state (defaults to store `restartRunConfirmationOpen`) */
  isOpen?: boolean;
  /** Optional custom confirm callback (defaults to dispatching `CONFIRM_RESTART_RUN`) */
  onConfirm?: () => void;
  /** Optional custom cancel callback (defaults to dispatching `CANCEL_RESTART_RUN`) */
  onCancel?: () => void;
  /** Optional custom class name */
  className?: string;
}

/**
 * RestartRunModal
 *
 * High-contrast confirmation modal displayed when the facilitator requests
 * a run restart (via hotkey Shift+R or UI control).
 * Adheres strictly to the design system tokens, 44px min touch targets,
 * WCAG 2.1 AA contrast requirements, and reduced motion preferences.
 */
export const RestartRunModal: React.FC<RestartRunModalProps> = React.memo(({
  isOpen: propIsOpen,
  onConfirm: propOnConfirm,
  onCancel: propOnCancel,
  className = "",
}) => {
  const storeIsOpen = useGameStore((s) => Boolean(s.restartRunConfirmationOpen));
  const storeDispatch = useGameStore((s) => s.dispatch);
  const shouldReduceMotion = useReducedMotion();

  const isModalOpen = propIsOpen !== undefined ? propIsOpen : storeIsOpen;

  const cancelRef = useRef<HTMLButtonElement | null>(null);
  const confirmRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  const handleConfirm = useCallback(() => {
    tapUi();
    if (propOnConfirm) {
      propOnConfirm();
    } else {
      storeDispatch({ type: "CONFIRM_RESTART_RUN" });
    }
  }, [propOnConfirm, storeDispatch]);

  const handleCancel = useCallback(() => {
    tapUi();
    if (propOnCancel) {
      propOnCancel();
    } else {
      storeDispatch({ type: "CANCEL_RESTART_RUN" });
    }
  }, [propOnCancel, storeDispatch]);

  // Escape cancels. Tab stays inside the dialog so Space cannot fire HUD Skip/Park.
  useEffect(() => {
    if (!isModalOpen) return;

    triggerRef.current = (document.activeElement as HTMLElement) || null;
    const focusTimer = setTimeout(() => {
      cancelRef.current?.focus();
    }, 50);

    const focusable = () => Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) ?? [],
    );

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        handleCancel();
        return;
      }
      if (e.key === "Tab") {
        const nodes = focusable();
        if (nodes.length === 0) {
          e.preventDefault();
          return;
        }
        const firstElement = nodes[0];
        const lastElement = nodes[nodes.length - 1];
        if (!firstElement || !lastElement) return;
        if (e.shiftKey) {
          if (document.activeElement === firstElement || !dialogRef.current?.contains(document.activeElement)) {
            e.preventDefault();
            lastElement.focus();
          }
        } else if (document.activeElement === lastElement || !dialogRef.current?.contains(document.activeElement)) {
          e.preventDefault();
          firstElement.focus();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      clearTimeout(focusTimer);
      window.removeEventListener("keydown", handleKeyDown);
      const target = triggerRef.current;
      if (target && typeof target.focus === "function") target.focus();
    };
  }, [isModalOpen, handleCancel]);

  return (
    <AnimatePresence>
      {isModalOpen && (
        <motion.div
          key="restart-run-modal-backdrop"
          initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{
            duration: shouldReduceMotion ? 0 : SCREEN_FADE_S,
            ease: SCREEN_FADE_EASE,
          }}
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="restart-modal-title"
          aria-describedby="restart-modal-description"
          data-role="restart-run-modal"
          className={`restart-run-modal ${className}`}
          style={{
            // MOT-VQA-10: was an ad-hoc 85% color-mix and a hand-picked blur, inconsistent with
            // the Keyboard help modal's 82% and the evidence dialog's missing blur entirely.
            // Points at the same --kit-glass tokens all three now share.
            backgroundColor: "var(--kit-glass-fill-strong)",
            backdropFilter: "blur(var(--kit-glass-blur)) saturate(1.4)",
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              handleCancel();
            }
          }}
        >
          <motion.div
            initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{
              duration: shouldReduceMotion ? 0 : SCREEN_FADE_S,
              ease: SCREEN_FADE_EASE,
            }}
            className="restart-run-card"
            style={{
              backgroundColor: "var(--color-panel-navy)",
              borderColor: "var(--color-hairline)",
              borderRadius: "var(--kit-radius-16)",
              boxShadow:
                "inset 0 1px 0 color-mix(in srgb, var(--color-light) 14%, transparent), 0 24px 48px color-mix(in srgb, var(--color-void) 60%, transparent)",
              fontFamily: "var(--kit-font-sans)",
            }}
          >
            {/* Modal Header */}
            <div
              className="restart-run-header"
              style={{
                padding: "var(--kit-space-16) var(--kit-space-24)",
                borderColor: "var(--color-hairline)",
                backgroundColor: "var(--color-stage-deep)",
              }}
            >
              <div className="restart-run-title-row">
                <div
                  className="restart-run-mark"
                  style={{
                    width: "var(--kit-touch)",
                    height: "var(--kit-touch)",
                    backgroundColor: "var(--color-canvas-navy)",
                    color: "var(--color-emphasis-red)",
                    border: "1px solid var(--color-hairline)",
                  }}
                  aria-hidden="true"
                >
                  <AlertTriangle className="restart-icon" />
                </div>
                <div>
                  <h2
                    id="restart-modal-title"
                    className="restart-run-title"
                    style={{
                      color: "var(--color-ink)",
                      letterSpacing: "-0.02em",
                    }}
                  >
                    Restart this run?
                  </h2>
                  <p
                    className="restart-run-kicker"
                    style={{
                      color: "var(--color-gold)",
                      letterSpacing: "0.1em",
                    }}
                  >
                    Needs a second look
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleCancel}
                aria-label="Close modal without restarting"
                className="restart-run-close"
                style={{
                  width: "var(--kit-touch)",
                  height: "var(--kit-touch)",
                  color: "var(--color-ink-dim)",
                  backgroundColor: "transparent",
                  border: "none",
                }}
              >
                <X className="restart-icon" />
              </button>
            </div>

            {/* Modal Body */}
            <div
              className="restart-run-body"
              style={{
                padding: "var(--kit-space-24)",
                backgroundColor: "var(--color-panel-navy)",
              }}
            >
              <p
                id="restart-modal-description"
                className="restart-run-copy"
                style={{ color: "var(--color-ink-muted)" }}
              >
                This resets votes, the timer, and slide progress to the start of the run.
              </p>

              <div
                className="restart-run-note"
                style={{
                  backgroundColor: "var(--color-canvas-navy)",
                  borderColor: "var(--color-hairline)",
                }}
              >
                <div
                  className="restart-run-note-icon"
                  style={{
                    backgroundColor: "var(--color-stage-deep)",
                    color: "var(--color-gold)",
                  }}
                >
                  <RotateCcw className="restart-icon restart-icon--xs" />
                </div>
                <div className="restart-run-note-copy" style={{ color: "var(--color-ink-dim)" }}>
                  <strong style={{ color: "var(--color-ink)" }}>
                    What stays and what resets:{" "}
                  </strong>
                  People on phones stay in the room. Scores and answers on this run reset.
                </div>
              </div>
            </div>

            {/* Modal Actions Footer */}
            <div
              className="restart-run-footer"
              style={{
                padding: "var(--kit-space-16) var(--kit-space-24)",
                borderColor: "var(--color-hairline)",
                backgroundColor: "var(--color-stage-deep)",
              }}
            >
              <button
                ref={cancelRef}
                type="button"
                onClick={handleCancel}
                data-action="cancel-restart"
                className="restart-run-cancel"
                style={{
                  minHeight: "var(--kit-touch)",
                  paddingLeft: "var(--kit-space-24)",
                  paddingRight: "var(--kit-space-24)",
                  backgroundColor: "var(--color-canvas-navy)",
                  color: "var(--color-ink)",
                  border: "1px solid var(--color-hairline)",
                }}
              >
                Cancel
              </button>

              <button
                ref={confirmRef}
                type="button"
                onClick={handleConfirm}
                data-action="confirm-restart"
                className="restart-run-confirm"
                style={{
                  minHeight: "var(--kit-touch)",
                  paddingLeft: "var(--kit-space-24)",
                  paddingRight: "var(--kit-space-24)",
                  backgroundColor: "var(--color-danger-button-bg)",
                  color: "var(--color-light)",
                  border: "1px solid color-mix(in srgb, var(--color-light) 20%, transparent)",
                }}
              >
                <RotateCcw className="restart-icon restart-icon--sm" />
                <span>Restart</span>
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
});

RestartRunModal.displayName = "RestartRunModal";

export default RestartRunModal;
