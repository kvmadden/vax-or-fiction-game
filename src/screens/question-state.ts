import type { VotingWindow } from "../data/types";
import { voteStatusAnnouncement } from "../engine/vote-status";
export type QuestionPhase = "entering" | "deliberating" | "locked" | "revealed" | "explaining";

export interface QuestionLocalState {
  questionId: string;
  subPhase: QuestionPhase;
  votingWindow: VotingWindow;
  selectedChoice: string | null;
}

export function createQuestionLocalState(questionId: string): QuestionLocalState {
  return {
    questionId,
    subPhase: "entering",
    votingWindow: "open",
    selectedChoice: null,
  };
}

export function localStateForQuestion(
  state: QuestionLocalState,
  questionId: string,
): QuestionLocalState {
  return state.questionId === questionId ? state : createQuestionLocalState(questionId);
}

export function updateLocalStateForQuestion(
  state: QuestionLocalState,
  questionId: string,
  update: Partial<Omit<QuestionLocalState, "questionId">>,
): QuestionLocalState {
  return { ...localStateForQuestion(state, questionId), ...update };
}

export interface QuestionAnnouncementOptions {
  phase: QuestionPhase;
  remainingSeconds: number;
  slideAnnouncement: string;
  votesIn: number;
  phonesJoined: number;
  /** The correct-choice text shown on the reveal card (A11Y-06). Optional so every existing
   * caller that does not supply it keeps the exact prior "Answer revealed." announcement. */
  revealedAnswerText?: string;
  /** W3: the lead-in phrase the card itself shows next to that text ("The myth", "Better
   * reply"), so the announcement never invents a different framing than the sighted card.
   * Defaults to "Correct choice" so binary and estimate keep their existing wording. */
  revealedAnswerLabel?: string;
  /** W3: order's "Correct order" is already a complete sentence on the card (a heading, not a
   * value to introduce), so it must not be glued behind a label and colon. */
  revealedAnswerIsSentence?: boolean;
}

export function questionAnnouncement({
  phase,
  remainingSeconds,
  slideAnnouncement,
  votesIn,
  phonesJoined,
  revealedAnswerText,
  revealedAnswerLabel,
  revealedAnswerIsSentence,
}: QuestionAnnouncementOptions): string {
  if (phase === "revealed") {
    const base = voteStatusAnnouncement("revealed");
    if (!revealedAnswerText) return base;
    // W3 and QUOTE-PERIOD: authored copy that already ends a sentence (a myth statement ending in
    // a period, or which-patient's spoken reply wrapped in quotes by engine/kinds.ts
    // spokenReplyText, so a period then a closing quote) is announced as written. Only text that
    // does not already end in terminal punctuation, optionally followed by closing quotes, gets
    // the announcement's own period. Nothing is trimmed, so a quoted reply keeps both of its
    // quotes and a possessive plural keeps its apostrophe.
    const text = revealedAnswerText.trim();
    const sentence = /[.!?…][”’"'»]*$/.test(text) ? text : `${text}.`;
    if (revealedAnswerIsSentence) return `${base} ${sentence}`;
    return `${base} ${revealedAnswerLabel ?? "Correct choice"}: ${sentence}`;
  }
  if (phase === "explaining") return "Explanation. Votes remain locked.";
  if (phase === "locked") {
    return voteStatusAnnouncement("locked", { votesIn, phonesJoined });
  }
  if (phase === "deliberating" && remainingSeconds <= 5 && remainingSeconds > 0) {
    return "5 seconds remaining";
  }
  if (phase === "deliberating" && remainingSeconds <= 10 && remainingSeconds > 5) {
    return "10 seconds remaining";
  }
  return slideAnnouncement;
}
