# Question difficulty rubric

Written 2026-09-28. Companion to `docs/QUESTION-BANK.md`.

**What this rubric is and is not.** It rates how hard a question is to answer for a mixed room, not whether its content is correct. The ratings in `content/bank/metadata/` were made by AI model raters (each record names the model and run), following the protocol below. They are difficulty estimates, not clinical review. Factual claims rest on the public sources each question cites.

Every question in the bank carries one of four difficulty levels: easy, medium, hard or expert. A level is first set by raters using this rubric. The design also allows real play to tune it later (see "Tuning by play" below), which is not built yet. This page is what a rater reads before rating.

## Who the levels are measured against

The reference audience is a mixed room of pharmacy team members: pharmacists, technicians, interns and pharmacy leaders. That is the room the hosted show is built for. Solo players include the general public, so solo accuracy runs lower. Play data is kept per surface for that reason.

Rate for that room, not for yourself. A rater who knows immunization well will find most questions easy. Ask what share of that mixed room would actually know the answer before seeing the choices.

## The four levels

| Level | Plain definition | Who should get it right | Share of the room who know it |
|---|---|---|---|
| Easy | Widely held knowledge, a figure the room hears all the time (like "one in three" for shingles), a myth most pharmacy staff already reject, or an answer the question itself makes clear. Nothing the room would have to look up. | Nearly everyone on a pharmacy team, including new technicians. Most adults. | 75% or more |
| Medium | One piece of standard vaccine knowledge that pharmacy teams use routinely: a common recommendation, a routine schedule fact, a standard screening rule. | Most pharmacists and experienced technicians. Newer staff and the public split. | 50% to 75% |
| Hard | Exactly one specific detail that is easy to misremember (a number, an interval, an age cutoff, a product difference, a population boundary), or one standard rule applied to a case with one complicating fact. | Most immunizing pharmacists. Fewer technicians. Few members of the public. | 25% to 50% |
| Expert | Two or more specific details that must be combined, an exception to a rule, or a recent change most of the room has not caught up with (the old rule is still what they remember). A precise figure on its own is hard, not expert. | Pharmacists who immunize often and keep up with changes. Most others miss it. | Under 25% |

### Target accuracy band, by kind

"Share who know it" is what a rater estimates. What play measures is the share who answer right, and guessing inflates that. A true or false question gets about half right by chance alone. So each level has an accuracy band per kind, set by the chance of guessing right:

`expected right = chance + known × (1 - chance)`

| Kind as played | Chance | Easy | Medium | Hard | Expert |
|---|---:|---:|---:|---:|---:|
| True or false | 1 in 2 | 88% or more | 75% to 88% | 63% to 75% | under 63% |
| Which reply is better (two replies) | 1 in 2 | 88% or more | 75% to 88% | 63% to 75% | under 63% |
| Three choices (myth, or a three-choice scenario) | 1 in 3 | 83% or more | 67% to 83% | 50% to 67% | under 50% |
| Four choices (four-choice scenario) | 1 in 4 | 81% or more | 63% to 81% | 44% to 63% | under 44% |
| Estimate with five ranges | 1 in 5 | 80% or more | 60% to 80% | 40% to 60% | under 40% |
| Order, three steps | 1 in 6 | 79% or more | 58% to 79% | 38% to 58% | under 38% |
| Order, five steps | 1 in 120 | 75% or more | 50% to 75% | 26% to 50% | under 26% |

The tuning script computes chance per question from its own options (the number of choices or ranges, and every range the engine accepts as right, or one ordering out of all orderings for an order question), so the table above is a guide, not a lookup the script depends on.

Two edges mean "look at the question, do not relabel it":

- Right more than 95% of the time: a free point. That can be fine as an opener, but check whether it teaches anything.
- Right less often than chance: the room is being pulled to a wrong answer. A strong, real misconception can do that, and so can a misleading stem, a wrong key or a stale fact. Review it before calling it expert.

## How to rate

1. Read the question the way a player meets it: the instruction line, the question, the scenario card if there is one, and the choices.
2. Name what a player must know to get it right. Count the specific details: none (easy or medium), one (hard), two or more that must be combined (expert). Write it in the reason line.
3. Check the choices. For a choice question, the distractors set the difficulty as much as the topic does. An absurd distractor makes a question easy whatever the subject. For an estimate, ask whether the right range is the one most of the room would guess.
4. Pick the level whose definition fits, for the reference audience.
5. Check the traps below. A trap either changes your rating (rate the knowledge, not the noise), adds a wording flag, or makes the question a defect.
6. Write one line of reason, 140 characters or fewer, naming the knowledge required.
7. Mark yourself sure or unsure. Unsure is information, not failure.

### Levels, wording flags and defects are three separate calls

- **Level** rates what a player must know to answer the question as written. A giveaway lowers that (traps 5 and 6). Noise that only makes a question harder to read, like jargon, a buried hinge or dense options, never raises it.
- **A wording flag** records a problem in how the question reads: a buried hinge, jargon, extreme words, options that are hard to parse, a structure that gives the answer away, or too much length. For a new draft, any wording flag should be fixed before the question ships. For shipped text, the flag is a note for the author.
- **A defect** blocks the rating: an ambiguous or wrong key, a claim a careful expert could fairly dispute, or a stale fact.

## Anchor examples from the bank

These are real questions from the current decks, rated with this rubric. The first set was chosen outside the pilot, so the pilot raters never saw a pilot answer. The author-calibrated set was added after the pilot, because the pilot showed raters set the bar for easy lower than the author does (see "Pilot, 2026-09-28" below).

### Author-calibrated anchors

The game's author rated these directly, so they outrank any rater's view:

- **Easy (VOF-37, "softballs"):** `vax-or-fiction:q36` (stock sterile water is no substitute for a supplied diluent) and `vax-or-fiction:q13` (the shingles myth among three: "not needed after a shingles episode"). VOF-37 cut a third question, `vax-or-fiction:q34`, "as softballs or a second estimate in a row" without saying which, so q34 is not an anchor.
- **Easy (VOF-50, "too easy"):** `vax-or-fiction:q20` (about 1 in 3 people get shingles in their lifetime).
- **Hard to parse (VOF-50, "confusing"):** `vax-or-fiction:q29` (which child needs a second flu dose today). The knowledge it needs is expert, two rules combined. The author's call is about how it reads: dense options that a player who knows the rules can still misread. Rate the knowledge and flag it hard to parse.

In the pilot, each version of the rubric put one of these three easy questions at medium, a different one each time. Read these before rating: a figure or myth the room meets every week is easy even when it is a number.

### Easy

- `pneumococcal:q2`, true or false, key FALSE. "Pneumococcal vaccination protects individuals against viral respiratory illnesses such as influenza and COVID-19." Anyone who gives vaccines knows a pneumococcal shot is not a flu or COVID-19 shot.
- `art-of-the-offer:q3`, which reply is better. A patient worries two shots together will overwhelm their immune system. One reply sends them away to come back next week. The better reply is clear from the choices alone.
- `hpv:q2`, true or false, key FALSE. "Routine HPV vaccination is recommended exclusively for females because males do not develop HPV-related malignancies." HPV vaccine for boys is widely known, and "exclusively" flags the myth.

### Medium

- `vax-or-fiction:q35`, true or false, key TRUE. "A mild cold, even with a low fever, does not by itself require delaying an inactivated flu shot." A routine screening rule that most pharmacy staff apply, though many people think any fever means wait.
- `vax-or-fiction:q30`, three-choice scenario. A 70-year-old wants a flu shot and no high-dose, recombinant or adjuvanted vaccine is in stock. One standard rule (a product preference never costs the dose) against one tempting wrong move (wait).
- `tdap:q2`, true or false, key TRUE. Adults get a tetanus and diphtheria booster every 10 years. A routine schedule fact that is widely taught. Its jargon ("decennial") is a wording problem, not a difficulty signal.

### Hard

- `vax-or-fiction:q4`, true or false, key TRUE. "HPV causes more throat cancers in men than cervical cancers in women." A short question with a counterintuitive answer. Most people assume cervical cancer is the larger number.
- `vax-or-fiction:q22`, four-choice scenario. Who needs pneumococcal conjugate vaccine today? One specific detail, the age-50 threshold, applied across four adults. Treating an unknown history as none is standard practice, so it does not count as a second detail.
- `vax-or-fiction:q10`, true or false, key TRUE. An adult can finish a hepatitis B series in about one month. True only because of one product's two-dose schedule, a detail many staff do not know.

### Expert

- `vax-or-fiction:q17`, true or false, key TRUE. Two different live injectable or intranasal vaccines given 21 days apart: the second does not count. The player has to combine the same-day-or-four-weeks rule with the fact that no grace period applies to it.
- `vax-or-fiction:q32`, three-choice scenario (held from play for its seasonal framing, VOF-32). A first maternal RSV vaccine request at 37 weeks. The player needs the end of the maternal window and the switch to infant antibody protection after it.

## Traps: noise, wording problems and defects that look like difficulty

1. **Length is not difficulty.** `art-of-the-offer:q13` has a long question and a long scenario and is medium. `vax-or-fiction:q4` is twelve words and is hard. A long stem is a readability problem (wording flag), never a reason to rate up.
2. **Hard to parse is not hard to know.** If a player who knows the rule could still pick wrong because the options are dense or the case is hard to read, rate the knowledge and add a wording flag. Confusing is a wording problem, not a level.
3. **Trick wording is a defect.** If a careful expert could defend the wrong answer, if the key turns on an unstated assumption, or if a double negative does the work, flag a defect. Do not rate it expert.
4. **A hinge word must be the visible lesson.** `season-2:q16` ("A clean minor cut always requires a tetanus booster after two years") turns on "always". A hinge counts as the lesson only when the stem puts it up front or underlines it, and the reveal names it. A hinge that trails at the end, unmarked, while other parts of the stem are underlined, measures attention, not knowledge: rate the knowledge and add a buried-hinge wording flag.
5. **Extreme wording gives the answer away.** `influenza:q3` ("exclusively under prolonged inpatient observation"), `rsv:q6` ("a double dose to overcome immune suppression") and `hepatitis-b:q2` ("legally prohibited") are easy whatever their subject, because no real guidance talks that way. Rate a full giveaway easy. A milder tell, like "any" in one of three myth statements, lowers the level by one instead. Either way, add a wording flag.
6. **A structure that gives the answer away makes it easy.** Order steps that name their own place ("first", "four weeks later", "after dose two"), or a question whose premise rules out a choice, are easy whatever the topic. Rate easy and add a wording flag.
7. **Jargon is not difficulty.** `influenza:q4` ("contain non-replicating viral antigens and cannot transmit or cause viral influenza disease") is the easy idea that a flu shot cannot give you flu, dressed in clinical words. Rate the idea and add a wording flag (plain language, VOF-23).
8. **Kind is not difficulty.** Points follow the kind (VOF-51: binary 100, estimate and myth 150, which-patient 200, order 250), but kind does not set the level. A two-reply question can be easy and a true or false question can be expert.
9. **The same concept can sit at different levels.** `vax-or-fiction:q9` ("Exposure to one HPV type means Gardasil 9 cannot protect against the others") and `hpv:q5` ("...eliminates all clinical benefit...") test one idea, and the word "all" makes the second easier. Rate each question as written. They share a concept tag, so a round never deals both, and adaptive play can use one as the other's easier or harder twin.
10. **A stale fact is a defect.** A question whose key changed with new recommendations is wrong, not expert. `pneumococcal:q1` is held because it teaches age 65 while current guidance says 50 (VOF-44). Flag it. Never rate a stale question up.
11. **Rate an estimate by the guess it invites.** If the right range is where most of the room would guess, or the figure is one the room hears often, it is easy or medium however precise the number is. A counterintuitive value in narrow ranges is hard.
12. **Rate for the room, not for yourself.** See the reference audience above.

## Rater protocol

1. **Two independent raters.** Each works in a separate context. Each sees the rater packet (the kind, instruction line, question, scenario, choices, key, reveal and takeaway) and this rubric. Neither sees the other's rating, any earlier rating, play data, or which deck or mode the question sits in.
2. **One line of reason, always.** Each rating records the level, a reason of 140 characters or fewer that names the knowledge required, sure or unsure, and any wording flags (buried hinge, jargon, extreme words, hard to parse, gives itself away, too long).
3. **A rater may call a defect instead of rating.** Use it for trick wording, an ambiguous or wrong key, or a stale fact. The call carries its own one-line reason. A defect blocks the rating until the question is fixed. A rater never edits question text. The defect goes to the author, who can hold the question out of play or rewrite it.
4. **A third rater adjudicates any split, and any question both raters were unsure of.** Any difference, including level against defect, goes to a third rater in a fresh context, and so does a question where both raters agree but both marked unsure. The adjudicator sees both ratings and both reasons, picks the final level, and records a one-line reason. When the two raters are two or more levels apart, the adjudicator rates from scratch first and then reads theirs. Wording flags are merged, not adjudicated: a flag either rater raised stays on the record.
5. **Every rating is recorded.** Both raters, the adjudicator when there is one, the final level, the date, and the rater identity (for an agent, its run id and model).
6. **Agreement is checked per batch.** Report exact agreement and linear-weighted Cohen's kappa. If exact agreement falls below 60% or weighted kappa below 0.5, stop the batch, revise the anchors or definitions that caused the splits, and re-rate the batch. Also check direction: if one rater sits higher (or lower) on most splits, re-brief that rater on the anchors before the next batch.
7. **The author's call wins.** When the author rates a question's difficulty directly (for example "too easy"), that call is recorded as a rating with its source and it overrides the raters.
8. **Estimates are provisional.** Raters cannot see the guess a room will make, and the pilot's least certain ratings were estimates. An estimate's rubric level stands until play data arrives, and estimates go first in the tuning queue.

## Tuning by play

Not implemented. The game records no per-question answer data today. The design, for when it does: a rubric level is a starting point, and once a question has enough answers, play decides. The rule, in short: after at least 60 room answers across at least 8 separate games (or, for a question without enough room answers, 120 solo answers calibrated to the room scale), the question moves one level when the whole 90% confidence interval of its chance-corrected accuracy sits outside its current band by 5 points or more. It moves one level at a time and then waits for 60 more answers. A question answered right less often than chance is reviewed as a possible defect before any move.

## Pilot, 2026-09-28

**What ran.** 24 questions across all five kinds and all ten solo topics (9 binary, 5 which-patient, 4 estimates, all 3 myths, all 3 orders), including the three the author has plainly called easy, a fourth the author cut for being a softball or a second estimate in a row, and the one the author called confusing. All raters were AI model instances. Two raters in separate contexts rated blind with the first version of this rubric. A third, in a fresh context, adjudicated the splits. After the rubric was revised, a fourth rater in a fresh context rated all 24 again with the revision. The per-question pilot table is not included in this repository.

**Agreement.**

| Comparison | Exact | Within one level | Linear-weighted kappa |
|---|---:|---:|---:|
| Rater A vs rater B, first version | 18 of 24 (75%) | 24 of 24 | 0.75 |
| Fourth rater, revised version, vs final levels | 18 of 24 (75%) | 24 of 24 | 0.72 |

Both clear the batch gate (exact 60%, weighted kappa 0.5). Every disagreement was one level apart. Final levels: easy 9, medium 8, hard 6, expert 1.

**Weak spots the pilot found, and what changed.**

1. **Easy was set lower than the author sets it.** Of the three questions the author has plainly called easy, the final levels put one at medium (`vax-or-fiction:q20`) and the fourth rater put a different one at medium (`vax-or-fiction:q13`). Both versions also rated q34 medium, but the author's reason for cutting q34 is ambiguous. The first version said easy needs "no specific number", so a famous figure like "one in three" for shingles got rated up. Changed: a figure the room hears all the time counts as widely held knowledge, and the author's calls are now anchors.
2. **Hard and expert overlapped.** "A detail that is easy to misremember" and "a precise figure experienced immunizers get wrong" read as the same thing. Changed: one specific detail is hard, two or more combined (or an exception, or a change the room has not caught up with) is expert.
3. **Wording problems had nowhere to go.** A buried hinge (`vax-or-fiction:q24`, where the underline sits on the two true parts and the false word "late" trails unmarked), steps that name their own place (`vax-or-fiction:q27`), and a premise that rules out a choice (`art-of-the-offer:q18`) were either rated up or rated easy with no record of why. Changed: levels, wording flags and defects are now three separate calls. With the revision, the fourth rater flagged all three.
4. **Confusing still slipped through.** No rater flagged `vax-or-fiction:q29`, which the author dropped as confusing. All rated its knowledge expert, which is right, but none said it reads badly. Changed: "hard to parse is not hard to know" is now a trap, and q29 is its anchor.
5. **Estimates are the least reliable.** Three of the four estimates drew an unsure from at least one rater, and two were in splits. Raters cannot see the guess a room makes. Changed: estimate levels are provisional and go first in the tuning queue.
6. **Mild tells were over-corrected.** The extreme-wording trap said "rate easy", which felt too strong for a mild tell like "any". Changed: a full giveaway is easy, a mild tell lowers one level.
7. **One rater ran high.** Rater B was higher than rater A on five of six splits. Adjudication absorbed it (it sided with each rater on some), and the protocol now checks each batch for direction.

**Where rater A was unsure:** 9 of 24. They cluster in the same weak spots: the two estimates with neighboring plausible ranges (`vax-or-fiction:q19`, `:q14`), how familiar the sixfold heart-attack figure is (`vax-or-fiction:q2`), the buried hinge (`:q24`), the dense four-choice case (`:q29`), folk wisdom about rusty nails (`:q31`), a wrong reply that sounds like something people really say (`art-of-the-offer:q12`), an order whose middle two steps are arguable (`vax-or-fiction:q15`, whose own reveal says a real conversation can loop back), and a schedule detail (`hpv:q3`). Three of the nine became splits.

**Content notes from raters (text not changed by the rating pass):** `vax-or-fiction:q24` has a buried hinge. `vax-or-fiction:q27` and `:q28` give their order away. `art-of-the-offer:q18`'s question gives the answer away, and one rater noted its keyed reply overclaims ("complete liver defense"). `vax-or-fiction:q15`'s order is arguable by its own reveal. `hepatitis-b:q7` uses jargon.

## Public eight-question showcase

The eight influenza records in the public showcase retain their original AI ratings and rationale, but all eight ratings are provisional until fresh human play calibration. Rater agreement is not player difficulty quality or clinical review. The showcase evidence and pilot do not validate difficulty.
