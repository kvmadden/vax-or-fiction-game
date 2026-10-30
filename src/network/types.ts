export interface RoomMessageBase {
  type: string;
  roomId: string;
  deviceId: string;
  timestamp: number;
}

export interface HelloMessage extends RoomMessageBase {
  type: 'HELLO';
  nickname?: string;
  role?: string;
  team?: string;
}

export interface VoteMessage extends RoomMessageBase {
  type: 'VOTE';
  choice: string;
  conviction?: string;
}

export interface ReactionMessage extends RoomMessageBase {
  type: 'REACTION';
  reaction: string;
}

export interface ReasonMessage extends RoomMessageBase {
  type: 'REASON';
  reason: string;
}

export interface CommitmentMessage extends RoomMessageBase {
  type: 'COMMITMENT';
  commitment: string;
}

export interface BountyMessage extends RoomMessageBase {
  type: 'BOUNTY';
  bounty: string;
}

export interface ForkVoteMessage extends RoomMessageBase {
  type: 'FORK_VOTE';
  choice: string;
}

export interface PredictWinnerMessage extends RoomMessageBase {
  type: 'PREDICT_WINNER';
  winner: string;
}

export interface DoubleMessage extends RoomMessageBase {
  type: 'DOUBLE';
  double: boolean;
}

export interface VolunteerMessage extends RoomMessageBase {
  type: 'VOLUNTEER';
  ticket: string;
}

export type RoomMessage =
  | HelloMessage
  | VoteMessage
  | ReactionMessage
  | ReasonMessage
  | CommitmentMessage
  | BountyMessage
  | ForkVoteMessage
  | PredictWinnerMessage
  | DoubleMessage
  | VolunteerMessage;

export interface RoomState {
  phase: string;
  slideIndex: number;
  question: string | null;
  votesLocked: boolean;
  timerSeconds: number;
  teamScores: Record<string, number> | null;
}

export interface NetworkTransport {
  send(payload: unknown): void;
  onMessage(handler: (data: any) => void): void;
  close(): void;
}

