import React from "react";
import { DEFAULT_DECK_ID, resolveBundledDeck } from "../data/decks";
import { kindOptions } from "../engine/kinds";
import { pictureUrl, useLook } from "./look";
import { TopicPatternSlot } from "./patterns/TopicPatternSlot";

/**
 * The picked look shown large on a sample question on the setup Look screen, so the host sees what the room will see
 * before the game starts. Setup itself stays in Today's navy in every look, so this is the one place the screen shows
 * the pick (the owner's ruling of 2026-10-05). The question is a real true or false card from the show deck, its words
 * and its answers come from the deck and the engine, and its topic pattern draws behind it exactly when the host's
 * switch says patterns are on, through the same slot the big screen uses. The set is the look's own big screen picture,
 * and the stem and the answers wear the look's own treatment at the stage's proportions (picker.css). It follows reduced
 * transparency and forced colours the way the stage does. It shows the look the page wears, which follows a pick as soon as
 * that look's stylesheets have loaded, so its picture and its treatment always belong to the same look (the radios show the
 * pick itself at once). It carries no information the radios do not, so it is decoration only (aria-hidden).
 */
const SAMPLE_ID = "q6";
const SAMPLE = resolveBundledDeck(DEFAULT_DECK_ID)?.questions.find((question) => question.id === SAMPLE_ID) ?? null;
const ANSWERS = kindOptions(SAMPLE) ?? [];

export const LookSample: React.FC = React.memo(() => {
  const { look, stageArt } = useLook();
  // The big screen shows its picture unless the page asks for the drawn set (&art=drawn), and the sample follows it.
  const picture = stageArt === "ai" ? pictureUrl(look, "stage") : null;
  const statement = SAMPLE?.statement ?? null;
  if (!statement) return null;
  return (
    <div className="look-sample" data-sample={look} aria-hidden="true">
      {/* Bottom to top in the stage's order: the picture, the calm hold over it, the topic pattern over the hold, then the
          question. The picture is keyed by the look, so a pick never shows the last look's picture under the new treatment. */}
      {picture ? <img key={look} className="look-sample__picture" src={picture} alt="" decoding="async" /> : null}
      <span className="look-sample__scrim" />
      <TopicPatternSlot surface="preview" statement={statement} />
      <span className="look-sample__question">
        <span className="look-sample__stem"><span className="look-sample__words">{statement}</span></span>
        <span className="look-sample__answers">
          {ANSWERS.map((answer) => (
            <span key={answer.token} className="look-sample__answer" data-side={answer.token === "false" ? "fiction" : "vax"}>
              <span className="look-sample__label">{answer.label}</span>
            </span>
          ))}
        </span>
      </span>
    </div>
  );
});

LookSample.displayName = "LookSample";

export default LookSample;
