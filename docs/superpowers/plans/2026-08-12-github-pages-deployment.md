# GitHub Pages Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish the existing public `main` history to `TheLogarhythm/paper-morning-pass` and continuously deploy its validated Astro build to GitHub Pages.

**Architecture:** One GitHub Actions workflow validates the source, builds `dist/`, uploads only that directory as a Pages artifact, and deploys it through the protected `github-pages` environment. GitHub Pages uses the workflow build type and serves the existing `/paper-morning-pass` base path.

**Tech Stack:** Astro 7, Node.js 22, npm, Vitest, Playwright, GitHub Actions, GitHub Pages, GitHub CLI

## Global Constraints

- Create exactly one public repository: `TheLogarhythm/paper-morning-pass`.
- Preserve the existing `main` history; never rebase, squash, force-push, or rewrite commits.
- Keep site origin `https://thelogarhythm.github.io` and base path `/paper-morning-pass`.
- Never track `.env*` except `.env.example`, `dist/`, `node_modules/`, `test-results/`, `playwright-report/`, or private parent-repository files.
- Use `npm ci` with Node.js 22 and deploy only after `npm run check`, `npm test`, and `npm run build` pass.
- Give the build job only `contents: read`; give the deploy job only `pages: write` and `id-token: write`.
- Use no GitHub repository secrets.
- Keep an active deployment running when a newer run queues: `cancel-in-progress: false`.
- Stop rather than overwrite if the repository unexpectedly exists before publication.

---

### Task 1: Add the validated Pages workflow

**Files:**
- Create: `.github/workflows/deploy-pages.yml`
- Create: `tests/unit/pages-workflow.test.ts`

**Interfaces:**
- Consumes: `package-lock.json`, npm scripts `check`, `test`, and `build`, and Astro output directory `dist/`.
- Produces: workflow `Deploy GitHub Pages`, Pages artifact, `github-pages` environment, and deployment `page_url`.

- [ ] **Step 1: Write the failing workflow contract test**

Create `tests/unit/pages-workflow.test.ts`:

```ts
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const workflowPath = new URL('../../.github/workflows/deploy-pages.yml', import.meta.url);

describe('GitHub Pages workflow', () => {
  it('validates, builds, uploads dist, and deploys with bounded permissions', async () => {
    const workflow = (await readFile(workflowPath, 'utf8')).replace(/\r\n/g, '\n');

    expect(workflow).toContain('name: Deploy GitHub Pages');
    expect(workflow).toMatch(/push:\n\s+branches:\n\s+- main/);
    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).toContain('cancel-in-progress: false');
    expect(workflow).toContain('contents: read');
    expect(workflow).toContain('pages: write');
    expect(workflow).toContain('id-token: write');
    expect(workflow).toContain('uses: actions/checkout@v7');
    expect(workflow).toContain('uses: actions/setup-node@v7');
    expect(workflow).toContain('node-version: 22');
    expect(workflow).toContain('cache: npm');
    expect(workflow).toContain('run: npm ci');
    expect(workflow).toContain('run: npm run check');
    expect(workflow).toContain('run: npm test');
    expect(workflow).toContain('run: npm run build');
    expect(workflow).toContain('uses: actions/upload-pages-artifact@v5');
    expect(workflow).toContain('path: ./dist');
    expect(workflow).toContain('uses: actions/deploy-pages@v5');
    expect(workflow).toContain('name: github-pages');
    expect(workflow).not.toContain('secrets.');
  });
});
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run `npm test -- tests/unit/pages-workflow.test.ts`.

Expected: FAIL with `ENOENT` for `.github/workflows/deploy-pages.yml`.

- [ ] **Step 3: Add the minimal Pages workflow**

Create `.github/workflows/deploy-pages.yml`:

```yaml
name: Deploy GitHub Pages

on:
  push:
    branches:
      - main
  workflow_dispatch:

concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest
    permissions:
      contents: read
    steps:
      - name: Check out repository
        uses: actions/checkout@v7
      - name: Set up Node.js
        uses: actions/setup-node@v7
        with:
          node-version: 22
          cache: npm
      - name: Install dependencies
        run: npm ci
      - name: Check source
        run: npm run check
      - name: Test content and helpers
        run: npm test
      - name: Build static site
        run: npm run build
      - name: Upload Pages artifact
        uses: actions/upload-pages-artifact@v5
        with:
          path: ./dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    permissions:
      pages: write
      id-token: write
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v5
```

- [ ] **Step 4: Run the focused test and confirm GREEN**

Run `npm test -- tests/unit/pages-workflow.test.ts`.

Expected: one file and one test pass.

- [ ] **Step 5: Run the complete local gate**

Run each command separately:

```powershell
npm run check
npm test
npm run test:e2e
npm run build
git diff --check
git status --short
```

Expected: zero diagnostics; all tests pass apart from the two documented reciprocal focus skips; five pages build; no whitespace errors; only the workflow, its test, and this plan are uncommitted.

- [ ] **Step 6: Commit the workflow and plan**

```powershell
git add -- .github/workflows/deploy-pages.yml tests/unit/pages-workflow.test.ts docs/superpowers/plans/2026-08-12-github-pages-deployment.md
git commit -m "ci: deploy site with GitHub Pages"
git status --short --branch
```

Expected: the commit succeeds and local `main` is clean.

### Task 2: Create, publish, and activate the public repository

**Files:**
- No file changes.

**Interfaces:**
- Consumes: clean local `main`, authenticated account `TheLogarhythm`, and `.github/workflows/deploy-pages.yml`.
- Produces: public repository, tracking remote `origin`, workflow-based Pages deployment, and live site URL.

- [ ] **Step 1: Reconfirm the publication boundary**

```powershell
gh auth status
git status --short --branch
git remote -v
git ls-files -- '.env*' 'dist/**' 'node_modules/**' 'test-results/**' 'playwright-report/**'
gh repo view TheLogarhythm/paper-morning-pass --json nameWithOwner,visibility,url
```

Expected: authenticated as `TheLogarhythm`; clean `main`; no remotes or forbidden paths; the last command fails because the repository does not exist. If it succeeds, stop rather than overwrite it.

- [ ] **Step 2: Create the empty public repository and local remote**

```powershell
gh repo create TheLogarhythm/paper-morning-pass --public --source . --remote origin --description "A calm daily brief for computer vision, computer graphics, and complementary AI research."
gh repo view TheLogarhythm/paper-morning-pass --json nameWithOwner,visibility,url
git remote -v
```

Expected: a public repository exists and `origin` points to `https://github.com/TheLogarhythm/paper-morning-pass.git`.

- [ ] **Step 3: Push the existing history without rewriting it**

```powershell
git push -u origin main
git rev-parse main
git rev-parse origin/main
gh repo view TheLogarhythm/paper-morning-pass --json defaultBranchRef,visibility,url
```

Expected: both hashes match; GitHub reports public visibility and default branch `main`.

- [ ] **Step 4: Enable workflow-based GitHub Pages**

```powershell
gh api --method POST repos/TheLogarhythm/paper-morning-pass/pages -f build_type=workflow
gh api repos/TheLogarhythm/paper-morning-pass/pages --jq '{build_type: .build_type, status: .status, html_url: .html_url}'
```

Expected: `build_type` is `workflow` and the URL is `https://thelogarhythm.github.io/paper-morning-pass/`. If Pages already exists, proceed only after the GET result confirms the same build type.

- [ ] **Step 5: Observe or start the Pages workflow**

```powershell
gh run list --repo TheLogarhythm/paper-morning-pass --workflow deploy-pages.yml --branch main --limit 1 --json databaseId,status,conclusion,url
```

If no push-triggered run exists, start one and list it again:

```powershell
gh workflow run deploy-pages.yml --repo TheLogarhythm/paper-morning-pass --ref main
gh run list --repo TheLogarhythm/paper-morning-pass --workflow deploy-pages.yml --branch main --limit 1 --json databaseId,status,conclusion,url
```

Capture and watch the exact returned run ID:

```powershell
$run = gh run list --repo TheLogarhythm/paper-morning-pass --workflow deploy-pages.yml --branch main --limit 1 --json databaseId,status,conclusion,url | ConvertFrom-Json | Select-Object -First 1
if (-not $run) { throw 'No Pages workflow run exists.' }
gh run watch $run.databaseId --repo TheLogarhythm/paper-morning-pass --exit-status
```

Expected: build and deploy complete successfully for the exact run returned by GitHub.

- [ ] **Step 6: Verify Pages and the live site**

```powershell
gh api repos/TheLogarhythm/paper-morning-pass/pages --jq '{build_type: .build_type, status: .status, html_url: .html_url}'
gh repo view TheLogarhythm/paper-morning-pass --json nameWithOwner,visibility,defaultBranchRef,url
$response = Invoke-WebRequest -Uri 'https://thelogarhythm.github.io/paper-morning-pass/' -UseBasicParsing
$response.StatusCode
$response.Content | Select-String -SimpleMatch 'Paper Morning Pass'
git status --short --branch
```

Expected: Pages is built, the repository is public on `main`, HTTP status is 200, the response contains the product name, and local `main` cleanly tracks `origin/main`.

- [ ] **Step 7: Record the external outcome**

Report the exact repository, live-site, and successful workflow-run URLs. State that no Supabase project, OAuth configuration, research-ingestion scheduler, or private control plane was created.
