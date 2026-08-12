---
name: publish-daily-brief
description: Prepare, research, validate, reconcile, and publish a Paper Morning Pass Daily Brief from arXiv cs.CV, arXiv cs.GR, and Hugging Face Papers. Use when the scheduled Paper Morning Pass run fires, when manually catching up a missed run, when piloting a historical delivery date, or when reconciling partial source coverage.
---

# Publish Daily Brief

Invoke this workflow explicitly as `$publish-daily-brief`.

Run the complete local Paper Morning Pass workflow without an OpenAI API key. Treat deterministic repository commands as authoritative for dates, source health, coverage, watermarks, schema validation, and Markdown generation; use editorial judgment only for research selection and evidence-backed summaries.

Read [run-contract.md](references/run-contract.md) before every run. Read [editorial-policy.md](references/editorial-policy.md) before selecting or summarizing papers.

## Inputs

Accept an optional delivery date in `YYYY-MM-DD`; otherwise use the current `Asia/Hong_Kong` calendar date. Accept `pilot` or `no-wait` only when explicitly requested; it replaces production retry waits with zero delays and stops at the human review gate.

## Execute

1. Run `npm run daily:preflight` and enforce the run contract. Stop on unrelated changes, a non-`main` branch, remote divergence, or an unvalidated local commit. If it reports `push_pending`, validate and push that existing commit before new work. Never force-push, reset, rebase, or overwrite user work.
2. Run `npm run daily:prepare -- --delivery-date YYYY-MM-DD`. In an explicit pilot/no-wait run, append `--retry-delays-ms 0,0`; production uses retries after 2 minutes and 8 additional minutes.
3. Inspect `.paper-morning-pass/runs/YYYY-MM-DD/candidates.json`. If all three fail, publish nothing and report the exact failures. If coverage is partial, continue only with candidates supported by successful sources and mark the final result `Partial coverage`.
4. Research every plausible candidate from primary sources. Follow the quality-first policy, with Graphics and Vision–Graphics winning only ties between similarly strong papers. Never impose a hard paper count.
5. Write ignored `.paper-morning-pass/runs/YYYY-MM-DD/draft.json` using the canonical paper and edition-entry schemas. Keep private notes, inferred personal interests, rejection rationales, and unpublished preference weights out of the draft, repository, commit, and task report.
6. In pilot mode, present the candidate edition for human review and stop before canonical writes. Include selected papers by tier and lane, review depth, primary evidence URLs, and near-boundary exclusions. Resume only after explicit approval.
7. Run `npm run daily:finalize -- --delivery-date YYYY-MM-DD`. Do not hand-edit coverage, publication status, generated Markdown, or watermarks; the finalizer derives them from the prepared manifest and reconciles an existing same-date edition.
8. Run `npm run validate:content`, `npm run check`, `npm test`, `npm run test:e2e`, and `npm run build`. Confirm that only expected canonical content and `automation/state.json` changed.
9. If canonical output is unchanged, create no commit. Otherwise commit once as `content: publish YYYY-MM-DD Daily Brief` or `content: reconcile YYYY-MM-DD Daily Brief`, push `main` normally, and verify GitHub Pages plus the edition URL. A push or Pages failure retains the validated local commit and is reported; do not rewrite history.
10. Return the concise report required by the run contract. A partial run is degraded and must identify every failed source/date; an all-failed run is failed and must confirm no repository change.

## Non-negotiable boundaries

- Process every unprocessed source date through delivery minus one; the Tuesday run includes a weekend safety check.
- Advance watermarks only for successfully validated source results.
- A failed, malformed, unexpectedly empty, or unusually small response is degraded, never “no papers.”
- All three succeed with no qualifying papers is a valid complete zero-entry edition.
- Later recovery updates the same partial edition and may promote it to complete.
- Do not implement personal controls, authentication, read/star mutations, or private notes in this workflow.
