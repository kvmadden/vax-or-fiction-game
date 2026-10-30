import React, { useId, useLayoutEffect, useRef, type ReactNode } from "react";
import { useGameStore } from "../../store/game-store";
import { displayJoinHost } from "../../network/room";
import type { Citation } from "../../data/types";
import { describeSource } from "./source-line";
import { tapUi } from "../../engine/audio-cues";
import { EmphasizedText } from "../EmphasizedText";

export interface ShowChromeProps {
  roomId: string;
  joinHost: string;
  offline?: boolean;
  sourceLabel?: string;
  sourceCitation?: Citation | null;
  footerStatus?: ReactNode;
  evidenceVisible?: boolean;
  evidenceDetails?: {
    question: string;
    explanation: string;
    takeaway?: string;
    /** The authored phrases of each text above (EmphasizedText). */
    questionEmphasis?: string[];
    explanationEmphasis?: string[];
    takeawayEmphasis?: string[];
    // No presenter note: this dialog is on the shared stage (ruling 2026-09-15). Sources stay.
    citations: Citation[];
  };
  /** Opening title/instructions drop the join pill; lobby and live questions keep it. */
  showJoin?: boolean;
  children: ReactNode;
}

function safeEvidenceUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : undefined;
  } catch {
    return undefined;
  }
}

/** Store phases during which the room is still voting or has just locked: the source stays off the canvas. */
const OPEN_QUESTION_PHASES: ReadonlySet<string> = new Set(["entering", "deliberating", "timedOut", "locked"]);
export const ShowChrome: React.FC<ShowChromeProps> = React.memo(({
  roomId,
  joinHost,
  offline,
  sourceLabel,
  sourceCitation,
  footerStatus,
  evidenceVisible,
  evidenceDetails,
  showJoin = true,
  children,
}) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const footerRef = useRef<HTMLElement>(null);
  const detailsButtonRef = useRef<HTMLButtonElement>(null);
  const detailsId = useId();
  const storeOfflineMode = useGameStore((state) => Boolean(state.offlineMode));
  const storePhase = useGameStore((state) => state.phase);
  const storeCitation = useGameStore((state) => {
    const slide = state.run?.[state.slideIndex] as { citations?: Citation[]; source?: unknown } | undefined;
    const fromCitations = slide?.citations?.[0];
    if (fromCitations) return fromCitations;
    const source = slide?.source;
    return source && typeof source === "object" ? (source as Citation) : null;
  });
  // A review question is passed directly; its citation must never come from another store selection.
  const currentCitation = sourceCitation !== undefined ? sourceCitation : evidenceDetails ? evidenceDetails.citations[0] ?? null : storeCitation;
  const showDetails = evidenceVisible === true && Boolean(evidenceDetails);
  const detailsKey = evidenceDetails ? JSON.stringify(evidenceDetails) : "";
  useLayoutEffect(() => {
    if (dialogRef.current?.open) dialogRef.current.close();
  }, [detailsKey, evidenceVisible]);
  const offlineMode = offline ?? storeOfflineMode;
  const displayedJoinHost = typeof window === "undefined"
    ? displayJoinHost(joinHost)
    : displayJoinHost(window.location.origin);
  const hasJoinDetails = !offlineMode && Boolean(roomId || joinHost);
  const hasFooter = Boolean(sourceLabel || showDetails || footerStatus || (!offlineMode && roomId) || offlineMode);
  // VOF-21 keeps the room's attention on the statement while voting is open; the classic showed no source
  // until reveal. The footer element itself stays mounted so the presenter status slot can share it.
  const sourceVisible = Boolean(sourceLabel || showDetails) && (evidenceVisible ?? !OPEN_QUESTION_PHASES.has(String(storePhase)));
  const source = sourceVisible ? describeSource(sourceLabel, currentCitation) : null;
  useLayoutEffect(() => {
    const footer = footerRef.current;
    const frame = footer?.closest<HTMLElement>("[data-show-frame]");
    if (!footer || !frame) return;
    const priorHeight = frame.style.getPropertyValue("--show-footer-height");
    const priorPriority = frame.style.getPropertyPriority("--show-footer-height");
    const measure = () => {
      const height = `${footer.offsetHeight}px`;
      if (frame.style.getPropertyValue("--show-footer-height") !== height) {
        frame.style.setProperty("--show-footer-height", height);
      }
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(footer, { box: "border-box" });
    return () => {
      observer.disconnect();
      if (priorHeight) frame.style.setProperty("--show-footer-height", priorHeight, priorPriority);
      else frame.style.removeProperty("--show-footer-height");
    };
  }, [hasFooter]);

  return (
    <>
      <header className="show-header" data-show-chrome>
        {hasJoinDetails && showJoin ? (
          <aside
            className="join-card show-join-pill"
            aria-label={`${displayedJoinHost || "This screen"} · Join a game${roomId ? ` · ${roomId}` : ""}`}
          >
            {displayedJoinHost ? (
              <span className="show-join-pill__host">
                {displayedJoinHost}
                <span className="show-join-pill__label">· Join a game</span>
              </span>
            ) : null}
            {roomId ? <strong className="join-card__code">{roomId}</strong> : null}
          </aside>
        ) : null}
      </header>
      <div className="show-content">{children}</div>
      {hasFooter ? (
        <footer ref={footerRef} className="show-footer">
          {source ? (
            <span className="show-footer__context show-source-pill" data-role="source-pill" aria-label={`Reviewed evidence · ${source.org}${source.verified ? ` · verified ${source.verified}` : ""}`}>
              <span className="show-source-pill__label">Reviewed evidence</span>
              <span className="show-source-pill__org">{source.org}</span>
              {source.verified ? <span className="show-source-pill__verified">Verified {source.verified}</span> : null}
            </span>
          ) : <span className="show-footer__context show-footer__context--pending" data-role="source-pill" data-pending="true" />}
          {footerStatus}
          {showDetails && (
            <button
              ref={detailsButtonRef}
              type="button"
              className="show-evidence-trigger"
              aria-haspopup="dialog"
              aria-controls={detailsId}
              onClick={() => { tapUi(); dialogRef.current?.showModal(); }}
            >Details &amp; sources</button>
          )}
          {offlineMode ? <span className="show-footer__offline-badge" data-role="offline-mode-badge">HANDS-UP PLAY</span> : null}
          {!offlineMode && roomId && !footerStatus ? <span className="show-footer__room">ROOM {roomId}</span> : null}
        </footer>
      ) : null}
      {showDetails && evidenceDetails && (
        <dialog
          ref={dialogRef}
          id={detailsId}
          className="show-evidence-dialog"
          aria-labelledby={`${detailsId}-title`}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key !== "Tab") return;
            const controls = event.currentTarget.querySelectorAll<HTMLElement>("button:not([disabled]), a[href]");
            const first = controls[0];
            const last = controls[controls.length - 1];
            if ((event.shiftKey && document.activeElement === first) || (!event.shiftKey && document.activeElement === last)) {
              event.preventDefault();
              (event.shiftKey ? last : first)?.focus();
            }
          }}
          onClose={() => detailsButtonRef.current?.focus()}
        >
          <header className="show-evidence-dialog__header">
            <h2 id={`${detailsId}-title`}>Details &amp; sources</h2>
            <button type="button" className="show-evidence-close" onClick={() => { tapUi(); dialogRef.current?.close(); }}>Close</button>
          </header>
          <div className="show-evidence-dialog__body">
            <p className="show-evidence-question"><EmphasizedText text={evidenceDetails.question} phrases={evidenceDetails.questionEmphasis} /></p>
            {evidenceDetails.takeaway?.trim() && evidenceDetails.takeaway.trim() !== evidenceDetails.explanation?.trim() && (
              <section aria-label="Takeaway">
                <h3>Takeaway</h3>
                <p><EmphasizedText text={evidenceDetails.takeaway} phrases={evidenceDetails.takeawayEmphasis} /></p>
              </section>
            )}
            <section aria-label="Full explanation">
              <h3>Full explanation</h3>
              <p><EmphasizedText text={evidenceDetails.explanation} phrases={evidenceDetails.explanationEmphasis} /></p>
            </section>
            {evidenceDetails.citations.length > 0 && (
              <section aria-label="Sources">
                <h3>Sources</h3>
                <ul className="show-evidence-sources">
                  {evidenceDetails.citations.map((citation, index) => {
                    const href = safeEvidenceUrl(citation.url);
                    const label = citation.shortDisplayLine || citation.publisher || "Source";
                    return <li key={`${citation.id ?? index}:${label}`}>
                      {href ? <a href={href} target="_blank" rel="noopener noreferrer">{label}</a> : <span>{label}</span>}
                    </li>;
                  })}
                </ul>
              </section>
            )}
          </div>
        </dialog>
      )}
    </>
  );
});

ShowChrome.displayName = "ShowChrome";

export default ShowChrome;
