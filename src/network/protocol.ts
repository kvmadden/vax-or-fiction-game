import type { QuestionKind, TeamSide } from '../data/types';

export const PROTOCOL_VERSION = 1 as const;
export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'offline' | 'local rehearsal';
export interface PublicOption { token: string; label: string; text: string; min?: number; max?: number }
export interface PublicQuestion {
  id: string;
  questionInstanceId: string;
  kind: QuestionKind;
  statement: string;
  number: number;
  total: number;
  options: PublicOption[];
  steps?: { token: string; text: string }[];
  unit?: string;
  /** The choices are spoken replies, so the phone asks which reply is better. Sent only when true. */
  reply?: boolean;
  /** The stem's authored emphasis (Question.emphasis), within src/network/emphasis-bound.ts. Sent only when it has phrases. */
  emphasis?: string[];
}
export interface PublicReveal {
  answerLabel: string;
  answerToken: string;
  explanation: string;
  takeaway: string;
  citations: { label: string; url?: string }[];
  /** The authored emphasis of `explanation` and `takeaway` (Question.revealEmphasis and takeawayEmphasis). Sent only when they have phrases. */
  explanationEmphasis?: string[];
  takeawayEmphasis?: string[];
  /** The closing recap's emphasis, one phrase list per newline-separated line of `takeaway`. Sent only when a line has phrases. */
  takeawayLineEmphasis?: string[][];
}
export interface PublicFinalist { ticket: string; name: string; score: number; duelPoints: number }
export interface PublicShowdown {
  id: string;
  stage: 'lineup' | 'duel' | 'result';
  finalists: PublicFinalist[];
  predictions: Record<string, number>;
  question: PublicQuestion | null;
  winner: string | null;
}
export interface PublicRoomState {
  version: typeof PROTOCOL_VERSION;
  roomId: string;
  sessionId: string;
  revision: number;
  phase: string;
  slideIndex: number;
  slideCount: number;
  question: string | null;
  questionData: PublicQuestion | null;
  reveal: PublicReveal | null;
  votesLocked: boolean;
  timerSeconds: number;
  timerDurationSeconds: number;
  timerRunning: boolean;
  participants: number;
  teamScores: Record<string, number> | null;
  /** Exactly the four fields the production relay accepts (vof_relay.valid_room_state). */
  leaderboard: { name: string; score: number; rank: number; team: string | null }[];
  showdown: PublicShowdown | null;
  hostConnected: boolean;
  /** The host's show look (VOF-93) and its topic pattern switch (VOF-94). Optional: a host sends them by default, the production relay lists them once its room look migration is live, and a host whose relay refuses them goes on without (src/network/room-look.ts). */
  look?: string;
  patterns?: boolean;
}
export interface AttendeeState {
  sessionId: string;
  registered: boolean;
  nickname: string;
  team: TeamSide | null;
  vote: { questionInstanceId: string; choice: string; conviction: string } | null;
  result: { questionInstanceId: string; choice: string; isCorrect: boolean; points: number; streakBonus?: number } | null;
  score: number;
  correct: number;
  answered: number;
  accuracy: number | null;
  bestStreak: number;
  rank: number | null;
  totalParticipants: number;
  commitments: string[];
}
export interface JoinProfile { nickname: string; team?: TeamSide | null }
export interface ClientEnvelope {
  version: typeof PROTOCOL_VERSION;
  type: 'HELLO' | 'VOTE' | 'REACTION' | 'PREDICT_WINNER';
  roomId: string;
  sessionId: string;
  deviceId: string;
  messageId: string;
  questionInstanceId?: string;
  nickname?: string;
  team?: string | null;
  choice?: string;
  conviction?: string;
  reaction?: string;
  winner?: string;
  showdownId?: string;
}
export interface Acknowledgement { kind: 'ACK'; messageId: string; accepted: boolean; reason?: string }
