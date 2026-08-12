# Remove Redundant Primary-Source Lines — Design

## Purpose

Reduce repetition in Paper Morning Pass entries. Each editorial section currently renders a generic `Primary source: source` link even though the paper card already ends with clearly labelled arXiv, PDF, code, project, and source-list links.

## Approved behavior

- Do not render `Primary source:` lines beneath editorial claims on the website.
- Do not emit `Primary source:` lines in generated edition Markdown.
- Keep `claim_provenance` in canonical JSON and continue validating every editorial claim against canonical paper or source URLs.
- Keep the labelled paper-resource links unchanged.
- Apply the presentation correction to every edition, including existing archive pages, through shared renderers.

## Boundaries

This change does not alter paper selection, summaries, source coverage, canonical provenance, watermarks, automation behavior, or private controls.

## Verification

- Browser regression: no visible `Primary source:` text; labelled paper links remain available.
- Markdown regression: generated Markdown contains no `Primary source:` line and still contains canonical links.
- Regenerate committed Markdown editions through the canonical renderer.
- Run content validation, static/type checks, unit tests, browser tests, and the production build.
