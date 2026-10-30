import React, { useId } from 'react';
import { Check, Layers, Palette, PhoneOff } from 'lucide-react';
import type { FormatId, Venue } from '../data/types';
import { tapUi } from '../engine/audio-cues';
import { showdownPlayable } from '../store/game-store';

/** The sheet's switches, in the order the host reads them down the page. */
export type SheetSwitchKey = 'sound' | 'timer' | 'countdown' | 'reactions' | 'scores' | 'teams' | 'finale';

interface SheetSwitch {
  key: SheetSwitchKey;
  label: string;
  hint: string;
}

const STAGE_SWITCHES: SheetSwitch[] = [
  { key: 'sound', label: 'Music and sound', hint: 'Lobby music and stage cues' },
  { key: 'timer', label: 'Answer timer', hint: 'Counts down each vote' },
  { key: 'countdown', label: 'Lobby countdown', hint: 'Counts down to your start' },
];

/** Each of these needs phone voting, so a hands-up game sets them aside. */
const PHONE_SWITCHES: SheetSwitch[] = [
  { key: 'reactions', label: 'Audience reactions', hint: 'Reactions from phones' },
  { key: 'scores', label: 'Top 5 scores', hint: 'Ranks the top five players' },
  { key: 'teams', label: 'Two teams', hint: 'Navy and Gold teams' },
  { key: 'finale', label: 'Final challenge', hint: 'Top two play a last round' },
];

export interface SheetQuestionSet {
  id: string;
  label: string;
  meta: string;
}

export interface SheetFormat {
  id: FormatId;
  label: string;
  ratio: string;
}

export interface OptionsSheetProps {
  venue: Venue;
  /** True when phones can vote: a Teams or In the room game with phone voting on. */
  phones: boolean;
  questionSets: SheetQuestionSet[];
  modeId: string;
  /** Preflight's local preset state (defaults to curated15), so the finale switch's visibility
      can never disagree with showdownPlayable() (VOF-W4V: Curated 8 and Curated 15 never open
      Showdown). vax-or-fiction-final-challenge-test-gaps-after-the-curated-8: this used to say
      "the store's own active preset", which Preflight.tsx never passes here. */
  activePresetId?: string | null;
  onSelectMode: (modeId: string) => void;
  formats: SheetFormat[];
  formatId: FormatId;
  onSelectFormat: (formatId: FormatId) => void;
  switches: Record<SheetSwitchKey, boolean>;
  onToggle: (key: SheetSwitchKey) => void;
  startTime: string;
  onStartTime: (time: string) => void;
  notice?: string | null;
  liveLine?: React.ReactNode;
  onOpenQuickSetups: () => void;
  /** The name of the show look in force, shown on the Look button (VOF-93). */
  lookName: string;
  onOpenLooks: () => void;
  onDone: () => void;
  onOpenLobby: () => void;
  headingRef?: React.Ref<HTMLHeadingElement>;
  quickSetupsRef?: React.Ref<HTMLButtonElement>;
  looksRef?: React.Ref<HTMLButtonElement>;
}

/**
 * More options as one sheet on the ready screen's stage. Settings show only when they apply:
 * the phone settings step aside for a hands-up game, and the start time shows only while the
 * lobby countdown is on.
 */
export const OptionsSheet: React.FC<OptionsSheetProps> = React.memo(({
  venue,
  phones,
  questionSets,
  modeId,
  activePresetId = null,
  onSelectMode,
  formats,
  formatId,
  onSelectFormat,
  switches,
  onToggle,
  startTime,
  onStartTime,
  notice = null,
  liveLine = null,
  onOpenQuickSetups,
  lookName,
  onOpenLooks,
  onDone,
  onOpenLobby,
  headingRef,
  quickSetupsRef,
  looksRef,
}) => {
  const id = useId();
  const phoneSwitches = PHONE_SWITCHES.filter((item) => (
    item.key !== 'finale' || (showdownPlayable({ modeId, activePresetId }) && venue !== 'room')
  ));
  const renderSwitch = ({ key, label, hint }: SheetSwitch) => (
    <button
      key={key}
      className="setup-sheet-switch"
      type="button"
      role="switch"
      aria-checked={switches[key]}
      aria-label={label}
      aria-describedby={`${id}-${key}-hint`}
      onClick={() => onToggle(key)}
    >
      <span className="setup-sheet-switch-text">
        <span className="setup-sheet-switch-label">{label}</span>
        <span className="setup-sheet-switch-hint" id={`${id}-${key}-hint`}>{hint}</span>
      </span>
      <span className="setup-sheet-track" aria-hidden="true" />
    </button>
  );

  return (
    <div className="setup-sheet" data-venue={venue}>
      <h1 className="setup-title" ref={headingRef} tabIndex={-1}>More options</h1>
      <div className="setup-sheet-actions">
        <button className="setup-glass-button" type="button" ref={quickSetupsRef} onClick={onOpenQuickSetups}>
          <Layers aria-hidden="true" />
          Quick setups
        </button>
        <button className="setup-glass-button" type="button" ref={looksRef} data-role="setup-look" onClick={onOpenLooks}>
          <Palette aria-hidden="true" />
          Look: {lookName}
        </button>
        <button className="setup-glass-button" type="button" onClick={() => { tapUi(); onDone(); }}>Done</button>
      </div>

      <div className="setup-sheet-groups">
        <section className="setup-sheet-group" aria-labelledby={`${id}-game`}>
          <h2 id={`${id}-game`}>The game</h2>
          <div className="setup-sheet-field">
            <span className="setup-sheet-legend" id={`${id}-questions`}>Questions</span>
            <div className="setup-sheet-tiles" role="radiogroup" aria-labelledby={`${id}-questions`} data-count={questionSets.length}>
              {questionSets.map((set) => (
                <label key={set.id} className="setup-sheet-choice">
                  <input
                    type="radio"
                    name={`${id}-questions`}
                    value={set.id}
                    checked={set.id === modeId}
                    onChange={() => onSelectMode(set.id)}
                  />
                  <span className="setup-sheet-choice-name">{set.label}</span>
                  <span className="setup-sheet-choice-meta">{set.meta}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="setup-sheet-field">
            <span className="setup-sheet-legend" id={`${id}-shape`}>Screen shape</span>
            <div className="setup-sheet-shapes" role="radiogroup" aria-labelledby={`${id}-shape`}>
              {formats.map((format) => (
                <label key={format.id} className="setup-sheet-choice">
                  <input
                    type="radio"
                    name={`${id}-shape`}
                    value={format.id}
                    checked={format.id === formatId}
                    aria-label={`${format.label} ${format.ratio}`}
                    onChange={() => onSelectFormat(format.id)}
                  />
                  <span className="setup-sheet-shape" data-shape={format.id} aria-hidden="true" />
                  <span className="setup-sheet-ratio" aria-hidden="true">{format.ratio}</span>
                </label>
              ))}
            </div>
          </div>
        </section>

        <section className="setup-sheet-group" aria-labelledby={`${id}-stage`}>
          <h2 id={`${id}-stage`}>Sound and time</h2>
          <div className="setup-sheet-rows">{STAGE_SWITCHES.map(renderSwitch)}</div>
          {switches.countdown ? (
            <div className="setup-sheet-time">
              <label htmlFor={`${id}-start`}>Start at</label>
              <input
                id={`${id}-start`}
                type="time"
                value={startTime}
                onChange={(event) => onStartTime(event.target.value)}
              />
            </div>
          ) : null}
        </section>

        <section className="setup-sheet-group" aria-labelledby={`${id}-phones`}>
          <h2 id={`${id}-phones`}>With phones</h2>
          {phones ? (
            <div className="setup-sheet-rows">{phoneSwitches.map(renderSwitch)}</div>
          ) : (
            <div className="setup-sheet-quiet" data-role="phones-off">
              <PhoneOff aria-hidden="true" />
              <strong>{venue === 'offline' ? 'Offline games play hands up' : 'This game plays hands up'}</strong>
              <p>
                {venue === 'offline'
                  ? 'Reactions, Top 5 scores, two teams and the final challenge need phone voting. Choose Online meeting or In the room on the ready screen to turn it on.'
                  : 'Reactions, Top 5 scores, two teams and the final challenge need phone voting. Use Quick setups for a phone-voting game, or pick Offline and then Online meeting or In the room.'}
              </p>
            </div>
          )}
        </section>
      </div>

      <div className="setup-sheet-footer">
        {liveLine}
        <div className="setup-sheet-footer-end">
          <p className="setup-sheet-notice">
            {notice ? (
              <>
                <Check aria-hidden="true" />
                {notice}
              </>
            ) : null}
          </p>
          <button className="setup-sheet-lobby" type="button" onClick={onOpenLobby}>Open the lobby</button>
        </div>
      </div>
    </div>
  );
});

OptionsSheet.displayName = 'OptionsSheet';

export interface QuickSetup {
  id: string;
  name: string;
  description: string;
  chips: string[];
}

export interface QuickSetupsProps {
  setups: QuickSetup[];
  activeId?: string | null;
  note?: string | null;
  onUse: (id: string) => void;
  onBack: () => void;
  headingRef?: React.Ref<HTMLHeadingElement>;
}

/** The quick setups on their own screen. Using one sets everything it lists, then returns to the sheet. */
export const QuickSetups: React.FC<QuickSetupsProps> = React.memo(({
  setups,
  activeId = null,
  note = null,
  onUse,
  onBack,
  headingRef,
}) => {
  const id = useId();
  return (
    <div className="setup-setups">
      <h1 className="setup-title" ref={headingRef} tabIndex={-1}>Quick setups</h1>
      <div className="setup-sheet-actions">
        <button className="setup-glass-button" type="button" onClick={() => { tapUi(); onBack(); }}>Back</button>
      </div>
      <p className="setup-setups-intro">Each one sets the questions, screen, venue, timer and voting at once.</p>
      <div className="setup-setups-grid" data-count={setups.length}>
        {setups.map((setup) => {
          // The last one used says so in words as well as in gold.
          const active = setup.id === activeId;
          const action = active ? 'Use again' : 'Use this';
          return (
            <article
              key={setup.id}
              className="setup-setup"
              data-active={active || undefined}
              aria-current={active || undefined}
              aria-labelledby={`${id}-${setup.id}`}
            >
              <div className="setup-setup-head">
                <h2 id={`${id}-${setup.id}`}>{setup.name}</h2>
                <button
                  className="setup-glass-button setup-setup-use"
                  type="button"
                  aria-label={`${action}: ${setup.name}`}
                  onClick={() => onUse(setup.id)}
                >
                  {action}
                </button>
              </div>
              <p>{setup.description}</p>
              <ul aria-label={`What ${setup.name} sets`}>
                {setup.chips.map((chip) => <li key={chip}>{chip}</li>)}
              </ul>
            </article>
          );
        })}
        {note ? <p className="setup-setups-note">{note}</p> : null}
      </div>
    </div>
  );
});

QuickSetups.displayName = 'QuickSetups';

export default OptionsSheet;
