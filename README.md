# Paper Morning Pass

Paper Morning Pass is a static, content-first Astro foundation for a calm daily research reading brief. It renders the latest edition, dated editions, an archive, and an honest unavailable state for personal starred-paper data.

The committed sample paper and edition are explicitly fictional fixtures for interface development. They are not claims about a real publication.

## Local setup

Use Node.js 22.12 or newer and npm:

```sh
npm install
npx playwright install chromium webkit
```

Start the development server with `npm run dev`. Production output is built for the `/paper-morning-pass/` base path.

## Verification

Run the complete foundation gate from the repository root:

```sh
npm run check
npm test
npm run test:e2e
npm run build
```

`npm test` is self-contained and does not require an existing `dist/` directory. Playwright starts and stops its own local Astro server.

## Content model

JSON under `src/data/` is the canonical, schema-validated public build input. Markdown under `content/editions/` is a human-reviewable projection generated from the same edition object; it is not loaded as canonical data.

The Starred page does not invent unread or unstarred defaults when no personal-state provider is connected. It displays `Reading state unavailable` and remains inert until a future provider is explicitly integrated.

## Daily Brief automation

The local Codex workflow is versioned in `.agents/skills/publish-daily-brief/` and explicitly invoked as `$publish-daily-brief`. It requires no OpenAI API key.

The deterministic commands are:

```sh
npm run daily:preflight
npm run daily:prepare -- --delivery-date YYYY-MM-DD
npm run daily:finalize -- --delivery-date YYYY-MM-DD --check
npm run daily:finalize -- --delivery-date YYYY-MM-DD
```

Preparation writes ignored evidence under `.paper-morning-pass/runs/`. Finalization binds public records to that candidate manifest, derives complete or partial coverage, advances only successful source watermarks, validates canonical JSON and Markdown, and refuses all-source failure. Read the skill references before operating or changing the workflow.
