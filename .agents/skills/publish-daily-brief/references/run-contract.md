# Run contract

## Preflight

- Work only in the saved `paper-morning-pass` repository on `main`, tracking `origin/main`.
- Fetch remote status before new work. Stop on divergence; never force-push or rebase.
- Require a clean worktree except for an existing validated Daily Brief commit awaiting push. Verify and push that commit before preparing new content.
- Determine the delivery date in `Asia/Hong_Kong`. Repository state calculates all unprocessed dates through the preceding day, including the Tuesday weekend safety check.

## Retrieval and source health

Use `npm run daily:prepare -- --delivery-date YYYY-MM-DD`. The production retry sequence is an initial attempt, 2 minutes, then 8 additional minutes. Use `--retry-delays-ms 0,0` only for an explicitly requested pilot/no-wait run or deterministic simulation.

Treat malformed markup/JSON, missing requested dates, challenge pages, uncorroborated empty responses, and unusually low uncorroborated counts as degraded. Never reinterpret failure as an empty publication day.

| Source result | Required action |
|---|---|
| All succeed | Publish a normal complete brief. |
| Partial succeed | Publish a prominent `Partial coverage` brief and report degradation. |
| All three fail | Publish nothing, retain the latest brief, and report failure. |
| All succeed, zero qualify | Publish a complete edition saying no papers met the quality bar. |

For partial coverage, list exact successful and failed sources/dates; advance watermarks only for successful sources. On a later run, backfill every pending date. Recovery must reconcile the same delivery-date edition, retain earlier complete coverage, and promote it to complete only when all three source records are complete.

## Draft and finalization

The prepared candidate manifest is the allow-list for new public paper records. Do not select papers supported exclusively by degraded source results. Every editorial claim needs a canonical paper/source URL; record the actual review depth. Use an empty affiliations array when affiliations are not verified.

Write `draft.json` beneath the ignored run directory, then invoke `daily:finalize`. The finalizer owns coverage, status, Markdown, candidate binding, and watermarks. For the historical pilot, stop for human review before finalization and publication.

## Verification and Git transaction

Run all repository gates. Review `git diff --check`, the full diff, and status. Only canonical paper data, the delivery-date edition JSON/Markdown, and `automation/state.json` may change during a content publication. Create one scoped commit, push without rewriting history, verify the Pages workflow, and open the public edition URL.

No-change reruns create no commit. Push or Pages failure leaves the validated local commit intact for retry.

## Report

- Complete: delivery date, source dates/counts, Read first and Worth skimming counts, commit hash, Pages result, live URL.
- Partial: prefix with `Partial coverage`; add exact failed/successful sources and retry attempt counts.
- Failed: state that all three fail, list public-safe failure details, and confirm no canonical file, watermark, commit, or push changed.
