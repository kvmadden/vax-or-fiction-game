import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useGameStore } from '../store/game-store';
import { isSetupPhase } from '../engine/state-machine';
import { ScaledStage } from '../components/ScaledStage';
import { ScreenRouter } from '../screens/ScreenRouter';
import { HUD } from '../facilitator/HUD';
import { Keyboard } from '../facilitator/Keyboard';
import { RestartRunModal } from '../components/RestartRunModal';
import { AudioPlayer } from '../components/AudioPlayer';
import { SlideErrorBoundary } from '../components/ErrorBoundary';
import { useLiveLink } from '../network/useLiveLink';
import { DeckLoaderContext } from '../data/deck-loader';
import { OfflineProvider } from '../data/providers/OfflineProvider';
import { RoomErrorBanner } from '../components/RoomErrorBanner';
import { RoomContext } from './RoomContext';
import type { Venue } from '../data/types';
import { tapUi } from '../engine/audio-cues';
import { applyInRoomWalkinMutePolicy, applyOnlineMeetingMutePolicy } from '../engine/audio-store';
import { audienceJoinOrigin, PUBLIC_JOIN_ORIGIN, rememberHostTab } from '../network/room';
import { saveClosedGame } from '../network/game-archive';
import { hostLaunchFromLocation, shouldAutoOpenPresenterPairing } from './host-launch';
import { readPresentationVenue, writePresentationVenue } from './venue-preference';
import { useViewportFormat } from './useViewportFormat';
import { PresenterPairing } from '../screens/PresenterPairing';
import { remoteControllerUrl, remoteKeyForRoom, ROOM_CURATED15_TIMER_SECONDS } from '../network/presenter-remote';
import { SCREEN_FADE_S } from '../ui/screen-fade';
import { useHostLook } from '../looks/host-look';
import { LookRoot } from '../looks/LookRoot';

const dataProvider = new OfflineProvider();

export interface PresentationSuiteProps {
  roomId?: string;
}

function hostLaunchFromWindow() {
  if (typeof window === 'undefined') return null;
  return hostLaunchFromLocation(window.location.search);
}

function launchVenueFromWindow(): Venue | undefined {
  return hostLaunchFromWindow()?.venue;
}

/** Config/missing-relay errors are host/sandbox diagnostics — never paint them over the room walk-in. */
function isHostOnlyRelayDiagnostic(error: string | null | undefined): boolean {
  if (!error) return false;
  return /no live room relay|relay is enabled, but|configuration is invalid|VITE_SUPABASE|required\./i.test(error);
}

export const PresentationSuite: React.FC<PresentationSuiteProps> = ({ roomId = 'default-room' }) => {
  const gamePhase = useGameStore((state) => state.phase);
  const slideIndex = useGameStore((state) => state.slideIndex);
  const format = useGameStore((state) => state.formatId);
  const offlineMode = useGameStore((state) => state.offlineMode);
  const interactionMode = useGameStore((state) => state.interactionMode);
  const dispatch = useGameStore((state) => state.dispatch);
  // The look the host picked in setup (VOF-93), or the one this device remembered, and whether topic patterns draw
  // behind the questions (VOF-94). Everything below wears them.
  const look = useHostLook((state) => state.look);
  const patterns = useHostLook((state) => state.patterns);
  const setup = isSetupPhase(gamePhase);
  // Hold outgoing stage chrome + content format through Preflight↔Lobby sync
  // dissolves. Flipping format/className on the setup edge made the exiting
  // pane lose geometry (and phone unscaled↔scaled) mid-crossfade — both
  // ENTER_LOBBY and Back. ScreenRouter must lag too or Lobby data-format snaps
  // under a still-widescreen canvas.
  const [stageInSetupChrome, setStageInSetupChrome] = useState(setup);
  useEffect(() => {
    const release = window.setTimeout(
      () => setStageInSetupChrome(setup),
      Math.round(SCREEN_FADE_S * 1000),
    );
    return () => window.clearTimeout(release);
  }, [setup]);
  const displayFormat = useViewportFormat(format, !stageInSetupChrome);
  // WARNING-7 (premium-host-fix-3): tried making this respond to a real host square/portrait
  // canvas instead of a hardcoded "widescreen" (see the checklist for the square-only attempt
  // and its live screenshots). Reverted: stageFormat drives ScreenRouter's own format prop, not
  // only ScaledStage's box, for every screen still under stageInSetupChrome, including the
  // ENTERING Lobby during the Preflight-to-Lobby crossfade (this file's own top comment:
  // "ScreenRouter must lag too or Lobby data-format snaps under a still-widescreen canvas").
  // tests/unit/stage-visual-polish.test.ts locks this exact literal source line, "content format
  // must share the lagged chrome clock", specifically to prevent that snap. My square-only
  // attempt only verified the settled state (a 600ms wait past the fade), never the crossfade
  // itself, so the risk this locked test protects against was never actually ruled out. Not
  // touching a locked cross-screen invariant on unverified crossfade safety.
  const stageFormat = stageInSetupChrome ? "widescreen" : displayFormat;
  const [selectedVenue, setSelectedVenue] = useState<Venue>(() => {
    const fromLaunch = launchVenueFromWindow();
    const stored = readPresentationVenue(roomId);
    const initial = fromLaunch ?? stored;
    const shouldBeOffline = initial === 'offline';
    const current = useGameStore.getState().offlineMode;
    if (current !== shouldBeOffline) {
      useGameStore.getState().dispatch({ type: 'SET_OFFLINE_MODE', enabled: shouldBeOffline });
    }
    return initial;
  });
  // Persisted venue is the first-paint source of truth so a store/preference desync
  // cannot flash a blank host while SET_OFFLINE_MODE catches up. A one-click
  // A `?venue=` query wins over the stored choice for this tab.
  const venue: Venue = selectedVenue;
  const remoteKey = useMemo(() => remoteKeyForRoom(roomId), [roomId]);
  const remoteUrl = remoteControllerUrl(
    typeof window === 'undefined' ? PUBLIC_JOIN_ORIGIN : audienceJoinOrigin(window.location.origin),
    roomId,
    remoteKey,
  );
  const [remotePaired, setRemotePaired] = useState(false);
  const [pairingOpen, setPairingOpen] = useState(() => shouldAutoOpenPresenterPairing(hostLaunchFromWindow()));
  useLayoutEffect(() => {
    rememberHostTab(roomId);
  }, [roomId]);
  useLayoutEffect(() => {
    // MUTE-LEAK (VOF-25): the room policy above only unmutes. This restores what it silently
    // changed when the venue returns to Online meeting, without touching an explicit host choice.
    if (venue === 'room') applyInRoomWalkinMutePolicy();
    if (venue === 'teams') applyOnlineMeetingMutePolicy();
  }, [venue]);
  const applyVenue = useCallback((nextVenue: Venue) => {
    setSelectedVenue(nextVenue);
    writePresentationVenue(roomId, nextVenue);
    const polling = nextVenue !== 'offline';
    dispatch({ type: 'SET_OFFLINE_MODE', enabled: nextVenue === 'offline' });
    dispatch({ type: 'SET_INTERACTION_MODE', mode: polling ? 'polling' : 'facilitator' });
    if (useGameStore.getState().modeId === 'curated15') {
      dispatch({
        type: 'SET_TIMER',
        seconds: nextVenue === 'room' ? ROOM_CURATED15_TIMER_SECONDS : 20,
        enabled: true,
        visible: true,
      });
    }
    if (nextVenue === 'offline') setPairingOpen(false);
    if (nextVenue === 'room') applyInRoomWalkinMutePolicy();
    if (nextVenue === 'teams') applyOnlineMeetingMutePolicy();
  }, [dispatch, roomId]);
  useLayoutEffect(() => {
    const applyLaunch = () => {
      if (!isSetupPhase(useGameStore.getState().phase)) return;
      const action = hostLaunchFromWindow();
      if (!action) return;
      if (action.type === 'SELECT_MODE' && action.deckId === 'influenza') {
        useGameStore.getState().dispatch({ type: 'SELECT_DECK', deckId: action.deckId })
      }
      if (action.type === 'APPLY_PRESET') {
        useGameStore.getState().dispatch({ type: 'APPLY_PRESET', presetId: action.presetId });
      } else if (action.modeId) {
        useGameStore.getState().dispatch({ type: 'SELECT_MODE', modeId: action.modeId });
      }
      if (action.type === 'SELECT_MODE' && action.deckId === 'influenza') {
        useGameStore.getState().dispatch({ type: 'SET_TIMER', seconds: 20, enabled: false, visible: false })
      }
      if (action.venue) applyVenue(action.venue);
      if (action.timerSeconds) {
        useGameStore.getState().dispatch({
          type: 'SET_TIMER',
          seconds: action.timerSeconds,
          enabled: true,
          visible: true,
        });
      }
    };
    applyLaunch();
    const persistApi = useGameStore.persist;
    if (persistApi?.hasHydrated?.()) return undefined;
    return persistApi?.onFinishHydration?.(applyLaunch);
  }, [applyVenue]);
  useLayoutEffect(() => {
    const shouldBeOffline = selectedVenue === 'offline';
    if (offlineMode !== shouldBeOffline) {
      dispatch({ type: 'SET_OFFLINE_MODE', enabled: shouldBeOffline });
    }
    // B1 (premium-host pass 2): a returning host's persisted venue is the first-paint source of
    // truth here, but interactionMode is the store's own field and can carry a stale "polling"
    // value from earlier in the same session. Phones genuinely cannot vote in Offline, so that
    // one direction gets corrected on hydration too, not just SET_OFFLINE_MODE. The reverse is
    // not forced: a facilitator-mode room in venue teams or room is a real, deliberate choice
    // (phones simply not invited to vote this run), not a desync to fix.
    if (shouldBeOffline && interactionMode !== 'facilitator') {
      dispatch({ type: 'SET_INTERACTION_MODE', mode: 'facilitator' });
    }
  }, [dispatch, offlineMode, interactionMode, selectedVenue]);
  const handleVenueChange = useCallback((nextVenue: Venue) => {
    applyVenue(nextVenue);
  }, [applyVenue]);

  const { connectionStatus, error, retry } = useLiveLink(roomId, undefined, venue !== 'offline', {
    key: remoteKey,
    onPaired: setRemotePaired,
  });
  const archivedClosingKey = useRef<string | null>(null);
  useEffect(() => {
    if (gamePhase !== 'closing' || venue === 'offline') return;
    const state = useGameStore.getState();
    const key = `${roomId}:${state.session?.startedAt ?? 'na'}:${state.slideIndex}`;
    if (archivedClosingKey.current === key) return;
    archivedClosingKey.current = key;
    void saveClosedGame({
      roomId,
      deckId: state.session?.deckId ?? state.deckId ?? 'vax-or-fiction',
      deckTitle: 'Vax or Fiction?',
      session: state.session,
      roomStats: state.roomStats,
      seenDevices: state.seenDevices,
      run: state.run,
      showdown: state.showdown,
      venue,
      teamsEnabled: Boolean(state.teamsEnabled),
    }).catch(() => {
      /* Closing still plays if the archive write fails. */
    });
  }, [gamePhase, roomId, venue]);
  const openingScreenProps = setup
    ? {
      venue,
      onSelectVenue: handleVenueChange,
      presenterRemotePaired: remotePaired,
      onShowPresenterRemote: () => setPairingOpen(true),
    }
    : { venue };
  const screen = <SlideErrorBoundary resetKey={`${gamePhase}-${slideIndex}`} onSkip={() => dispatch({type: 'SKIP'})}>
    <ScreenRouter format={stageFormat} screenProps={openingScreenProps} />
  </SlideErrorBoundary>;

  const hasRoomError = !setup && Boolean(error) && !isHostOnlyRelayDiagnostic(error);
  const [bannerHeight, setBannerHeight] = useState(0);
  const bannerRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!hasRoomError || !bannerRef.current) {
      setBannerHeight(0);
      return;
    }
    const update = () => {
      if (bannerRef.current) {
        setBannerHeight(bannerRef.current.offsetHeight);
      }
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(bannerRef.current);
    return () => ro.disconnect();
  }, [hasRoomError]);

  return (
    <LookRoot look={look} patterns={patterns}>
    <DeckLoaderContext.Provider value={dataProvider}>
      <RoomContext.Provider value={{roomId, connectionStatus, error}}>
      {hasRoomError ? (
        <RoomErrorBanner
          bannerRef={bannerRef}
          error={error!}
          onRetry={() => { tapUi(); retry(); }}
        />
      ) : null}
      {setup && pairingOpen && venue !== 'offline' ? (
        <PresenterPairing
          remoteUrl={remoteUrl}
          paired={remotePaired}
          onContinue={() => { tapUi(); setPairingOpen(false); }}
        />
      ) : null}
      {/* One ScaledStage for setup and show — remounting on ENTER_LOBBY tore down
          ScreenRouter and skipped the sync Preflight↔Lobby dissolve. Outgoing
          chrome holds through that dissolve; the chosen format applies after. */}
      <ScaledStage
        format={stageFormat}
        topOffset={stageInSetupChrome ? 0 : bannerHeight}
        className={stageInSetupChrome ? "presenter-setup-stage" : "stage-wrapper"}
      >
        {screen}
      </ScaledStage>
      {!setup && <HUD />}
      <Keyboard />
      <RestartRunModal />
      <AudioPlayer />
      </RoomContext.Provider>
    </DeckLoaderContext.Provider>
    </LookRoot>
  );
};

export default PresentationSuite;
