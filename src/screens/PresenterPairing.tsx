import React, { useEffect, useLayoutEffect, useRef } from 'react';
import { QrCode } from './Lobby';
import { PAIRING_LEAD, PAIRING_PRIVATE } from '../phone/phone-live-copy';

export interface PresenterPairingProps {
  remoteUrl: string;
  paired: boolean;
  onContinue: () => void;
}

/**
 * Full-window private pairing. One hierarchy: title → line → QR → waiting.
 * Dark glass + gold VOF chrome. Keep off the projector until paired.
 *
 * A11Y-03: mounting this component IS the dialog opening (the parent conditionally renders it,
 * PresentationSuite.tsx), and unmounting it is the dialog closing, so a mount-effect plays the
 * role KeyboardHelpModal's isOpen effect plays there: autofocus the one focusable control
 * (Continue), trap Tab inside the dialog, and restore focus to whatever had it before the dialog
 * opened.
 *
 * A11Y-03 Escape (round 4, design call 2026-09-25, "Escape closes it"): Escape now closes the
 * dialog exactly like the Continue button, by calling the same onContinue. Unmounting still runs
 * this effect's own cleanup, which restores focus to whatever had it before the dialog opened, so
 * Escape and Continue share one close path and one focus-restore path.
 */
export const PresenterPairing: React.FC<PresenterPairingProps> = ({ remoteUrl, paired, onContinue }) => {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const continueButtonRef = useRef<HTMLButtonElement | null>(null);
  // PresentationSuite passes a fresh onContinue closure on every render, so the mount-effect below
  // (deliberately run-once: an empty dependency array so it captures the trigger element exactly
  // once) reads onContinue through this ref instead of depending on the prop directly. Depending
  // on it directly would re-run the effect on every parent render, re-capturing
  // document.activeElement as the trigger (by then the autofocused Continue button itself) and
  // breaking the focus-restore target. The assignment lives in its own layout effect, not the
  // render body, so it runs synchronously after each commit rather than during render itself.
  const onContinueRef = useRef(onContinue);
  useLayoutEffect(() => {
    onContinueRef.current = onContinue;
  });

  useEffect(() => {
    const triggerElement = typeof document !== 'undefined' ? (document.activeElement as HTMLElement | null) : null;
    const focusTimer = setTimeout(() => {
      continueButtonRef.current?.focus();
    }, 0);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onContinueRef.current();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (event.shiftKey) {
        if (document.activeElement === first || !dialogRef.current.contains(document.activeElement)) {
          event.preventDefault();
          last.focus();
        }
      } else if (document.activeElement === last || !dialogRef.current.contains(document.activeElement)) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      clearTimeout(focusTimer);
      window.removeEventListener('keydown', handleKeyDown);
      if (triggerElement && typeof triggerElement.focus === 'function') {
        triggerElement.focus();
      }
    };
  }, []);

  return (
    <div
      ref={dialogRef}
      className="presenter-pairing"
      data-role="presenter-pairing"
      data-paired={paired ? 'true' : 'false'}
      data-remote-link={remoteUrl}
      role="dialog"
      aria-labelledby="presenter-pairing-title"
      aria-modal="true"
    >
      <div className="presenter-pairing__panel">
        <p className="presenter-pairing__banner" data-role="presenter-pairing-banner">
          Private. Do not mirror this screen yet
        </p>
        <h1 id="presenter-pairing-title" className="presenter-pairing__title">
          Scan with your device
        </h1>
        <p className="presenter-pairing__lead">
          {PAIRING_LEAD}
        </p>
        <div className="presenter-pairing__qr" data-role="presenter-remote-qr" data-qr-kind="presenter-private">
          <span className="presenter-pairing__private" data-role="presenter-pairing-private">{PAIRING_PRIVATE}</span>
          <QrCode
            text={remoteUrl}
            size={320}
            className="presenter-remote-qr"
            ariaLabel="Private presenter controller QR. Not the audience join. Keep it off the projector."
          />
        </div>
        <p
          className="presenter-pairing__status"
          data-role="presenter-pairing-status"
          data-paired={paired ? 'true' : 'false'}
          role="status"
          aria-live="polite"
        >
          {paired ? 'Controller device connected.' : 'Waiting for your device...'}
        </p>
        <button
          type="button"
          ref={continueButtonRef}
          className="presenter-pairing__continue"
          data-role="presenter-pairing-continue"
          onClick={onContinue}
        >
          {paired ? 'Continue to audience setup' : "I've paired this device"}
        </button>
      </div>
    </div>
  );
};

export default PresenterPairing;
