# Question bank

How questions are described, rated, cited and dealt. Companion: `docs/QUESTION-DIFFICULTY-RUBRIC.md`.

## What is in it today

- 13 deck modules under `src/data/decks/` hold the player-facing text: 180 question appearances, 150 distinct
  questions once shared copies merge (30 appearances are copies of a question in another deck).
- Five kinds: true or false (112 of 150), which-patient or which-reply (27), estimate (5), myth among three (3) and
  order the steps (3).
- 11 subjects: flu, RSV, shingles, pneumococcal, HPV, hepatitis B, tetanus and whooping cough, COVID-19, general
  public health, at the counter, and what to say.
- Every appearance cites at least one source. Across all decks they point to 80 distinct URLs: 67 on cdc.gov, 9 on
  fda.gov, 2 on who.int, 2 on nlm.nih.gov. Each source records a publisher, a short display line and an accessed date,
  and the stage shows it on the evidence card after the reveal. The `/credits` page lists the sources of the two
  host decks.

Questions cite public sources. They have not had clinical review. This is an educational game, not medical advice.

## Metadata is a sidecar, not part of the question

`content/bank/metadata/<subject>.json` holds one record per distinct question, keyed by a permanent bank id
(`<deckId>:<questionId>` of its first appearance; other appearances are listed in `copies`). Metadata never lives
inline on a question, for three reasons:

1. Tuning a level or a tag never touches the player-facing text, so copy tests stay stable.
2. A question shared by two decks carries one record, so its two copies cannot drift apart.
3. Evidence and rating history never ship to the browser. `scripts/build-bank.mjs` writes a small runtime slice,
   `src/data/bank/metadata.generated.ts` (kind, subject, level, concept, rotation, status, skill, audience). Nothing
   under `src/` imports `content/bank/`.

A record also carries `textHash` and `textVersion`, so a wording change is visible as a new version of the question.

### Fields

| Field | Values |
|---|---|
| `conceptId` | A key in `content/bank/concepts.json` (121 concepts, each with a label, subject and vaccines). Two questions that test the same idea share a concept. |
| `rotation` | `core` (88): every solo round of the topic plays it. `alternate` (62): a twin of a core question, swapped in on a later play. |
| `difficulty` | `level` (easy 73, medium 53, hard 19, expert 5), `source` (`rubric` today), a one-line rationale, and every rating behind it. |
| `skill` | recall, application, judgment, communication, estimation, sequencing. Estimate and order kinds are always estimation and sequencing. A reply question is always communication. |
| `audience` | `everyone`, `pharmacy-team` (assumes pharmacy workflow), `immunizer` (assumes clinical immunization knowledge). |
| `tags`, `vaccines`, `populations` | Controlled lists in `concepts.json` and `src/data/bank/types.ts`. |
| `evidence` | `sourceIds` (the deck citation ids), `volatility` (`recommendation`, `seasonal`, `stable`) and a `reviewBy` date set from it: about 6, 12 or 36 months. |
| `wordingFlags` | buried-hinge, jargon, extreme-words, hard-to-parse, gives-itself-away, too-long. A note about how a question reads, kept separate from its level. |

### How a level was set

Each record holds two independent ratings from AI model raters (`rater-a`, `rater-b`, each naming its run and model),
plus an adjudicator's rating whenever the two split or both were unsure (47 of 150). Three records carry a direct
call from the author, which outranks the raters. The rubric defines the four levels against a mixed room, with an
expected accuracy band per kind that corrects for guessing. These are difficulty estimates. They say nothing about
whether a claim is correct.

## How a solo round is dealt

`src/solo/dealer.ts` is pure functions over the deck questions plus the id-keyed metadata map:

1. **Rotation.** A round plays the topic's whole rotation: every core question, plus each alternate whose concept no
   core question already covers. A concept with two alternates lends the round only one. One concept per round.
2. **Kind variety.** The order uses the fewest same-kind neighbors the kind counts allow, solved exactly with a
   memoized search rather than a greedy pass.
3. **Difficulty in thirds.** The first third prefers easy and medium, the middle medium and hard, the last hard and
   expert, falling back to the nearest level the pool has. The Climb pace sorts by level instead.
4. **Later plays.** On play two, each core question with a same-kind twin gives its place to that alternate, so the
   length and kind mix stay the same and the content changes. Play three returns to the core. A later play never
   opens on the same first three questions as the play before it.

`tests/unit/solo-dealer.test.ts` checks each rule against synthetic pools and against every real topic.

## What the tests hold

`tests/unit/bank-metadata.test.ts` fails when:

- a deck question has no record, or a record matches no deck question (coverage: 150 records, 180 appearances);
- a copy's stem, kind or answer differs from its primary;
- a field holds a value outside its vocabulary, or a `conceptId` or tag is missing from `concepts.json`;
- the metadata kind differs from the deck question's kind, or a kind has the wrong skill;
- a rating record lacks two raters, or a split or shared doubt lacks an adjudicator, or a reason runs over 140
  characters;
- a live record is past its `reviewBy` date (the clock is injectable, so this test is expected to fail when a re-check
  is due);
- a record carries player text, or `metadata.generated.ts` differs from a fresh `scripts/build-bank.mjs --check`;
- two core records in one subject and kind share a concept.

## Not built

- Tuning levels from real play. The rubric describes the rule (confidence interval of chance-corrected accuracy
  against each level's band), but the game records no per-question answer data.
- Host-side adaptive difficulty and a cross-topic adaptive solo mix.
- An agent drafting pipeline for new questions. `content/bank/sources.json` is the empty registry it would fill.
