# Public eight-question verification

The content and pilot are pending human work. This report describes software checks only. The complete repository gate is RED, not fully verified. All run logs and requested captures are preserved in a local evidence directory outside the repository.

## Scope

Public base is `kvmadden/vax-or-fiction-game` at `3b1154ec49ea953d893e1dabacbe2ab8726a2347`. The reviewer interface and decision model were adapted from earlier unreviewed work. No question data, history or approvals came with them, and they are not clinical or engineering approval for this revision. No other open PR covers this work.

The repository was fetched and its complete tree and matching source text inspected. The public bank, source sidecars, existing source-link, projection, order-token, scoring, accessibility and production-manifest checks were reconciled before implementation. The selected eight records are all binary and already belong to the public influenza deck. The bank remains 150 records and 180 deck appearances. The selected evidence has eight question records, eight question appearances, eight supporting claims, 36 authored factual field appearances and nine review rows. Runtime reveals and dynamic closing views reuse those frozen fields. Screen visits and repeated rendering are not additional independent facts. A test exercises every possible closing split and all eight takeaway routes against the frozen supported fields. Those eight claims use six clinical source documents. Rights policy is a seventh saved document.

Toolchain is Node `v24.14.1`, npm `11.11.0`, the committed package lock and Playwright `1.61.1` Chromium. Dependencies came from `npm ci --no-audit --no-fund` in both candidate and untouched control. The control was a fresh clone in a temporary folder, with no sibling repositories. No production services, accounts or paid APIs were used.

## RED before implementation

| Command | Exit | Observed failure |
| --- | --- | --- |
| `node --import tsx --test tests/showcase/evidence.test.ts` | 1 | Missing `scripts/showcase.mjs` after dependency installation. The earlier missing-tsx prerequisite failure was resolved before this RED run. |
| `node --import tsx --test tests/showcase/functional.test.ts` | 1 | Missing replay module. |
| `node --import tsx --test tests/showcase/evidence.test.ts` | 1 | An incomplete seven-question deck returned true for clinical signoff despite fresh row approvals. The scope guard now rejects it. |
| `node --import tsx --test tests/showcase/launch.test.ts` | 1 | The proposed host link selected the default bank because the launch parser ignored the deck. The explicit public influenza link now selects eight questions with the timer off. |
| `node --import tsx --test tests/showcase/display.test.ts` | 1 | Retrieved source text was labeled Reviewed evidence and Verified Nov 2026. It now says Source evidence and Retrieved, with Draft review visible. |

The RED logs are `red.log`, `functional-red.log`, `incomplete-red.log`, `source-label-red.log` and `launch-red.log` in the evidence home. Negative controls also remove a supporting claim, change a source span, break a citation, change text, key or source, add an unsupported factual field, replace a facilitation cue with a factual claim, change public import hashes and inject frozen content into a participant chunk. These are synthetic mutation controls and are not counted as authentic clinical errors.

## Focused checks

| Command | Exit | Actual coverage |
| --- | --- | --- |
| `node --import tsx --test tests/showcase/*.test.ts` | 0 | 15 checks for evidence coverage, bank reconciliation, stale approvals, incomplete signoff, public import hashes, pending state, broken sources, source labeling, all/none controls, permutations and pre-reveal payloads. |
| `node --test tests/showcase/browser.test.mjs` | 0 | Keyboard reveal and source focus, Escape focus return, reduced motion, 44 pixel controls, no overflow, actual downloaded-file import/export, persistence and stale import rejection at all six viewport/theme combinations. |
| `node --test tests/showcase/participation.test.mjs` | 0 | One synthetic player through eight actual local-relay questions, changed vote, duplicate resubmission, reconnect before reveal, source focus, two phone sizes, keyboard reveal and source-dialog focus return, written non-color outcomes, 950 final points and no rescore on back/forward. |
| `VOF_BUILD_MANIFEST=1 npm run build` | 0 | Production TypeScript and Vite build with test-only manifest. |
| `npm run test:showcase-assets` | 0 | Two checks of the real production participant import graph and an injected-leak control. Host and solo keys remain separate. |
| `npm run lint` | 0 | Existing repository warnings remain. |

Two of two fixed bot sequences match their expected totals. The all-correct bot scores 950 points on eight attempts. The zero-correct bot scores 0 on eight attempts. Eight option/metadata permutations and eight pre-reveal question payloads are checked separately. The participant assets do not import the frozen question library or reviewer files. The standalone public evidence page deliberately exposes keys, so this is not a blind test or protection against deliberate public-answer browsing.

An initial new participation test attempted to change an answer by clicking an inactive receipt choice. The actual UI requires Change answer first. The test now uses that control and passes. No runtime restriction was bypassed. An early unit run also caught the intentional deck-picker inventory change and an absolute path in an uncommitted file. The picker assertion was updated for the newly selectable influenza deck and the path was made relative. No home-path guard was weakened.

## Full repository gate and limits

Both control and candidate ran `npm run check` with the same dependency lock and toolchain. The control was untouched `origin/main`. Its full gate exited 1 at `test:phone-fit`. Unit, lint, local relay, relay client, archive RPC, keyboard, phone voting and presenter remote suites passed before that failure. The phone-fit suite had two assertion failures and two timeouts. The complete error list is committed at `public/showcase/gate-errors.json`.

The first two candidate gate attempts exited 1 at `test:relay`. The existing mounted vote-announcement test exceeded its 20-second whole-test limit after printing its successful assertion coverage. Other relay tests passed. This is a candidate-only full-gate difference and is not claimed as a shared baseline failure. Its isolated rerun exited 0 at about 19.1 seconds. The matched isolated control rerun exited 0 at about 6.8 seconds. The final candidate gate passed the mounted announcement and other early suites, then failed the short/sideways phone suite. No timeout or hook was weakened. Later full-gate suites remain unexecuted wherever an earlier command failed.

A later focused unit run validates the canonical metadata evidence and provisional ratings after reconciliation. The final source snapshot is checked by `showcase:build` followed by `scripts/showcase.mjs --check`. Browser captures were refreshed after source and review-label changes. Rendered synthetic checks are not physical phone, screen-reader user or clinical review evidence.

Clinical accuracy is N/A with zero reviewed claims. A source-document bootstrap interval is N/A. No facilitator or player has completed the human protocol, so there are zero human task attempts and no usability completion rate. The blank pilot ledger and protocol remain visibly pending. No clinical-review or learning-effectiveness claim is made. No second independent clinical review was performed. Nothing was deployed or merged.

## Final comparison and complete history

| Run | Command | Exit | Result |
| --- | --- | --- | --- |
| Untouched public main | `npm run check` | 1 | Phone-fit suite: 13 tests, 9 pass, 2 assertion failures, 2 timeouts. |
| Final candidate | `VOF_VISIBLE=1 VOF_SHOWCASE_MEDIA=<evidence directory>/media npm run check` | 1 | Phone-fit suite: 13 tests, 5 pass, 2 assertion failures, 6 timeouts. |
| Final repository unit suite | `npm run test` | 0 | 1,331 pass. |
| Mounted announcement, candidate | `node --test --test-name-pattern='mounted lock announcement' tests/integration/mounted-room.test.mjs` | 0 | About 19.1 seconds. |
| Mounted announcement, untouched control | Same focused command | 0 | About 6.8 seconds. |

The final gates share a failing test for reachable phone controls, but the reported viewport rows differ. The candidate also has additional reduced-motion, resize, dock-scale, focus, nickname and reorder-announcement failures or timeouts. Those differences remain unresolved. No cause is asserted from timing alone. The full raw failure blocks and sorted errors for both runs are published in `public/showcase/gate-errors.json`. The unchanged main control also had fade and order-focus failures that did not reproduce in that candidate run. These are not replaced with a single blended result.

Earlier history is retained in that JSON. The initial candidate unit run failed the intentional deck inventory change and the absolute path. Two later full attempts stopped on the mounted announcement timeout. A subsequent run caught the old unit contract that allowed only numeric estimates to be provisional. The selected uncalibrated AI ratings are now explicitly provisional and the updated contract passes. That candidate-only assertion failure was fixed, not attributed to the baseline. Another run reached phone-fit with one geometry failure. The final run and all prior logs remain separate.

The final functional controls remain 2 of 2 matching bot sequences, with 950 and 0 points. The clinical count remains 0 of 8 reviewed claims. The human pilot count remains zero attempts. All generated public evidence and report files pass their freshness check. Screenshots and the GIF show synthetic local activity, with no clinical or human-play approval implied.
