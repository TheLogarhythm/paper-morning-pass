# Remove Redundant Primary-Source Lines Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove duplicated `Primary source:` presentation from website paper cards and generated edition Markdown while preserving canonical provenance validation and useful labelled links.

**Architecture:** Keep provenance in canonical JSON and schema validation. Change only the two shared presentation boundaries: the Astro paper card and Markdown renderer. Regenerate committed Markdown artifacts from canonical JSON so old and new editions share the corrected projection.

**Tech Stack:** Astro, TypeScript, Vitest, Playwright

## Global Constraints

- Do not change selection, summaries, coverage, watermarks, or automation behavior.
- Keep `claim_provenance` and all provenance validation intact.
- Keep labelled paper-resource and canonical links available.

---

### Task 1: Protect concise provenance presentation

**Files:**
- Modify: `tests/e2e/daily-brief.spec.ts`
- Modify: `tests/unit/content-schema.test.ts`

**Interfaces:**
- Consumes: rendered latest-edition HTML and `renderEditionMarkdown(edition, papers)`.
- Produces: regression coverage for absent duplicate prose and retained labelled links.

- [ ] **Step 1: Write failing tests**

Add a browser assertion that the latest paper card contains no `Primary source:` text but still exposes an `arXiv abstract` paper link. Add a Markdown assertion that a rendered edition contains no `Primary source:` line and still contains its canonical link heading and labelled link.

- [ ] **Step 2: Verify RED**

Run `npm test -- tests/unit/content-schema.test.ts` and `$env:ASTRO_DEV_BACKGROUND='0'; npm run test:e2e -- tests/e2e/daily-brief.spec.ts`. Expected: failures on the still-rendered duplicate lines.

- [ ] **Step 3: Commit the test boundary with the implementation in Task 2**

Do not commit a knowingly red tree separately.

### Task 2: Remove duplicate presentation and regenerate projections

**Files:**
- Modify: `src/components/PaperCard.astro`
- Modify: `src/lib/edition-markdown.ts`
- Regenerate: `content/editions/2026-08-10.md`
- Regenerate: `content/editions/2026-08-11.md`
- Regenerate: `content/editions/2026-08-12.md`

**Interfaces:**
- Consumes: unchanged canonical `claim_provenance` and paper link records.
- Produces: concise HTML and Markdown projections with explicit labelled resource links.

- [ ] **Step 1: Implement minimal GREEN**

Remove the `.primary-sources` paragraph from the card's section map. Remove `claimSourceLine` and its calls from the Markdown renderer; simplify section tuples to heading and text. Do not alter schemas or canonical JSON.

- [ ] **Step 2: Regenerate committed Markdown**

Run the repository's canonical finalization/rendering path for each edition, or an existing deterministic generator if exposed. Verify that only presentation lines change.

- [ ] **Step 3: Verify GREEN**

Run the focused unit and browser tests from Task 1. Expected: pass, with labelled links retained.

- [ ] **Step 4: Run full gate**

Run `npm run validate:content`, `npm run check`, `npm test`, `npm run test:e2e`, `npm run build`, and `git diff --check`.

- [ ] **Step 5: Commit and publish**

Stage only the spec, plan, tests, shared renderers, and regenerated Markdown. Commit as `fix: remove redundant primary source lines`, push `main`, verify GitHub Pages, and confirm the live latest edition omits the redundant phrase while paper links remain.
