# Eight-question public evidence round

Open `/showcase/index.html` for the three evidence panels, source and rights chips, exact spans and full functional error list. Use **Host this eight-question round** on that page to launch Influenza Insights with eight questions and the timer off. Keep the timer off for discussion and accessibility tasks. All other selectable content remains outside this review.

Open `/clinical-review/index.html` for Kevin’s review sheet. It is unlisted and marked noindex but is public, with visible answers. It is not access protected. Read each question, key, exposed surface and original CDC source before approving. Flag with a note or skip if uncertain. Export after each session. Import replaces the local snapshot and rejects mismatched public content hashes.

```sh
npm ci
npm run dev
npm run showcase:build
npm run test:showcase
npm run review:apply -- path-to-kevin-export.json
npm run review:signoff
npm run check
```

`showcase:build` deliberately updates the frozen public evidence and functional replay report. Review must be repeated after content changes. `test:showcase` checks committed artifacts without refreshing them. Network retrieval is not part of the test gate. Offline link checks compare selected citations with the committed successful public retrievals and exact saved spans. This proves the saved provenance, not future URL availability or current clinical correctness.

The clinical panel is intentionally pending in this publication. Applying a reviewer export does not silently change public clinical claims. After Kevin completes review, a separate reviewed change must publish the current approvals and their source-document denominators, update the clinical panel and preserve this pending baseline. Never claim complete clinical review for an incomplete deck. There has been no independent second clinical review.

The eight supporting claims have 36 authored factual field appearances in eight question records and the closing slides. The review sheet has nine rows, including the opening and closing surfaces. Opening and presenter instructions are also included in the content hashes. The rest of the bank has 142 unique records outside this audit. Unique records, factual claims, question appearances and repeated factual surfaces are different denominators.

Clinical correctness is N/A with zero reviewed claims. A source-document bootstrap interval is also N/A. If a later reviewed result is published, resample source documents rather than repeated surfaces. Report the small number of independent documents and preserve the original counts. Do not manufacture an interval from eight correlated claims or treat unanimous AI difficulty ratings as clinical evidence.

The functional panel contains two recorded bot sequences with eight attempts each. All-correct is 950 points and zero-correct is 0 points. The full per-question points and errors are committed at `public/showcase/results.json`. Semantic option and metadata permutations, pre-reveal payload checks, import/export and browser tasks have separate tests. Other question kinds use the existing repository tests and are not counted as attempts in this binary round.

Failures are selected by wrong or stale claim, leaked answer, blocked participation, then stable ID. The showcase displays every recorded bot error, not a handpicked subset. There are currently no bot replay errors. Pending clinical review and pending pilot work are visibly listed separately. Mutation controls are synthetic failure tests, not authentic clinical-error observations.

The human pilot protocol is at `/showcase/pilot.html` with a blank results ledger at `/showcase/pilot-results.json`. One facilitator and four consenting adults must actually perform the tasks before any results are published. Record device and assistive technology versions, attempts, completions, failed joins, answer changes, source discovery, confusion and retries. Report actual counts by task and path. Preserve failed and unattempted tasks and prior sessions. The current ledger has no sessions or observations.

See [verification](SHOWCASE-VERIFICATION.md), [how it was built](HOW-BUILT.md) and [media](media/README.md).
