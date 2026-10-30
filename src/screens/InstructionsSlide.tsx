import React from "react";
import { FormatId, StaticSlide, SlideEntry, Venue } from "../data/types";
import { ShowChrome } from "../components/show/ShowChrome";
import { ShowFrame } from "../components/show/ShowFrame";
import { useRoom } from "../presentation/RoomContext";
import { useGameStore } from "../store/game-store";
import { isIntroCountdownRunning } from "../engine/intro-countdown";
import { IntroCountdown } from "./IntroCountdown";
import { phonesCanVote } from "./setup-polling";

export interface InstructionStepItem {
  number: number | string;
  title: string;
  description: string;
}

const CANONICAL_INSTRUCTION_STEPS: InstructionStepItem[] = [
  { number: 1, title: "Make your call", description: "Vote on your phone." },
  { number: 2, title: "Hash it out", description: "Say what shaped your answer." },
  { number: 3, title: "See the evidence", description: "The reviewed answer, with its source." },
];

export interface InstructionsSlideProps {
  slide?: StaticSlide | SlideEntry;
  title?: string;
  eyebrow?: string;
  body?: string;
  steps?: InstructionStepItem[];
  hintText?: string;
  format?: FormatId;
  formatId?: FormatId;
  venue?: Venue;
  interactive?: boolean;
  onStart?: () => void;
  className?: string;
}

export const InstructionsSlide: React.FC<InstructionsSlideProps> = React.memo(({
  slide,
  title: propTitle,
  steps = CANONICAL_INSTRUCTION_STEPS,
  format: propFormat,
  formatId: propFormatId,
  venue,
  interactive = true,
  onStart,
  className = "",
}) => {
  const format: FormatId = propFormat || propFormatId || "widescreen";
  const { roomId } = useRoom();
  const interactionMode = useGameStore((state) => state.interactionMode);
  const introCountdownAt = useGameStore((state) => state.introCountdownAt);
  const nextQuestionNumber = useGameStore((state) => {
    const next = state.run?.[state.slideIndex + 1] as { displayNumber?: unknown } | undefined;
    const number = Number(next?.displayNumber);
    return Number.isFinite(number) && number > 0 ? number : 1;
  });
  const counting = introCountdownAt !== null && isIntroCountdownRunning(introCountdownAt, Date.now());
  // The step lines describe phone voting, so a hands-up game keeps the bare step titles.
  const showDescriptions = phonesCanVote(venue ?? "teams", interactionMode ?? "facilitator");
  const resolvedTitle =
    propTitle ||
    slide?.title ||
    (slide && "headline" in slide && slide.headline) ||
    "Talk first. Reveal second.";
  const joinHost = typeof window === "undefined" ? "" : window.location.host;

  return (
    <main
      className={`screen instructions show-screen preshow-instructions ${className}`}
      data-screen="instructions"
      data-format={format}
      data-venue={venue}
      data-counting={counting ? "true" : undefined}
      data-comp-id="instructions-slide"
    >
      <ShowFrame
        scrim="left"
        className="instructions-show-frame"
        beat="instructions"
      >
        <ShowChrome roomId={roomId} joinHost={joinHost} showJoin={venue !== "offline"}>
          {null}
        </ShowChrome>
        <div className="instructions-stage">
          <div className="instructions-source-poster" data-comp-id="instructions-poster">
            <div className="instructions-headline">
              <h1>{resolvedTitle}</h1>
            </div>
            <ol className="instructions-source-sequence" aria-label="How this works">
              {steps.map((step) => (
                <li className={`instructions-source-step step-${step.number}`} key={String(step.number)}>
                  <span className="instructions-step-number">{step.number}</span>
                  <span className="instructions-step-copy">
                    <span className="instructions-step-text">{step.title}</span>
                    {showDescriptions && step.description ? (
                      <span className="instructions-step-description">{step.description}</span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ol>
            {interactive && onStart ? (
              <button className="opening-screen-action facilitator-press" type="button" onClick={onStart}>
                Start Question 1
              </button>
            ) : null}
          </div>
        </div>
        {counting && introCountdownAt !== null ? <IntroCountdown startedAt={introCountdownAt} questionNumber={nextQuestionNumber} /> : null}
      </ShowFrame>
    </main>
  );
});

InstructionsSlide.displayName = "InstructionsSlide";

export default InstructionsSlide;
