import React, { useState } from 'react';
import type { AttendeeState, ConnectionStatus, JoinProfile, PublicRoomState } from '../network/protocol';
import { HOST_DISCONNECTED_MESSAGE, usePhoneLink } from '../network/usePhoneLink';
import PhoneLayout from './PhoneLayout';
import { PhoneJoin } from './PhoneJoin';
import { getOrCreateDeviceId } from './phone-join-utils';
import { PhoneVote, type QuestionType } from './PhoneVote';
import { PhoneReveal } from './PhoneReveal';
import { PhoneClosing } from './PhoneClosing';
import { PhoneBackdrop } from './PhoneBackdrop';
import { LobbySeat } from './LobbySeat';
import { RevealStamp } from './RevealStamp';
import { ShowdownPredict } from './ShowdownPredict';
import { tapAnswer } from '../engine/audio-cues';
import { phoneAudienceWait } from './phone-wait';
import { leaderboardRowKey } from './leaderboard-row-key';
import { discussionPaused } from './phone-discussion-paused';
import { HOST_DOWN_STAY, RECONNECT_IN_FIVE, ROOM_OFFLINE } from './phone-live-copy';
import { lookFlag, resolvePhoneLook } from '../looks/look';
import { patternFlag, resolvePhonePatterns } from '../looks/patterns/pattern-setting';
import { readRoomLook } from '../network/room-look';
import { LookRoot } from '../looks/LookRoot';
import { usePublishPhoneTopic } from '../looks/patterns/phone-topic';

export interface PhoneSuiteProps { roomId: string; initialDeviceId?: string | null; }
/** What the phone screens need from a game: the relay link here, or solo's in-page game (src/solo/SoloSuite.tsx). */
/** `pending` is any message on its way to the room. `votePending` is a vote on its way, the only one that holds the answer dock. */
export type PhoneLink = { roomState: PublicRoomState | null; attendeeState: AttendeeState | null; connectionStatus: ConnectionStatus; error: string | null; pending: boolean; votePending: boolean; join(profile: JoinProfile): void; sendVote(choice: string, conviction?: string): void; sendReaction(reaction: string): void; sendPrediction(ticket: string): void; retry(): void };
type PendingVote = { choice: string; questionInstanceId: string | undefined };
type AcknowledgedVote = { choice: string; questionInstanceId: string; sequence: number };

const attendeeUrl = (roomId: string) => `/join?room=${encodeURIComponent(roomId)}`;

/** The room phases whose phone screen is the live question's own: its vote, its reveal and its explanation (VOF-94 topic patterns). */
const QUESTION_PHASES: ReadonlySet<string> = new Set(['question', 'entering', 'deliberating', 'timedOut', 'locked', 'revealed', 'explaining']);

/**
 * A quiet waiting screen: the bar carries the mark, so this is words only, vertically centred over the plate
 * (critique items 14 and 23). `kicker` is the small gold line above the message; `detail` the one line under it.
 */
export const Waiting: React.FC<{ message: string; detail?: string; kicker?: string }> = ({ message, detail, kicker }) => (
  <section data-role="phone-waiting" className="phone-wait-card">
    {kicker ? <p className="phone-wait-card__label">{kicker}</p> : null}
    <h2>{message}</h2>
    {detail ? <p>{detail}</p> : null}
  </section>
);

const PhoneLeaderboard: React.FC<{ attendee: AttendeeState | null; room: PublicRoomState }> = ({ attendee, room }) => {
  const board = room.leaderboard.slice(0, 5);
  const hasRank = attendee?.rank != null && (attendee.totalParticipants ?? 0) > 0;
  return (
    <section data-role="phone-leaderboard" className="phone-leaderboard" aria-label="Top 5 scores">
      <p className="phone-state-kicker">Look up</p>
      <h2>Top 5 is on the big screen.</h2>
      {board.length > 0 ? (
        <ol className="phone-leaderboard__lanes">
          {board.map((entry, index) => (
            <li key={leaderboardRowKey(entry, index)} data-rank={entry.rank} data-role="phone-leaderboard-lane">
              <span className="phone-leaderboard__place" aria-hidden="true">{entry.rank}</span>
              <strong className="phone-leaderboard__name">{entry.name}</strong>
              <span className="phone-leaderboard__score">{entry.score}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="phone-leaderboard__empty">Scores will land here after the first answers.</p>
      )}
      {hasRank ? <p className="phone-leaderboard__you" data-role="phone-leaderboard-you">You: #{attendee.rank} of {attendee.totalParticipants}</p> : null}
    </section>
  );
};

export interface PhoneScreensProps {
  link: PhoneLink;
  roomId: string;
  deviceId: string;
  /**
   * Solo play (VOF-44): one person and no room, fed by a game running in the same page. The room chrome and the
   * reactions step aside, and the room's waiting line gives way to a solo one.
   */
  solo?: boolean;
  /** Solo's own control, under whatever screen is showing: the one button that moves the game on. */
  footer?: React.ReactNode;
  /** Solo's header controls, at the right of the bar: the topic being played and the way back to the topics. */
  headerActions?: React.ReactNode;
  /** Solo only: a compact live readout beside the wordmark -- a pace's own streak meter, climb path or best target. */
  headerContent?: React.ReactNode;
  /** Solo only: right or wrong for each question of the round, in order, for the strip on the close. */
  soloOutcomes?: readonly (boolean | null)[];
  /** Solo only: replaces the closing screen's content entirely. A pace variant's own round-end payoff, in place of
   *  the default PhoneClosing (used untouched when this is not given, i.e. today's pace). */
  soloClosingContent?: React.ReactNode;
  /** Solo only: the perfect-round reward, handed to the default close (today's pace) to show under its score. */
  soloReward?: React.ReactNode;
  /** Solo only: extra class names on the phone shell, for a pace's own visual state (e.g. Run's streak tier). */
  shellClassName?: string;
}

/** Every phone screen from Join to the closing, for whatever feeds it: the relay link or solo's in-page game. */
export const PhoneScreens: React.FC<PhoneScreensProps> = ({ link, roomId, deviceId, solo = false, footer, headerActions, headerContent, soloOutcomes, soloClosingContent, soloReward, shellClassName }) => {
  const [pendingVote, setPendingVote] = useState<PendingVote | null>(null);
  const [acknowledgedVote, setAcknowledgedVote] = useState<AcknowledgedVote | null>(null);
  const { roomState, attendeeState, connectionStatus, error, pending, votePending, join, sendVote, sendReaction, sendPrediction, retry } = link;
  const questionInstanceId = roomState?.questionData?.questionInstanceId;
  const attendeeVote = attendeeState?.vote;
  // Only a vote on its way holds the dock. A reaction the relay is still answering must never block the next question's first tap.
  const activePendingVote = pendingVote !== null && votePending && !error && pendingVote.questionInstanceId === questionInstanceId && attendeeState?.vote?.choice !== pendingVote.choice
    ? pendingVote
    : null;
  const pendingChoice = activePendingVote?.choice ?? null;

  // The relay's ACK is the authoritative event. Comparing the choice alone cannot distinguish a fresh
  // same-token submission from the receipt that was already on screen. Errors and timeouts retain the draft.
  React.useEffect(() => {
    if (!pendingVote || votePending || error || pendingVote.questionInstanceId !== questionInstanceId) return;
    if (!attendeeVote || !questionInstanceId || attendeeVote.questionInstanceId !== questionInstanceId || attendeeVote.choice !== pendingVote.choice) return;
    setAcknowledgedVote((current) => ({ choice: pendingVote.choice, questionInstanceId, sequence: (current?.sequence ?? 0) + 1 }));
    setPendingVote(null);
  }, [attendeeVote, error, votePending, pendingVote, questionInstanceId]);

  const joinRoom = ({ roomCode, nickname, team }: Parameters<NonNullable<React.ComponentProps<typeof PhoneJoin>['onJoin']>>[0]) => {
    if (roomCode !== roomId) {
      window.location.assign(attendeeUrl(roomCode));
      return;
    }
    join({ nickname, team });
  };
  const submitVote = (choice: string, conviction?: string) => {
    tapAnswer();
    setPendingVote({ choice, questionInstanceId });
    sendVote(choice, conviction);
  };
  const registered = Boolean(attendeeState?.registered);
  const phase = roomState?.phase;
  const hostDown = Boolean(roomState && !roomState.hostConnected) || error === HOST_DISCONNECTED_MESSAGE;
  // Topic patterns (VOF-94): the live question's stem, for the pattern in the shared backdrop. Only the question's own screens
  // draw it (the vote, the reveal and the explanation), as on the big screen. The leaderboard, the closing, a showdown and a
  // phone waiting on a host that is gone are not that question's screens, so they carry none.
  usePublishPhoneTopic(registered && !hostDown && phase && QUESTION_PHASES.has(phase) ? roomState?.questionData?.statement ?? null : null);
  const reconnecting = connectionStatus === 'reconnecting';
  const announcement = hostDown
    ? null
    : error
      ?? (registered && connectionStatus === 'offline' ? ROOM_OFFLINE : null)
      ?? (registered && reconnecting ? RECONNECT_IN_FIVE : null);
  if (!roomId) {
    // No room in the address: nothing connects; the code screen sends the phone to /join?room=CODE.
    return <PhoneLayout className="phone-live-shell" brandMark="none" backdrop={<PhoneBackdrop scrim="join" />} showHeader={false} showWakeLockIndicator={false} showFooter={false}>
      <PhoneJoin deviceId={deviceId} initialRoomCode="" onJoin={joinRoom} />
    </PhoneLayout>;
  }
  let content: React.ReactNode;
  // MOT-VQA-01 / QUEUED-SCROLL: identifies which screen is showing, not just which phase. A new key
  // both fades the new screen in (below) and resets its scroll to the top (PhoneLayout's
  // scrollResetKey). It changes on every screen a person actually sees as new: a fresh question,
  // moving from result to explanation, and so on, but not on in-place updates to the same screen
  // (a tick of the timer, a lock, a vote being sent) so those never re-fade or re-scroll.
  let screenKey: string;
  // The room screens built on the premium layouts (the answer dock, the seat, the stamped reveal, the podium close and
  // the final round) share one content box: 16 on three sides and 16 over the home-indicator inset. Every other screen
  // keeps its own.
  let framed = false;
  if (!registered) {
    content = <PhoneJoin deviceId={deviceId} initialRoomCode={roomId} teamsEnabled={Boolean(roomState?.teamScores)} isLoading={pending || connectionStatus !== 'connected' || !roomState} errorMessage={hostDown ? null : error} hostDown={hostDown} connectionStatus={connectionStatus} onJoin={joinRoom} />;
    screenKey = 'join';
  } else if (!roomState || hostDown) {
    content = <Waiting kicker="Hold on" message={HOST_DOWN_STAY} />;
    screenKey = 'hold';
  } else if (phase === 'revealed' || phase === 'explaining') {
    // Solo reveals and explains in one beat (VOF-W7): its own reveal dispatch (revealSoloAnswer) settles
    // REVEAL and ADVANCE together, so a solo phone never actually renders 'revealed' on its own -- by the
    // time this paints, phase is already 'explaining', and 'combined' shows the verdict and the reason on
    // one screen. A room phone is unchanged: its host walks 'revealed' then 'explaining' as two screens.
    const presentation = phase === 'explaining' ? (solo ? 'combined' : 'explanation') : 'result';
    // A room result stamps its verdict on the claim. An order result, an explanation and solo keep PhoneReveal, which
    // pages an order and carries the explanation.
    framed = !solo && presentation === 'result' && Boolean(roomState.reveal) && roomState.questionData?.kind !== 'order';
    content = framed && roomState.reveal
      ? <RevealStamp reveal={roomState.reveal} question={roomState.questionData} attendee={attendeeState} onReaction={sendReaction} />
      : <PhoneReveal presentation={presentation} reveal={roomState.reveal} question={roomState.questionData} attendee={attendeeState} onReaction={solo ? undefined : sendReaction} solo={solo} />;
    screenKey = `reveal-${presentation}-${questionInstanceId ?? 'unknown'}`;
  } else if (phase === 'leaderboard') {
    content = <PhoneLeaderboard attendee={attendeeState} room={roomState} />;
    screenKey = 'leaderboard';
  } else if (phase === 'closing') {
    framed = !solo && Boolean(attendeeState);
    content = solo && soloClosingContent
      ? soloClosingContent
      : <PhoneClosing attendee={attendeeState} room={roomState} solo={solo} outcomes={solo ? soloOutcomes : undefined} reward={solo ? soloReward : undefined} />;
    screenKey = 'closing';
  } else if (phase === 'showdown' && roomState.showdown) {
    framed = !solo;
    content = <ShowdownPredict showdown={roomState.showdown} attendee={attendeeState} onPredict={sendPrediction} />;
    screenKey = `showdown-${roomState.showdown.stage}`;
  } else if (phase === 'question' || phase === 'entering' || phase === 'deliberating' || phase === 'timedOut' || phase === 'locked') {
    if (roomState.questionData) {
      framed = !solo;
      content = <PhoneVote questionType={roomState.questionData.kind as QuestionType} questionData={roomState.questionData} timerSeconds={roomState.timerSeconds} isDiscussionPaused={discussionPaused(roomState)} votesLocked={roomState.votesLocked} initialVote={attendeeState?.vote?.questionInstanceId === roomState.questionData.questionInstanceId ? attendeeState.vote.choice : null} pendingChoice={pendingChoice} isSubmitting={votePending} acknowledgedSubmission={acknowledgedVote?.questionInstanceId === roomState.questionData.questionInstanceId ? acknowledgedVote : null} onSubmit={submitVote} solo={solo} />;
      screenKey = `vote-${questionInstanceId ?? 'unknown'}`;
    } else if (solo) {
      content = <Waiting message="Getting your questions ready." />;
      screenKey = 'solo-wait';
    } else {
      const wait = phoneAudienceWait(roomState);
      framed = true;
      content = <LobbySeat kicker={wait.kicker} line={wait.detail ? `${wait.message} ${wait.detail}` : wait.message} name={attendeeState?.nickname} participants={roomState.participants} team={attendeeState?.team} />;
      screenKey = 'audience-wait';
    }
  } else {
    // Before the show: the seat, with the instructions wait's line, since this phone is the player's clicker.
    const seat = phoneAudienceWait({ question: 'instructions' });
    framed = !solo;
    content = solo
      ? <Waiting message="Getting your questions ready." />
      : <LobbySeat kicker={seat.kicker} line={`${seat.message} ${seat.detail ?? ''}`.trim()} name={attendeeState?.nickname} participants={roomState?.participants ?? 0} team={attendeeState?.team} />;
    screenKey = solo ? 'solo-wait' : 'you-are-in';
  }
  // MOT-VQA-01 / QUEUED-SCROLL: PhoneLayout keys its content box on `screenKey`, so every real
  // screen change gets a fresh box (opacity fades in, scroll starts at the top) while re-renders
  // that keep the same key (a timer tick, a lock, a vote being sent) update in place as before.
  const shell = [solo ? 'phone-live-shell solo-shell' : 'phone-live-shell', framed ? 'room-frame' : undefined, solo ? shellClassName : undefined].filter(Boolean).join(' ');
  return <PhoneLayout className={shell} brandMark={registered ? 'stacked' : 'none'} backdrop={<PhoneBackdrop scrim={registered ? 'stage' : 'join'} />} roomCode={solo ? undefined : roomId} attendeeName={solo ? undefined : attendeeState?.nickname} team={solo ? undefined : attendeeState?.team ?? undefined} connectionStatus={solo ? undefined : connectionStatus} hostDown={hostDown} announcement={announcement} announcementType={error || connectionStatus === 'offline' ? 'error' : reconnecting ? 'info' : announcement ? 'error' : 'info'} announcementAction={!solo && connectionStatus === 'offline' ? { label: 'Retry', onClick: retry } : undefined} showWakeLockIndicator={false} headerContent={solo ? headerContent : undefined} headerActions={solo ? headerActions : undefined} showFooter={Boolean(solo && footer)} footer={solo ? footer : undefined} scrollResetKey={screenKey}>
    {content}
  </PhoneLayout>;
};

/** The room phone: the relay link feeding the phone screens. */
export const PhoneSuite: React.FC<PhoneSuiteProps> = ({ roomId, initialDeviceId }) => {
  const [deviceId] = useState(() => initialDeviceId || getOrCreateDeviceId());
  const link = usePhoneLink(roomId, deviceId, undefined, { maxReconnectAttempts: 12 }) as PhoneLink;
  // A phone follows the host's look and topic pattern switch when the room state carries them, which it does once the production
  // relay allows the two keys (network/room-look.ts). Until then, and for a host that does not send them, it shows today's look
  // with patterns on. The page's own flags (?look= and &pattern=) are testing overrides and win. It never reads the host's
  // remembered pick.
  const [flags] = useState(() => ({ look: lookFlag(window.location.search), patterns: patternFlag(window.location.search) }));
  const room = readRoomLook(link.roomState);
  const look = resolvePhoneLook({ flag: flags.look, room: room.look });
  const patterns = resolvePhonePatterns({ flag: flags.patterns, room: room.patterns });
  return <LookRoot look={look} patterns={patterns}><PhoneScreens link={link} roomId={roomId} deviceId={deviceId} /></LookRoot>;
};

export default PhoneSuite;
