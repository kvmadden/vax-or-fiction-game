import React, { useEffect, useId } from "react";
import { Check } from "lucide-react";
import { tapUi } from "../engine/audio-cues";
import { LOOKS, type LookId } from "./look";
import { LookSample } from "./LookSample";
import { LookThumb } from "./LookThumb";
import { preloadLookPictures } from "./use-look-picture";

export interface LooksPickerProps {
  /** The look in force. */
  look: LookId;
  onPick: (look: LookId) => void;
  /** Whether topic patterns draw behind the questions (VOF-94). */
  patterns: boolean;
  onPatterns: (on: boolean) => void;
  onBack: () => void;
  headingRef?: React.Ref<HTMLHeadingElement>;
}

/**
 * The look picker, on its own screen under More options like the quick setups (VOF-93). The four looks stand in a column
 * of cards, each with a still of that look's real stage, and beside them the picked look is shown large on a sample
 * question, with the topic patterns switch (VOF-94) under it, since the switch changes what the sample shows. Picking a
 * card applies it at once: the sample changes, and the big screen wears the look from the lobby on. Setup itself stays in
 * Today's calm navy in every look (looks.css), so the picked look shows once on this screen, in the sample, as the owner
 * ruled on 2026-10-05 (docs/VOF-DECISION-LEDGER.md). Today is the default for a first game, and this device remembers
 * what the host picks and whether patterns are on.
 */
export const LooksPicker: React.FC<LooksPickerProps> = React.memo(({ look, onPick, patterns, onPatterns, onBack, headingRef }) => {
  const id = useId();
  // The big screen's three pictures start loading now, so the sample and the game the host starts next find them ready.
  useEffect(() => preloadLookPictures("stage"), []);
  return (
    <div className="setup-setups setup-looks" data-role="setup-looks">
      <h1 className="setup-title" id={`${id}-title`} ref={headingRef} tabIndex={-1}>Look</h1>
      <div className="setup-sheet-actions">
        <button className="setup-glass-button" type="button" onClick={() => { tapUi(); onBack(); }}>Back</button>
      </div>
      <p className="setup-setups-intro">Pick how the big screen looks. This device remembers it for your next game.</p>
      <div className="setup-looks-body">
        <div className="setup-setups-grid setup-looks-grid" role="radiogroup" aria-labelledby={`${id}-title`}>
          {LOOKS.map((info) => (
            <label key={info.id} className="setup-look" data-look-option={info.id}>
              <input
                type="radio"
                name={`${id}-look`}
                value={info.id}
                checked={info.id === look}
                onChange={() => onPick(info.id)}
              />
              <LookThumb look={info.id} />
              <span className="setup-look-check" aria-hidden="true"><Check /></span>
              <span className="setup-look-name">{info.label}</span>
              <span className="setup-look-line">{info.line}</span>
            </label>
          ))}
        </div>
        <LookSample />
        <div className="setup-sheet-rows setup-looks-patterns">
          <button
            className="setup-sheet-switch"
            type="button"
            role="switch"
            aria-checked={patterns}
            aria-label="Topic patterns"
            aria-describedby={`${id}-patterns-hint`}
            data-role="setup-patterns"
            onClick={() => { tapUi(); onPatterns(!patterns); }}
          >
            <span className="setup-sheet-switch-text">
              <span className="setup-sheet-switch-label">Topic patterns</span>
              <span className="setup-sheet-switch-hint" id={`${id}-patterns-hint`}>Soft patterns behind each question, matched to its topic</span>
            </span>
            <span className="setup-sheet-track" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
});

LooksPicker.displayName = "LooksPicker";

export default LooksPicker;
