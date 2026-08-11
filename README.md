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
