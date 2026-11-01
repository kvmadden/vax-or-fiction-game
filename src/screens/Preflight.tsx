import React, { useState, useCallback, useLayoutEffect, useMemo, useRef } from 'react';
import {
  FormatId,
  Venue,
  PreFlightViewModel,
  InteractionMode,
} from '../data/types';
import { tapUi } from '../engine/audio-cues';
import { useAudioStore } from '../engine/audio-store';
import { CURATED8_QUESTION_IDS, useGameStore } from '../store/game-store';
import { DEFAULT_DECK_ID, offeredModes, resolveBundledDeck } from '../data/decks';
import { useRoom } from '../presentation/RoomContext';
import { displayJoinHost, joinUrl, resolveJoinOrigin } from '../network/room';
import { QrCode } from './Lobby';
import { ShowFrame } from '../components/show/ShowFrame';
import { OptionsSheet, QuickSetups, type SheetSwitchKey } from './OptionsSheet';
import { phonesCanVote } from './setup-polling';
import { useHostLook } from '../looks/host-look';
import { lookLabel, type LookId } from '../looks/look';
import { LooksPicker } from '../looks/LooksPicker';
// ============================================================================
// TYPES & PROPS
// ============================================================================

export interface PreflightProps {
  /** Optional view model override */
  viewModel?: Partial<PreFlightViewModel>;
  /** Callback fired when launching lobby */
  onLaunchLobby?: () => void;
  /** Active format */
  format?: FormatId;
  /** Callback to change format */
  onSelectFormat?: (format: FormatId) => void;
  /** Active mode identifier */
  modeId?: string;
  /** Callback to change mode */
  onSelectMode?: (modeId: string) => void;
  /** Active venue */
  venue?: Venue;
  /** Callback to change venue */
  onSelectVenue?: (venue: Venue) => void;
  /** Active preset id */
  activePresetId?: string | null;
  /** Callback to apply preset */
  onApplyPreset?: (presetId: string) => void;
  /** Whether the presenter phone remote is paired */
  presenterRemotePaired?: boolean;
  /** Re-open the private presenter-remote QR (keep this off the projector) */
  onShowPresenterRemote?: () => void;
  /** Generic toggle handler */
  onToggle?: (setting: string, value?: boolean) => void;
  /** Additional CSS class names */
  className?: string;
}

/** Setup shows one view at a time: the ready screen, the More options sheet, its quick setups, or its look picker. */
type PreflightView = 'ready' | 'sheet' | 'setups' | 'looks';
/** Where focus lands after the view changes, so a keyboard never sits on a control that just left. */
type ViewFocus = 'heading' | 'more-options' | 'quick-setups' | 'looks';

// Built-in curated presets
interface CuratedPresetConfig {
  id: string;
  name: string;
  description: string;
  modeId: string;
  formatId: FormatId;
  venue: Venue;
  timerEnabled: boolean;
  twoTeams: boolean;
  leaderboardEnabled: boolean;
  polling: boolean;
}

const DEFAULT_CURATED_PRESETS: CuratedPresetConfig[] = [
  {
    id: 'curated8',
    name: 'Curated 8',
    description: 'The show. Eight questions, phone voting, and standings after question 4.',
    modeId: 'curated8',
    formatId: 'widescreen',
    venue: 'room',
    timerEnabled: true,
    twoTeams: false,
    leaderboardEnabled: true,
    polling: true,
  },
  {
    id: 'curated15',
    name: 'Curated 15',
    description: 'Fifteen questions in the room, with phone voting and standings along the way.',
    modeId: 'curated15',
    formatId: 'widescreen',
    venue: 'room',
    timerEnabled: true,
    twoTeams: false,
    leaderboardEnabled: true,
    polling: true,
  },
  {
    id: 'rehearsal',
    name: 'Practice run',
    description: 'Rehearse Curated 8 on your own, with presenter notes.',
    modeId: 'rehearsal',
    formatId: 'widescreen',
    venue: 'offline',
    timerEnabled: true,
    twoTeams: false,
    leaderboardEnabled: false,
    polling: false,
  },
];

const FORMAT_OPTIONS: Array<{ id: FormatId; label: string; ratio: string }> = [
  { id: 'widescreen', label: 'Widescreen', ratio: '16:9' },
  { id: 'square', label: 'Square', ratio: '1:1' },
  { id: 'portrait', label: 'Portrait', ratio: '9:16' },
];

interface ModeOption { id: string; label: string; count: number }

/**
 * The show deck's host list is Curated 8, Curated 15, and the Quick demo, plus a practice run of
 * Curated 8. Full and Lightning stay in the deck file and are not offered. Other decks keep their
 * authored modes.
 */
export function hostModeOptions(deckId: string | null | undefined): ModeOption[] {
  const deck = resolveBundledDeck(deckId) ?? resolveBundledDeck(DEFAULT_DECK_ID)!;
  if (deck.modes.curated15 && deck.modes.demo) {
    // Curated 8 and the practice run play CURATED8_QUESTION_IDS (VOF-85), no longer the first eight of Curated 15.
    const eight = CURATED8_QUESTION_IDS.length;
    return [
      { id: 'curated8', label: 'Curated 8', count: eight },
      { id: 'curated15', label: deck.modes.curated15.label, count: deck.modes.curated15.questionIds.length },
      { id: 'demo', label: deck.modes.demo.label, count: deck.modes.demo.questionIds.length },
      { id: 'rehearsal', label: 'Practice run', count: eight },
    ];
  }
  const authored = offeredModes(deck).map((mode) => ({
    id: mode.id,
    label: mode.label,
    count: mode.questionIds.length,
  }));
  const rehearsalSource = deck.modes.full ?? offeredModes(deck)[0];
  return [
    ...authored,
    { id: 'rehearsal', label: 'Practice run', count: rehearsalSource?.questionIds.length ?? 0 },
  ];
}

/** The 'teams' id is wire and store state; the label is generic because hosts present on Zoom and Meet too. */
const VENUE_NAMES: Record<Venue, string> = { teams: 'Online meeting', room: 'In the room', offline: 'Offline' };

/** A11Y-13: the venue radiogroup's three options, id first so arrow-key selection can walk them. */
const VENUE_OPTIONS: readonly [Venue, string, string][] = [
  ['teams', VENUE_NAMES.teams, 'Link or room code'],
  ['room', VENUE_NAMES.room, 'QR or room code'],
  ['offline', VENUE_NAMES.offline, 'Hands up, no phones'],
];

/** A start time for a new lobby countdown: at least ten minutes out, on the next quarter hour, as HH:MM. */
function suggestedStartTime(now = new Date()): string {
  const quarter = 15 * 60_000;
  const at = new Date(Math.ceil((now.getTime() + 10 * 60_000) / quarter) * quarter);
  const pad = (value: number) => String(value).padStart(2, '0');
  return pad(at.getHours()) + ':' + pad(at.getMinutes());
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export const Preflight: React.FC<PreflightProps> = React.memo(({
  viewModel,
  onLaunchLobby: propOnLaunchLobby,
  format: propFormat,
  onSelectFormat,
  modeId: propModeId,
  onSelectMode,
  venue: propVenue,
  onSelectVenue,
  activePresetId: propActivePresetId,
  onApplyPreset,
  onToggle,
  presenterRemotePaired = false,
  onShowPresenterRemote,
  className = '',
}) => {
  // Store integration with fallbacks
  const storeState = useGameStore();
  const dispatch = storeState.dispatch;
  const room = useRoom();

  // One view at a time. Focus follows the view, so a keyboard never sits on a control that just left.
  const [view, setView] = useState<PreflightView>('ready');
  const screenRef = useRef<HTMLElement | null>(null);
  const moreOptionsRef = useRef<HTMLButtonElement | null>(null);
  const quickSetupsRef = useRef<HTMLButtonElement | null>(null);
  const looksRef = useRef<HTMLButtonElement | null>(null);
  const viewHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const focusAfterView = useRef<ViewFocus | null>(null);

  useLayoutEffect(() => {
    const setupStage = screenRef.current?.closest('.presenter-setup-stage');
    if (setupStage instanceof HTMLElement) setupStage.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    const focus = focusAfterView.current;
    focusAfterView.current = null;
    if (focus === 'heading') viewHeadingRef.current?.focus();
    else if (focus === 'more-options') moreOptionsRef.current?.focus();
    else if (focus === 'quick-setups') quickSetupsRef.current?.focus();
    else if (focus === 'looks') looksRef.current?.focus();
  }, [view]);

  const showView = useCallback((next: PreflightView, focus: ViewFocus) => {
    focusAfterView.current = focus;
    setView(next);
  }, []);

  // Active format, mode, venue
  const [internalFormat, setInternalFormat] = useState<FormatId>('widescreen');
  const activeFormat = propFormat ?? viewModel?.formatChoices?.[0]?.id ?? storeState.formatId ?? internalFormat;

  const modeOptions = useMemo(() => hostModeOptions(storeState.selectedDeckId ?? storeState.deckId), [storeState.selectedDeckId, storeState.deckId]);
  const [internalModeId, setInternalModeId] = useState<string>(() => modeOptions[0]?.id ?? 'full');
  const activeModeId = propModeId ?? storeState.modeId ?? internalModeId;

  const [internalVenue, setInternalVenue] = useState<Venue>('teams');
  const activeVenue = propVenue ?? internalVenue;

  // Preset manager state
  const [activePresetId, setActivePresetId] = useState<string | null>(propActivePresetId ?? storeState.activePresetId ?? 'curated15');

  // Runtime feature toggle states. The sheet reads the store, so a quick setup or a new question set shows at once.
  const audioMuted = useAudioStore((state) => state.muted);
  const setAudioMuted = useAudioStore((state) => state.setMuted);
  // Store + venue are the single source: a huddle remount must stay hands-up, Offline stays off,
  // and a fresh Teams host starts polling because that is now the store default.
  const storeInteractionMode = viewModel?.interactionMode ?? storeState.interactionMode;
  const pollingMode = phonesCanVote(activeVenue, storeInteractionMode);
  const startTime = String(storeState.startTime ?? '');
  const countdownOn = startTime !== '';
  const [setupNotice, setSetupNotice] = useState<string | null>(null);
  // Reactions and teams are each two store fields that toggle together, so either one on reads as on.
  const sheetSwitches: Record<SheetSwitchKey, boolean> = {
    sound: !audioMuted,
    timer: storeState.timer?.enabled ?? true,
    countdown: countdownOn,
    reactions: Boolean(storeState.stageReactionsEnabled || storeState.reactionTickerEnabled),
    scores: Boolean(storeState.leaderboardEnabled),
    teams: Boolean(storeState.twoTeams || storeState.teamsEnabled),
    finale: Boolean(storeState.showdownEnabled),
  };
  // Phone settings apply only when phones can vote: a Teams or In the room game with phone voting on.
  const phonesInPlay = activeVenue !== 'offline' && pollingMode;

  const handleLaunchLobby = useCallback(() => {
    tapUi();
    dispatch({ type: 'SET_INTERACTION_MODE', mode: (pollingMode ? 'polling' : 'facilitator') as InteractionMode });
    if (propOnLaunchLobby) propOnLaunchLobby();
    else dispatch({ type: 'ENTER_LOBBY' });
  }, [propOnLaunchLobby, dispatch, pollingMode]);

  // Format / Mode / Venue selection. Preset apply reuses these without a second ui-tap.
  const applyFormat = useCallback((f: FormatId) => {
    if (onSelectFormat) onSelectFormat(f);
    setInternalFormat(f);
    dispatch({ type: 'SELECT_FORMAT', formatId: f });
  }, [onSelectFormat, dispatch]);

  const applyMode = useCallback((m: string) => {
    if (onSelectMode) onSelectMode(m);
    setInternalModeId(m);
    dispatch({ type: 'SELECT_MODE', modeId: m });
  }, [onSelectMode, dispatch]);

  const applyVenue = useCallback((v: Venue) => {
    if (onSelectVenue) onSelectVenue(v);
    setInternalVenue(v);
    if (v === 'offline') {
      dispatch({ type: 'SET_INTERACTION_MODE', mode: 'facilitator' as InteractionMode });
      dispatch({ type: 'SET_OFFLINE_MODE', enabled: true });
    } else if (v === 'teams' || v === 'room') {
      dispatch({ type: 'SET_INTERACTION_MODE', mode: 'polling' as InteractionMode });
      dispatch({ type: 'SET_OFFLINE_MODE', enabled: false });
    }
  }, [onSelectVenue, dispatch]);

  const handleSelectFormat = useCallback((f: FormatId) => {
    tapUi();
    applyFormat(f);
  }, [applyFormat]);

  const handleSelectMode = useCallback((m: string) => {
    tapUi();
    applyMode(m);
  }, [applyMode]);

  const handleSelectVenue = useCallback((v: Venue) => {
    tapUi();
    applyVenue(v);
  }, [applyVenue]);

  // A11Y-13 RULED by VOF-46 (round 3, W1): role="radio" without arrow-key selection is a real
  // WAI-ARIA mismatch, but VOF-46 rules that "the arrows, PageUp, PageDown, Space, Enter and S do
  // nothing" on setup. Round 1 (05b8ffb) added arrow-key selection here before that ruling landed
  // through a verified channel. A clicker's ArrowRight could flip the venue (and, via
  // applyInRoomWalkinMutePolicy, unmute a Teams show anyone watching the share could hear). Fixed
  // by removing the arrow-key handler and its roving tabindex, restoring Tab+Enter/Space as the
  // way to reach and activate every option (2.1.1 Keyboard was never actually violated).

  // Preset Application
  const handleApplyPreset = useCallback((presetId: string) => {
    tapUi();
    setActivePresetId(presetId);
    if (onApplyPreset) onApplyPreset(presetId);

    const foundCurated = DEFAULT_CURATED_PRESETS.find((p) => p.id === presetId);
    if (foundCurated) {
      applyFormat(foundCurated.formatId);
      applyMode(foundCurated.modeId);
      applyVenue(foundCurated.venue);

      dispatch({ type: 'APPLY_PRESET', presetId });
      dispatch({ type: 'SET_TEAMS_ENABLED', enabled: foundCurated.twoTeams });
      dispatch({ type: 'SET_LEADERBOARD_ENABLED', enabled: foundCurated.leaderboardEnabled });
      dispatch({ type: 'SET_INTERACTION_MODE', mode: (foundCurated.polling ? 'polling' : 'facilitator') as InteractionMode });
    }
  }, [onApplyPreset, applyFormat, applyMode, applyVenue, dispatch]);

  // The More options sheet. Each control sends the same store action the old wizard sent.
  const handleSheetToggle = useCallback((key: SheetSwitchKey) => {
    if (key !== 'sound') tapUi();
    setSetupNotice(null);
    switch (key) {
      case 'sound':
        setAudioMuted(!audioMuted);
        if (audioMuted) useAudioStore.getState().unlock();
        onToggle?.('audio', audioMuted);
        break;
      case 'timer':
        onToggle?.('timer', !sheetSwitches.timer);
        dispatch({ type: 'TOGGLE_TIMER' });
        break;
      case 'countdown':
        // On starts a real countdown to a suggested time the host can change. Off clears it, so the lobby stops counting.
        dispatch({ type: 'SET_START_TIME', time: countdownOn ? '' : suggestedStartTime() });
        break;
      case 'reactions':
        onToggle?.('stage-reactions', !sheetSwitches.reactions);
        dispatch({ type: 'TOGGLE_STAGE_REACTIONS' });
        break;
      case 'scores':
        onToggle?.('leaderboard', !sheetSwitches.scores);
        dispatch({ type: 'TOGGLE_LEADERBOARD' });
        break;
      case 'teams':
        onToggle?.('two-teams', !sheetSwitches.teams);
        dispatch({ type: 'TOGGLE_TEAMS' });
        break;
      case 'finale':
        dispatch({ type: 'TOGGLE_SHOWDOWN' });
        break;
    }
  }, [audioMuted, setAudioMuted, onToggle, dispatch, countdownOn, sheetSwitches.timer, sheetSwitches.reactions, sheetSwitches.scores, sheetSwitches.teams]);

  const handleSheetMode = useCallback((modeId: string) => {
    setSetupNotice(null);
    handleSelectMode(modeId);
  }, [handleSelectMode]);

  const handleSheetFormat = useCallback((formatId: FormatId) => {
    setSetupNotice(null);
    handleSelectFormat(formatId);
  }, [handleSelectFormat]);

  const handleStartTime = useCallback((time: string) => {
    tapUi();
    setSetupNotice(null);
    dispatch({ type: 'SET_START_TIME', time });
  }, [dispatch]);

  const openSheet = useCallback(() => { tapUi(); showView('sheet', 'heading'); }, [showView]);
  const closeSheet = useCallback(() => {
    setSetupNotice(null);
    showView('ready', 'more-options');
  }, [showView]);
  const openQuickSetups = useCallback(() => { tapUi(); showView('setups', 'heading'); }, [showView]);
  const closeQuickSetups = useCallback(() => showView('sheet', 'quick-setups'), [showView]);
  // The show look (VOF-93). A pick applies at once, and the store remembers it on this device for the next game.
  const look = useHostLook((state) => state.look);
  const pickLook = useHostLook((state) => state.pick);
  // Topic patterns (VOF-94) are on in every look. The switch sits beside the picker and applies at once the same way.
  const patterns = useHostLook((state) => state.patterns);
  const setPatterns = useHostLook((state) => state.setPatterns);
  const openLooks = useCallback(() => { tapUi(); showView('looks', 'heading'); }, [showView]);
  const closeLooks = useCallback(() => showView('sheet', 'looks'), [showView]);
  const handlePickLook = useCallback((next: LookId) => {
    tapUi();
    // The sheet says it in words when the host comes back, and the live region announces it now.
    setSetupNotice(`Look is ${lookLabel(next)}`);
    pickLook(next);
  }, [pickLook]);
  const handlePatterns = useCallback((on: boolean) => {
    setSetupNotice(`Topic patterns are ${on ? 'on' : 'off'}`);
    setPatterns(on);
  }, [setPatterns]);
  const handleUseQuickSetup = useCallback((presetId: string) => {
    handleApplyPreset(presetId);
    const preset = DEFAULT_CURATED_PRESETS.find((p) => p.id === presetId);
    setSetupNotice(preset ? `${preset.name} is set` : null);
    showView('sheet', 'heading');
  }, [handleApplyPreset, showView]);

  const questionSets = useMemo(() => modeOptions.map((option) => ({
    id: option.id,
    label: option.label,
    meta: option.id === 'rehearsal' ? `${option.count}, with notes` : `${option.count} questions`,
  })), [modeOptions]);

  // Each quick setup lists what it sets, read from its own config so the list cannot drift.
  // A preset whose question set is not on this deck stays hidden (flagship has no curated15).
  const offeredSetups = useMemo(
    () => DEFAULT_CURATED_PRESETS.filter((preset) => modeOptions.some((option) => option.id === preset.modeId)),
    [modeOptions],
  );
  const quickSetups = useMemo(() => offeredSetups.map((preset) => {
    const mode = modeOptions.find((option) => option.id === preset.modeId);
    const format = FORMAT_OPTIONS.find((option) => option.id === preset.formatId);
    const chips = [
      VENUE_NAMES[preset.venue],
      mode ? `${mode.label} · ${mode.count}` : null,
      format?.ratio ?? null,
      preset.timerEnabled ? 'Timer on' : 'No timer',
      preset.polling ? 'Phone voting' : 'Hands up',
      preset.leaderboardEnabled ? 'Top 5 scores' : null,
    ].filter((chip): chip is string => chip !== null);
    return { id: preset.id, name: preset.name, description: preset.description, chips };
  }), [modeOptions, offeredSetups]);
  const quickSetupsNote = offeredSetups.every((preset) => !preset.twoTeams && !preset.leaderboardEnabled)
    ? 'Every quick setup turns off two teams and Top 5 scores. You can change anything after.'
    : offeredSetups.every((preset) => !preset.twoTeams)
      ? 'Every quick setup turns off two teams. You can change anything after.'
      : null;

  const roomCode = room.roomId;
  const audienceUrl = joinUrl(resolveJoinOrigin(window.location.origin), roomCode);
  const joinHostDisplay = displayJoinHost(resolveJoinOrigin(window.location.origin));
  const [linkCopied, setLinkCopied] = useState(false);
  const handleCopyLink = useCallback(() => {
    tapUi();
    // Copy only — never navigate: a same-tab link here turned the host tab into the phone page.
    const write = navigator.clipboard?.writeText(audienceUrl) ?? Promise.reject(new Error('Clipboard unavailable'));
    write.then(() => {
      setLinkCopied(true);
      window.setTimeout(() => setLinkCopied(false), 2000);
    }).catch(() => setLinkCopied(false));
  }, [audienceUrl]);

  // W1: sr-only hid this line for every venue, but for online and in-room venues it is the only
  // visible signal that phone voting is not connected. Only the offline venue has that state
  // covered elsewhere (the hands-up copy on the card itself), so only offline stays screen-reader-only.
  const liveLine = (
    <p className={`setup-live-line${activeVenue === 'offline' ? ' sr-only' : ''}`} data-live-status={activeVenue === 'offline' || !pollingMode ? 'offline' : room.connectionStatus}>
      <span className="setup-live-dot" aria-hidden="true" />
      <strong>{activeVenue === 'offline' ? 'Hands-up play is selected'
        : !pollingMode ? 'Phone voting is off'
        : room.connectionStatus === 'connected' ? 'Phone voting is ready'
        : room.connectionStatus === 'local rehearsal' ? 'Local rehearsal'
        : room.connectionStatus === 'offline' ? 'Phone voting is not connected'
        : 'Connecting phone voting…'}</strong>
      {activeVenue !== 'offline' && pollingMode && room.connectionStatus === 'connected'
        ? <><span aria-hidden="true"> · </span><span>Room connected</span></> : null}
      {modeOptions.find((option) => option.id === activeModeId)
        ? <><span aria-hidden="true"> · </span><span data-role="setup-question-set">{modeOptions.find((option) => option.id === activeModeId)?.label}</span></>
        : null}
    </p>
  );

  return (
    <main
      ref={screenRef}
      className={`screen pre-flight preflight-screen setup-screen ${className}`}
      data-screen="preFlight"
      data-options={view === 'ready' ? 'closed' : 'open'}
      data-view={view}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        minHeight: 0,
        overflow: 'hidden',
        // Transparent (Game night rollout): the setup sheet sits on the stage's calm cones.
        backgroundColor: 'transparent',
        color: 'var(--color-ink)',
        fontFamily: 'var(--kit-font-sans)',
        boxSizing: 'border-box',
        padding: 0,
      }}
    >
      <ShowFrame
        scrim="center"
        className="setup-show-frame"
        beat="setup"
      >
        <div className="setup-compact" hidden={view !== 'ready'}>
          <h1 className="setup-title">Your game is ready</h1>
          {storeState.selectedDeckId === 'influenza' ? <p role="status">Influenza Insights · Clinical review by Kevin Madden, PharmD is pending · Eight questions</p> : null}
          <section className="setup-venues" aria-labelledby="setup-venue-question">
            <h2 id="setup-venue-question">Where are you presenting?</h2>
            <div
              className="setup-venue-row"
              role="radiogroup"
              aria-label="Where are you presenting?"
            >
              {VENUE_OPTIONS.map(([id, label, detail]) => (
                <button
                  key={id}
                  className={`setup-venue${activeVenue === id ? ' is-selected' : ''}`}
                  type="button"
                  role="radio"
                  aria-checked={activeVenue === id}
                  onClick={() => handleSelectVenue(id)}
                >
                  <span className="setup-venue-name">{label}</span>
                  <span className="setup-venue-detail">{detail}</span>
                </button>
              ))}
            </div>
          </section>
          {activeVenue === 'offline' ? (
            <section className="setup-facilitator-card" aria-label="In-person facilitator guide" data-role="setup-facilitator-card">
              <div className="setup-facilitator-header">
                <p className="setup-facilitator-kicker">Run of show · in-person</p>
                <h2 className="setup-facilitator-title">{modeOptions.find((o) => o.id === activeModeId)?.label || 'Core Show'}</h2>
              </div>
              <div className="setup-facilitator-body">
                <p className="setup-facilitator-lead">Untimed. No phones.</p>
                <ol className="setup-facilitator-steps">
                  <li><strong>1. Present the statement</strong><span>Read it to the room.</span></li>
                  <li><strong>2. Call for hands</strong><span>Let the room decide.</span></li>
                  <li><strong>3. Reveal the facts</strong><span>Show the evidence.</span></li>
                </ol>
              </div>
            </section>
          ) : (
            <section className="setup-room-card" aria-label="The room">
              <div className="setup-room-qr" data-qr-kind="audience" data-role="audience-join-qr">
                <QrCode text={audienceUrl} size={176} ariaLabel={`Audience join QR for room ${roomCode}`} />
              </div>
              <div className="setup-room-copy">
                <span className="setup-room-label">Room code</span>
                <strong className="setup-room-code">{roomCode}</strong>
                <span className="setup-room-link" data-role="setup-join-host">{joinHostDisplay}</span>
                <button
                  className="setup-copy-link-button"
                  type="button"
                  data-role="setup-copy-link"
                  data-copied={linkCopied ? 'true' : 'false'}
                  aria-label={linkCopied ? 'Join link copied' : 'Copy the join link'}
                  onClick={handleCopyLink}
                >
                  {linkCopied ? 'Copied' : 'Copy link'}
                </button>
              </div>
            </section>
          )}
          {activeVenue !== 'offline' && onShowPresenterRemote ? (
            <div className="setup-presenter-remote" data-role="setup-presenter-remote" data-paired={presenterRemotePaired ? 'true' : 'false'}>
              <p className="setup-presenter-remote__kicker">Presenter device</p>
              <p className="setup-presenter-remote__banner" data-role="setup-remote-status">
                {presenterRemotePaired ? (
                  <>
                    <strong className="setup-presenter-remote__linked" data-role="setup-remote-linked">Device linked</strong>
                    {' '}Controller device connected. Audience join is the room code above, not the presenter QR.
                  </>
                ) : (
                  'Pair before mirroring. Keep this QR off the projector.'
                )}
              </p>
              <button
                className="setup-presenter-remote__button"
                type="button"
                data-role="setup-show-presenter-remote"
                onClick={() => { tapUi(); onShowPresenterRemote(); }}
              >
                {presenterRemotePaired ? 'Show presenter remote QR' : 'Pair presenter device'}
              </button>
            </div>
          ) : null}
          {activeVenue !== 'offline' ? (
            <div className="setup-offline-backup" data-role="setup-offline-backup">
              <p className="setup-offline-backup__kicker">Offline</p>
              <p className="setup-offline-backup__note">
                Choose Offline to run this same show with hands up. There is no second file.
              </p>
            </div>
          ) : null}
          <div className="setup-primary-actions">
            <button
              className="setup-open-lobby"
              type="button"
              aria-label="Open the lobby"
              onClick={handleLaunchLobby}
            >
              Open the lobby
            </button>
            <button
              ref={moreOptionsRef}
              className="setup-more-options"
              type="button"
              onClick={openSheet}
            >
              More options
            </button>
          </div>
          {liveLine}
        </div>
        {view === 'sheet' ? (
          <OptionsSheet
            venue={activeVenue}
            phones={phonesInPlay}
            questionSets={questionSets}
            modeId={activeModeId}
            activePresetId={activePresetId}
            onSelectMode={handleSheetMode}
            formats={FORMAT_OPTIONS}
            formatId={activeFormat}
            onSelectFormat={handleSheetFormat}
            switches={sheetSwitches}
            onToggle={handleSheetToggle}
            startTime={startTime}
            onStartTime={handleStartTime}
            notice={setupNotice}
            liveLine={liveLine}
            onOpenQuickSetups={openQuickSetups}
            lookName={lookLabel(look)}
            onOpenLooks={openLooks}
            onDone={closeSheet}
            onOpenLobby={handleLaunchLobby}
            headingRef={viewHeadingRef}
            quickSetupsRef={quickSetupsRef}
            looksRef={looksRef}
          />
        ) : null}
        {view === 'setups' ? (
          <QuickSetups
            setups={quickSetups}
            activeId={activePresetId}
            note={quickSetupsNote}
            onUse={handleUseQuickSetup}
            onBack={closeQuickSetups}
            headingRef={viewHeadingRef}
          />
        ) : null}
        {view === 'looks' ? (
          <LooksPicker
            look={look}
            onPick={handlePickLook}
            patterns={patterns}
            onPatterns={handlePatterns}
            onBack={closeLooks}
            headingRef={viewHeadingRef}
          />
        ) : null}
      </ShowFrame>
      <p className="sr-only" role="status">{setupNotice ?? ''}</p>
    </main>
  );
});

Preflight.displayName = 'Preflight';

export default Preflight;
