# Daily Brief automation design

## Goal and scope

Build a local Codex scheduled task that prepares and publishes Paper Morning Pass editions without an OpenAI API key. It runs Tuesday through Saturday at 06:00 in `Asia/Hong_Kong`, works directly in the saved local repository, and uses ChatGPT sign-in plus Codex's web and local-project capabilities.

This phase includes source ingestion, catch-up, editorial selection, evidence-backed summaries, reconciliation, validation, Git publication, a historical pilot, and the scheduled task. Supabase, GitHub OAuth, read/star editing, private notes, and all personal-control work are explicitly deferred until the automation has produced satisfactory real editions.

## Runtime behavior

- Create a standalone local Codex scheduled task named `Paper Morning Pass — Daily Brief`.
- Run at 06:00 Tuesday–Saturday using the `Asia/Hong_Kong` timezone.
- Use the saved `paper-morning-pass` Git project in local mode, not a worktree, because successful runs must update and push `main`.
- A run requires the laptop to be powered on, the project to remain on disk, and the desktop app to be running. A missed 06:00 run is started manually later from Scheduled; catch-up logic makes the later run equivalent to the missed run.
- Use the default signed-in model unless a later pilot demonstrates a quality problem. Do not require or store an OpenAI API key.

## Architecture

The automation has two cooperating layers.

### Deterministic repository tooling

Repository code owns mechanics that must not depend on editorial judgment:

- calculate delivery and unprocessed source dates;
- store public per-source watermarks and recent record-count history;
- normalize candidate metadata and stable external aliases;
- classify complete, partial, all-failed, suspicious, and zero-selection results;
- enforce per-source watermark advancement;
- validate same-edition reconciliation;
- render canonical Markdown from JSON;
- run repository checks, create one scoped commit, and push without rewriting history.

Transient run artifacts live under ignored `.paper-morning-pass/runs/`. Canonical public state lives in `automation/state.json` and advances in the same commit as the edition it describes.

### Repo-local Codex skill

The checked-in skill `.agents/skills/publish-daily-brief/` owns the repeatable research workflow:

- invoke deterministic preparation;
- inspect all candidates from the three approved sources;
- retrieve paper text and primary artifacts when needed;
- select papers using the approved editorial policy;
- author canonical paper and edition records;
- run deterministic validation and publication;
- return a concise normal, degraded, or failed run report.

The scheduled-task prompt explicitly invokes `$publish-daily-brief` so behavior does not rely on automatic skill selection.

## Sources and date semantics

The MVP sources remain:

| Source key | Public source | Target content |
|---|---|---|
| `arxiv_cs_cv` | arXiv cs.CV recent/API | New submissions and cross-lists whose source date is in scope |
| `arxiv_cs_gr` | arXiv cs.GR recent/API | New submissions and cross-lists whose source date is in scope |
| `huggingface_papers` | Hugging Face Daily Papers API/pages | Papers assigned to the requested Daily Papers date |

Replacements without a new qualifying source-date appearance do not create a new candidate. A later Hugging Face appearance or cross-list merges into the existing paper through external-ID aliases rather than creating a duplicate.

Each run processes every unprocessed date through the calendar day before its delivery date. Tuesday therefore checks Saturday, Sunday, and Monday as a safety measure even though weekend publication is normally empty. A source watermark means “all dates through this date were successfully retrieved and reconciled,” not “the source returned at least one paper.”

The pilot uses delivery date `2026-08-11` and source date `2026-08-10` for all three sources.

## Source retrieval, retries, and degradation

Each source attempt records:

- requested dates;
- attempt timestamps;
- HTTP/source outcome;
- normalized record count;
- validation signals;
- final status and public-safe detail.

The initial attempt is followed by retries after 2 minutes and 8 additional minutes for failed or suspicious sources. A source succeeds only when its response is structurally valid and its date/count signals are credible.

Count credibility uses recent successful history plus corroboration:

- malformed markup or JSON, a missing requested date, a challenge/error page, or impossible metadata is suspicious;
- a count far below the recent same-source weekday pattern is suspicious until a second source representation corroborates it;
- a legitimate empty day is complete only when the source explicitly identifies the requested date with no records, or an independent representation corroborates the absence;
- a failed or suspicious source is never interpreted as zero papers.

The retry delays are configurable for tests and the pilot; production defaults remain 2 and 8 minutes.

## Publication and reconciliation semantics

| Final source result | Publication behavior |
|---|---|
| All three succeed | Publish a complete edition. |
| One or two succeed | Publish an edition labelled `Partial coverage`, list every successful and failed source, and treat the scheduled run as degraded. |
| All three fail | Publish nothing, retain the last successful/partial brief, and treat the scheduled run as failed. |
| All succeed and no paper qualifies | Publish a complete zero-entry edition saying `No papers met the quality bar for this edition.` |

Every edition contains exactly one coverage record for each approved source. The edition-level status is `complete` only when all three sources are complete and `partial` otherwise. Public UI and Markdown show the exact status prominently.

Watermarks advance only for sources whose requested dates completed successfully. Failed-source dates remain pending. The next run backfills every pending date before newer dates.

If a later run recovers failed coverage for an already published partial delivery date, it updates that same edition, preserves its delivery URL, incorporates any newly qualifying papers, changes the status to `complete` when all sources have recovered, regenerates Markdown, and commits the reconciliation. It does not create a second edition for the same delivery date.

## Editorial policy

Selection is quality-first and has no hard numerical cap or minimum. A normal day may resemble three `Read first` papers plus five `Worth skimming` papers; an exceptional day may contain more high-priority papers.

The lanes are ordered only as a tie-break among similarly strong papers:

1. computer graphics and Vision–Graphics intersections;
2. broader computer vision;
3. complementary general AI, including worthwhile NLP.

Signals include novelty, technical substance, fit with graphics/vision research, evidence quality, code or artifact availability, expected research usefulness, and researcher/group reputation. Reputation supports selection but never substitutes for technical relevance or evidence.

For each `Read first` entry, provide a verdict, contribution, why it matters, evidence, limitation, review depth, reading estimate, and primary-source provenance. `Worth skimming` entries receive a concise two-to-four-sentence editorial note with provenance. Distinguish abstract-only review from full-paper and artifact review. Do not infer affiliations, code availability, benchmark gains, or reputation without a source.

The public taxonomy can express broad lanes and tags. Detailed inferred preferences, private notes, rejection rationales, and personal weights must not enter the public repository or scheduled-task prompt.

## Git and publication transaction

Before retrieval, the skill verifies:

- the checkout is `main` tracking `origin/main`;
- no unrelated working-tree changes exist;
- any existing local commit ahead of `origin/main` from a prior interrupted publication is validated and pushed before new work;
- remote divergence stops the run rather than forcing or rebasing.

After authoring:

1. write paper records, the edition JSON, generated Markdown, and state;
2. run content validation, unit tests, type/Astro checks, and production build;
3. confirm only allowed content/state files changed;
4. create one commit named `content: publish YYYY-MM-DD Daily Brief` or `content: reconcile YYYY-MM-DD Daily Brief`;
5. push `main` normally;
6. verify the GitHub Pages deployment and public edition URL.

No-change reruns create no commit. Push or Pages failure retains the validated local commit for a later retry and reports failure; it never rewrites history.

## Notification and run reporting

Normal complete runs report the delivery date, paper counts by tier, commit, and live URL in Scheduled. Partial publication reports `Partial coverage`, exact failed sources/dates, successful sources, retry history, commit, and live URL. All-failed runs report exact source failures and make no repository change.

Partial and all-failed outcomes are degraded/failed runs that require attention. The scheduled task uses failure-oriented notifications; normal output remains available in Scheduled and on the public site.

## Pilot and verification

Before scheduling, execute the skill manually for delivery date `2026-08-11`, covering `2026-08-10`. The pilot must:

- fetch all three sources without production retry waits;
- retain raw normalized candidate evidence in the ignored run directory;
- demonstrate deduplication and source attribution;
- produce an editorial candidate list before publication;
- generate and validate the real edition;
- receive a human review of paper selection and summaries;
- publish only after that review is satisfactory.

Deterministic tests cover:

- Tuesday weekend catch-up;
- per-source watermark advancement;
- complete, partial, all-failed, and complete-zero-selection decisions;
- suspicious/malformed/low-count degradation;
- retries with injected zero-delay timing;
- same-edition reconciliation;
- deduplication by arXiv/DOI/Hugging Face aliases;
- no-change reruns;
- refusal on dirty/diverged Git state;
- exact public status rendering and Markdown projection.

After the pilot, run failure simulations for one-source failure, all-source failure, and recovered reconciliation. Then create the local scheduled task and manually trigger it once before relying on the first 06:00 run.

## Acceptance criteria

- A reviewed real edition for delivery date `2026-08-11` is published from 2026-08-10 source material.
- Complete, partial, all-failed, and zero-selection semantics match the table above.
- Failed sources never advance watermarks or masquerade as empty sources.
- Recovery updates the original partial edition URL and can promote it to complete.
- Graphics and Vision–Graphics win ties against similarly strong broader-CV papers.
- The scheduled task exists at 06:00 Tuesday–Saturday in `Asia/Hong_Kong`, runs locally against the saved repository, and requires no API key.
- The repository, tests, Pages deployment, and public site are clean and verified.
- Personal controls remain unimplemented until the automation is accepted.
