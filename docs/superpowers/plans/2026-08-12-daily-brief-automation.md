# Daily Brief Automation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build, pilot, publish, and schedule a local Codex workflow that produces reconciled Paper Morning Pass editions from arXiv cs.CV, arXiv cs.GR, and Hugging Face Daily Papers.

**Architecture:** Pure TypeScript modules own dates, source observations, retries, deduplication, watermarks, and publication decisions. A network preparation CLI writes ignored candidate manifests; a repo-local skill researches candidates, authors canonical content, runs validation, and publishes `main`. The existing GitHub Pages workflow deploys each content commit.

**Tech Stack:** TypeScript 6, Node.js 22 fetch, Cheerio, Zod, Vitest, Astro 7, Codex repo skills, Git/GitHub Pages, Codex scheduled tasks

## Global Constraints

- Schedule locally at 06:00 Tuesday–Saturday in `Asia/Hong_Kong`; require no OpenAI API key.
- Process every unprocessed source date through the day before delivery; Tuesday includes weekend safety dates.
- Retry failed or suspicious sources after 2 and 8 additional minutes in production; inject zero delays in tests and the pilot.
- Publish complete, partial, all-failed, and complete-zero-selection outcomes exactly as specified.
- Advance watermarks only for complete sources; failed sources never mean zero papers.
- Reconcile recovered coverage into the same delivery-date edition.
- Apply quality first; use Graphics/Vision–Graphics over broader CV only as a tie-break.
- Keep transient evidence under ignored `.paper-morning-pass/runs/`; keep private preferences and notes out of Git.
- Never force-push, rebase, overwrite unrelated work, or publish from a dirty/diverged checkout.
- Defer Supabase, OAuth, read/star controls, and private notes.

---

### Task 1: Define automation contracts and public coverage status

**Files:**
- Create: `src/automation/contracts.ts`
- Create: `src/automation/policy.ts`
- Create: `automation/state.json`
- Create: `tests/unit/automation-policy.test.ts`
- Modify: `src/schemas/content.ts`
- Modify: `tests/fixtures/content.ts`
- Modify: `tests/unit/content-schema.test.ts`

**Interfaces:**
- Produces `AutomationState`, `SourceObservation`, `PreparedSourceResult`, `PreparedRun`, `unprocessedDates`, `assessSourceObservation`, `decidePublication`, and `advanceSuccessfulWatermarks`.
- Adds `publication_status: 'complete' | 'partial'` to every `EditionRecord` and requires exactly the three approved coverage sources.

- [ ] Write failing tests for Monday-through-delivery-minus-one date ranges, Tuesday weekend catch-up, all publication decisions, suspicious observations, and per-source watermark advancement.
- [ ] Run `npm test -- tests/unit/automation-policy.test.ts tests/unit/content-schema.test.ts` and confirm failures are caused by missing contracts/status behavior.
- [ ] Implement strict Zod contracts and pure policy functions. Bootstrap all three source watermarks at `2026-08-09` in `automation/state.json` so the pilot requests `2026-08-10`.
- [ ] Require complete editions to contain three complete source records; require partial editions to contain at least one complete and at least one degraded source record; reject all-degraded editions.
- [ ] Rerun focused tests and confirm GREEN.

### Task 2: Parse sources, retry degradation, and deduplicate candidates

**Files:**
- Create: `src/automation/arxiv-source.ts`
- Create: `src/automation/huggingface-source.ts`
- Create: `src/automation/prepare-run.ts`
- Create: `src/automation/deduplicate.ts`
- Create: `scripts/prepare-daily-brief.ts`
- Create: `tests/fixtures/sources/arxiv-recent.html`
- Create: `tests/fixtures/sources/huggingface-daily.json`
- Create: `tests/unit/source-adapters.test.ts`
- Create: `tests/unit/prepare-run.test.ts`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `.gitignore`

**Interfaces:**
- `parseArxivRecent(html, source, requestedDates)` returns a structurally assessed source result with arXiv IDs, titles, authors, subjects, abstract/PDF/source URLs, and per-date counts.
- `parseHuggingFaceDaily(json, requestedDates)` returns corresponding Daily Papers candidates and metadata.
- `prepareRun(options)` invokes injected fetch/sleep functions, retries only degraded sources, merges external-ID aliases, and returns one `PreparedRun`.
- CLI: `npm run daily:prepare -- --delivery-date YYYY-MM-DD [--retry-delays-ms 120000,480000]` writes `.paper-morning-pass/runs/YYYY-MM-DD/candidates.json`.

- [ ] Add Cheerio and the script entry, then write parser tests from minimal source fixtures before implementation.
- [ ] Confirm RED for missing parsers and retry orchestrator.
- [ ] Implement arXiv date-section parsing and Hugging Face API parsing with structural/date/count signals and public-safe failure details.
- [ ] Implement retry injection, recent-count suspicion policy, stable alias-based UUID generation, and candidate merging.
- [ ] Test complete, malformed, missing-date, low-count, empty-corroborated, one-source recovery, and retry-exhaustion cases.
- [ ] Ignore `.paper-morning-pass/runs/`, run focused tests, and confirm GREEN.

### Task 3: Render explicit partial coverage and canonical Markdown

**Files:**
- Modify: `src/components/EditionHeader.astro`
- Modify: `src/components/SourceStatus.astro`
- Modify: `src/lib/edition-markdown.ts`
- Modify: `src/styles/global.css`
- Modify: `tests/e2e/daily-brief.spec.ts`
- Modify: `tests/unit/content-schema.test.ts`

**Interfaces:**
- Complete pages show `Complete coverage`; partial pages show a prominent `Partial coverage` status before source details.
- Markdown front matter includes `publication_status`; its body has a `## Publication status` section.

- [ ] Add failing unit/browser assertions for explicit complete/partial labels, exact failed sources, and canonical Markdown status.
- [ ] Confirm RED against the current subtle per-source-only presentation.
- [ ] Implement the minimum accessible status markup and styles; keep failed sources labelled `Degraded` and never describe them as empty.
- [ ] Rerun focused unit/E2E tests and confirm GREEN.

### Task 4: Add deterministic draft finalization and reconciliation

**Files:**
- Create: `src/automation/finalize-run.ts`
- Create: `scripts/finalize-daily-brief.ts`
- Create: `tests/unit/finalize-run.test.ts`
- Modify: `package.json`

**Interfaces:**
- CLI: `npm run daily:finalize -- --delivery-date YYYY-MM-DD --draft PATH` validates a prepared manifest and editorial draft, merges papers by external aliases, writes/updates the delivery-date edition, regenerates Markdown, and advances only successful source watermarks.
- Returns JSON summary `{ outcome, changed, deliveryDate, publicationStatus, advancedSources, pendingSources }`.
- Refuses all-failed drafts, delivery-date mismatch, candidate/source mismatch, duplicate aliases, stale prepared inputs, and same-date replacement that loses prior complete coverage.

- [ ] Write failing tests using temporary repositories for complete, partial, zero-selection, all-failed, reconciliation, and no-change runs.
- [ ] Confirm RED for the missing finalizer.
- [ ] Implement a pure finalization transaction plus thin filesystem CLI; reuse existing content schemas and Markdown renderer.
- [ ] Rerun focused and full unit tests and confirm GREEN.

### Task 5: Create and validate the repo-local publication skill

**Files:**
- Create: `.agents/skills/publish-daily-brief/SKILL.md`
- Create: `.agents/skills/publish-daily-brief/agents/openai.yaml`
- Create: `.agents/skills/publish-daily-brief/references/editorial-policy.md`
- Create: `.agents/skills/publish-daily-brief/references/run-contract.md`
- Create: `tests/unit/daily-brief-skill.test.ts`

**Interfaces:**
- Explicit invocation `$publish-daily-brief` accepts an optional delivery date and pilot/no-wait instruction.
- The skill produces a prepared manifest, an editorial draft, finalized canonical content, a validated content commit, a normal Git push, Pages verification, and a concise run report.

- [ ] Establish a no-skill baseline from the durable automation prompt and encode observed omissions as contract tests: missing catch-up, treating failures as empty, premature watermark advancement, missing partial label, wrong lane tie-break, or unsafe Git behavior.
- [ ] Initialize `publish-daily-brief` with the system skill-creator script, using references but no assets.
- [ ] Write the smallest imperative workflow and references that satisfy the contract; include explicit source/paper evidence requirements and the approved publication table.
- [ ] Validate frontmatter/UI metadata with the skill-creator validator and run `daily-brief-skill.test.ts`.
- [ ] Manually invoke the skill in dry-run mode against fixture manifests and confirm its required artifacts/actions are reviewable.

### Task 6: Execute the 2026-08-11 pilot and prepare human review

**Files:**
- Create: ignored `.paper-morning-pass/runs/2026-08-11/candidates.json`
- Create: ignored `.paper-morning-pass/runs/2026-08-11/editorial-draft.json`
- After approval, modify: `src/data/papers/index.json`
- After approval, create: `src/data/editions/2026-08-11.json`
- After approval, create: `content/editions/2026-08-11.md`
- After approval, modify: `automation/state.json`

**Interfaces:**
- Pilot command uses delivery date `2026-08-11`, source date `2026-08-10`, and zero retry delays while retaining all attempts.
- Human-review output lists all selected papers by tier/lane, exclusions near the quality boundary, review depth, and evidence URLs.

- [ ] Run preparation and inspect all three source results, counts, and deduplication.
- [ ] Research promising candidates using primary arXiv/Hugging Face pages and paper text; apply Graphics/Vision–Graphics tie-breaking only among similar quality.
- [ ] Write the ignored editorial draft and run finalization in check/dry-run mode.
- [ ] Present the candidate edition to the user for selection/summary review; do not publish real editorial claims before this gate.
- [ ] After approval, finalize canonical files and continue Task 7 without writing personal-control data.

### Task 7: Verify, publish, simulate failures, and create the schedule

**Files:**
- Modify only canonical content/state files from the approved pilot.
- No scheduled-task configuration is stored in Git; create it through the Codex app automation API.

**Interfaces:**
- Scheduled task name: `Paper Morning Pass — Daily Brief`.
- Standalone cron task, local saved project, Tuesday–Saturday 06:00 `Asia/Hong_Kong`, active, failure-oriented notifications.
- Prompt explicitly invokes `$publish-daily-brief` for the current delivery date and instructs catch-up/reconciliation.

- [ ] Run `npm run check`, `npm test`, `npm run test:e2e`, `npm run build`, and content projection checks.
- [ ] Run injected one-source failure, all-source failure, complete-zero-selection, and later-recovery simulations; confirm no external writes.
- [ ] Commit the approved pilot as `content: publish 2026-08-11 Daily Brief`, push `main`, watch Pages, and verify the live edition URL.
- [ ] List Codex projects, resolve the saved `paper-morning-pass` project, and create the standalone local scheduled task through the automation tool.
- [ ] Manually trigger or view the task when supported; otherwise verify its stored schedule, prompt, project, execution environment, status, and notification policy.
- [ ] Confirm repositories are clean and report the automation, pilot edition, workflow run, and deferred personal-controls phase.
