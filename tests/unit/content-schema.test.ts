import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  editionRecordSchema,
  paperRecordSchema,
  reviewDepthSchema,
  validateEditionAgainstPapers,
} from '../../src/schemas/content';
import { renderEditionMarkdown } from '../../src/lib/edition-markdown';
import { getEditionViewState } from '../../src/lib/edition-view-state';
import { validEditionRecord, validPaperRecord, validReadFirstEntry } from '../fixtures/content';

function clone<T>(value: T): T {
  return structuredClone(value);
}

function normalizeFinalNewline(value: string): string {
  return value.endsWith('\n') ? value : `${value}\n`;
}

type TestPaper = Record<string, unknown> & {
  links: Array<{ url: string }>;
  provenance: Array<{ url: string }>;
  source_dates: Array<{ date: string }>;
};

type TestEntry = Record<string, unknown> & {
  claim_provenance: Array<{ field: string; urls: string[] }>;
  estimated_minutes: number;
};

type TestEdition = Record<string, unknown> & {
  delivery_date: string;
  coverage: Array<Record<string, unknown>>;
  entries: TestEntry[];
  exceptional_length: boolean;
};

describe('public content schemas', () => {
  it('parses a valid UUID paper record', () => {
    expect(paperRecordSchema.parse(validPaperRecord).paper_id).toBe('018f4a90-6d31-7b2c-9dd3-7e12c8b77210');
  });

  it.each(['javascript:alert(1)', 'data:text/plain,unsafe'])('rejects unsafe URLs in every public link field: %s', (url) => {
    const paper = clone(validPaperRecord) as TestPaper;
    paper.links[0].url = url;
    expect(() => paperRecordSchema.parse(paper)).toThrow();
  });

  it.each([
    ['public links', (paper: TestPaper, _edition: TestEdition, url: string) => { paper.links[0].url = url; }],
    ['record provenance', (paper: TestPaper, _edition: TestEdition, url: string) => { paper.provenance[0].url = url; }],
    ['claim provenance', (_paper: TestPaper, edition: TestEdition, url: string) => { edition.entries[0].claim_provenance[0].urls = [url]; }],
  ])('rejects credential-bearing %s without reflecting credentials', (_scope, mutate) => {
    const marker = 'TEST_ONLY_SECRET_MARKER_9QK';
    const unsafeUrl = `https://fixture:${marker}@example.org/private?token=${marker}`;
    const paper = clone(validPaperRecord) as TestPaper;
    const edition = clone(validEditionRecord) as TestEdition;
    mutate(paper, edition, unsafeUrl);

    const result = _scope === 'claim provenance'
      ? editionRecordSchema.safeParse(edition)
      : paperRecordSchema.safeParse(paper);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(JSON.stringify(result.error.issues)).not.toContain(marker);
      expect(JSON.stringify(result.error.issues)).not.toContain('fixture:');
    }
  });

  it('rejects credential-bearing Markdown destinations without reflecting credentials', () => {
    const marker = 'TEST_ONLY_SECRET_MARKER_9QK';
    const unsafeUrl = `https://fixture:${marker}@example.org/private?token=${marker}`;
    const paper = clone(validPaperRecord) as TestPaper;
    const edition = clone(validEditionRecord) as TestEdition;
    paper.links[0].url = unsafeUrl;
    for (const claim of edition.entries[0].claim_provenance) claim.urls = [unsafeUrl];

    let message = '';
    try {
      renderEditionMarkdown(edition as never, [paper] as never);
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message.length).toBeGreaterThan(0);
    expect(message).not.toContain(marker);
    expect(message).not.toContain(unsafeUrl);
  });

  it('requires every read-first editorial field and positive minutes', () => {
    for (const field of ['verdict', 'contribution', 'why_it_matters', 'evidence', 'limitation'] as const) {
      const edition = clone(validEditionRecord) as TestEdition;
      edition.entries[0][field] = '';
      expect(() => editionRecordSchema.parse(edition)).toThrow();
    }

    const edition = clone(validEditionRecord) as TestEdition;
    edition.entries[0].estimated_minutes = 0;
    expect(() => editionRecordSchema.parse(edition)).toThrow();
  });

  it('requires a two-to-four sentence skimming note and positive minutes', () => {
    const edition = clone(validEditionRecord) as TestEdition;
    edition.entries = [{
      paper_id: '018f4a90-6d31-7b2c-9dd3-7e12c8b77210',
      tier: 'worth_skimming',
      lane: 'broader_vision',
      review_depth: 'abstract',
      editorial_note: 'One sentence only.',
      claim_provenance: [{ field: 'editorial_note', urls: ['https://example.org/papers/layered-motion-fields'] }],
      estimated_minutes: 3,
    }];
    expect(() => editionRecordSchema.parse(edition)).toThrow();

    edition.entries[0].editorial_note = 'This fictional fixture is brief. It is useful for interface development.';
    edition.entries[0].estimated_minutes = 0;
    expect(() => editionRecordSchema.parse(edition)).toThrow();
  });

  it('requires primary-source URL provenance for every editorial claim', () => {
    const edition = clone(validEditionRecord);
    edition.entries[0].claim_provenance = edition.entries[0].claim_provenance.filter((claim) => claim.field !== 'evidence');
    expect(() => editionRecordSchema.parse(edition)).toThrow();

    const missingUrls = clone(validEditionRecord) as TestEdition;
    missingUrls.entries[0].claim_provenance[0].urls = [];
    expect(() => editionRecordSchema.parse(missingUrls)).toThrow();
  });

  it('requires each editorial claim URL to be a canonical paper or source link for its referenced paper', () => {
    expect(() => validateEditionAgainstPapers(validEditionRecord, [validPaperRecord])).not.toThrow();

    const edition = clone(validEditionRecord) as TestEdition;
    edition.entries[0].claim_provenance[0].urls = ['https://unrelated.example/blog-post'];
    expect(() => validateEditionAgainstPapers(edition, [validPaperRecord])).toThrow(/canonical paper or source link/);
  });

  it('regenerates the complete committed Markdown artifact from canonical JSON', () => {
    const edition = editionRecordSchema.parse(JSON.parse(
      readFileSync(new URL('../../src/data/editions/2026-08-10.json', import.meta.url), 'utf8'),
    ));
    const papers = paperRecordSchema.array().parse(JSON.parse(
      readFileSync(new URL('../../src/data/papers/index.json', import.meta.url), 'utf8'),
    ));
    const markdown = readFileSync(new URL('../../content/editions/2026-08-10.md', import.meta.url), 'utf8');

    expect(normalizeFinalNewline(markdown)).toBe(normalizeFinalNewline(renderEditionMarkdown(edition, papers)));
  });

  it('keeps canonical links without repeating claim provenance in rendered Markdown', () => {
    const paper = paperRecordSchema.parse(clone(validPaperRecord));
    const edition = editionRecordSchema.parse(clone(validEditionRecord));

    const rendered = renderEditionMarkdown(edition, [paper]);

    expect(rendered).not.toContain('Primary source:');
    expect(rendered).toContain('### Canonical links');
    expect(rendered).toContain('[Fixture paper record](https://example.org/papers/layered-motion-fields)');
  });

  it('serializes adversarial public content without creating Markdown or HTML structure', () => {
    const paper = paperRecordSchema.parse(clone(validPaperRecord));
    const edition = editionRecordSchema.parse(clone(validEditionRecord));
    const hostileUrl = 'https://example.org/path)with(space)?q=<tag>&note=one two';

    paper.title = '<script>alert(1)</script> # injected heading';
    paper.authors[0] = '</li>[injected](https://evil.example)';
    paper.affiliations[0] = 'Fixture ](https://evil.example)';
    paper.abstract = '# injected heading\n[raw link](https://evil.example)';
    paper.links[0].label = 'Fixture label](https://evil.example)';
    paper.links[0].url = hostileUrl;
    edition.editorial_theme = '<img src=x onerror=alert(1)> # injected heading';
    edition.coverage[0].detail = '](https://evil.example) </script>';
    const [entry] = edition.entries;
    if (entry.tier !== 'read_first') throw new Error('Expected the read-first fixture');
    entry.verdict = 'Closing ](https://evil.example) delimiter';
    for (const claim of entry.claim_provenance) {
      claim.urls = [hostileUrl];
    }

    const rendered = renderEditionMarkdown(edition, [paper]);

    expect(rendered).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(rendered).toContain('\\# injected heading ↵ \\[raw link\\](https://evil.example)');
    expect(rendered).toContain('Fixture label\\](https://evil.example)');
    expect(rendered).toContain('https://example.org/path%29with%28space%29?q=%3Ctag%3E&note=one%20two');
    expect(rendered).not.toContain('<script>');
    expect(rendered).not.toContain('[raw link](https://evil.example)');
    expect(rendered).not.toContain('[Fixture label](https://evil.example)');
  });

  it('allows only the documented review depths', () => {
    for (const reviewDepth of ['abstract', 'full_paper', 'full_paper_plus_artifacts']) {
      expect(reviewDepthSchema.parse(reviewDepth)).toBe(reviewDepth);
    }
    expect(() => reviewDepthSchema.parse('quick_scan')).toThrow();
  });

  it('requires strict YYYY-MM-DD delivery and source dates', () => {
    const invalidDeliveryDate = clone(validEditionRecord) as TestEdition;
    invalidDeliveryDate.delivery_date = '2026-8-10';
    expect(() => editionRecordSchema.parse(invalidDeliveryDate)).toThrow();

    const invalidSourceDate = clone(validPaperRecord) as TestPaper;
    invalidSourceDate.source_dates[0].date = '2026-08-10T08:00:00Z';
    expect(() => paperRecordSchema.parse(invalidSourceDate)).toThrow();
  });

  it.each(['2026-02-31', '2026-99-99'])('rejects calendar-invalid delivery and source dates: %s', (invalidDate) => {
    const invalidDeliveryDate = clone(validEditionRecord) as TestEdition;
    invalidDeliveryDate.delivery_date = invalidDate;
    expect(() => editionRecordSchema.parse(invalidDeliveryDate)).toThrow();

    const invalidSourceDate = clone(validPaperRecord) as TestPaper;
    invalidSourceDate.source_dates[0].date = invalidDate;
    expect(() => paperRecordSchema.parse(invalidSourceDate)).toThrow();
  });

  it('requires each coverage source to declare complete or degraded status', () => {
    const edition = clone(validEditionRecord) as TestEdition;
    edition.coverage[0].status = '';
    expect(() => editionRecordSchema.parse(edition)).toThrow();
  });

  it('requires exact three-source coverage consistent with the edition publication status', () => {
    const complete = {
      ...clone(validEditionRecord),
      publication_status: 'complete',
      coverage: [
        { source: 'arxiv_cs_cv', dates: ['2026-08-10'], status: 'complete', detail: undefined as string | undefined },
        { source: 'arxiv_cs_gr', dates: ['2026-08-10'], status: 'complete', detail: undefined as string | undefined },
        { source: 'huggingface_papers', dates: ['2026-08-10'], status: 'complete', detail: undefined as string | undefined },
      ],
    };
    expect(() => editionRecordSchema.parse(complete)).not.toThrow();

    const partial = clone(complete);
    partial.publication_status = 'partial';
    partial.coverage[1].status = 'degraded';
    partial.coverage[1].detail = 'Source response could not be verified.';
    expect(() => editionRecordSchema.parse(partial)).not.toThrow();

    const falselyComplete = clone(partial);
    falselyComplete.publication_status = 'complete';
    expect(() => editionRecordSchema.parse(falselyComplete)).toThrow(/publication_status/i);

    const allDegraded = clone(partial);
    allDegraded.coverage = allDegraded.coverage.map((coverage) => ({
      ...coverage,
      status: 'degraded',
      detail: 'Source response could not be verified.',
    }));
    expect(() => editionRecordSchema.parse(allDegraded)).toThrow(/all sources are degraded/i);

    const missingSource = clone(complete);
    missingSource.coverage.pop();
    expect(() => editionRecordSchema.parse(missingSource)).toThrow(/approved sources/i);
  });

  it('projects complete and partial publication status explicitly in canonical Markdown', () => {
    const complete = editionRecordSchema.parse(clone(validEditionRecord));
    const completeMarkdown = renderEditionMarkdown(complete, [paperRecordSchema.parse(validPaperRecord)]);
    expect(completeMarkdown).toContain('publication_status: complete');
    expect(completeMarkdown).toContain('## Publication status\n\nComplete coverage');

    const partial = clone(validEditionRecord) as TestEdition;
    partial.publication_status = 'partial';
    partial.coverage[1] = {
      ...partial.coverage[1],
      status: 'degraded',
      detail: 'The requested arXiv cs.GR date could not be verified.',
    };
    const partialMarkdown = renderEditionMarkdown(
      editionRecordSchema.parse(partial),
      [paperRecordSchema.parse(validPaperRecord)],
    );
    expect(partialMarkdown).toContain('publication_status: partial');
    expect(partialMarkdown).toContain('## Publication status\n\nPartial coverage');
    expect(partialMarkdown).toContain('arXiv cs.GR: 2026-08-10 (degraded)');
  });

  it('requires exceptional length when total reading time exceeds twenty minutes', () => {
    const edition = clone(validEditionRecord) as TestEdition;
    edition.entries = [
      { ...clone(validReadFirstEntry), estimated_minutes: 11 },
      { ...clone(validReadFirstEntry), estimated_minutes: 10 },
    ];
    edition.exceptional_length = false;
    expect(() => editionRecordSchema.parse(edition)).toThrow();

    edition.exceptional_length = true;
    expect(editionRecordSchema.parse(edition).exceptional_length).toBe(true);
  });

  it('allows a zero-entry edition when exceptional length is false', () => {
    const edition = clone(validEditionRecord) as TestEdition;
    edition.entries = [];
    edition.exceptional_length = false;

    const parsed = editionRecordSchema.parse(edition);
    expect(parsed.entries).toEqual([]);
    expect(parsed.exceptional_length).toBe(false);
  });

  it('projects a zero-entry edition as non-fixture with a neutral quality-bar message', () => {
    const edition = clone(validEditionRecord) as TestEdition;
    edition.entries = [];
    edition.exceptional_length = false;

    const rendered = renderEditionMarkdown(
      editionRecordSchema.parse(edition),
      paperRecordSchema.array().parse([validPaperRecord]),
    );

    expect(rendered).toContain('fixture_only: false');
    expect(rendered).toContain('No papers met the quality bar for this edition.');
    expect(rendered.endsWith('\n')).toBe(true);
  });

  it('reports the same neutral zero-selection state for page rendering', () => {
    const edition = clone(validEditionRecord) as TestEdition;
    edition.entries = [];
    edition.exceptional_length = false;
    const parsedEdition = editionRecordSchema.parse(edition);
    const paper = paperRecordSchema.parse(validPaperRecord);

    expect(getEditionViewState(parsedEdition, new Map([[paper.paper_id, paper]]))).toEqual({
      fixtureOnly: false,
      emptyMessage: 'No papers met the quality bar for this edition.',
    });
  });

  it.each([
    ['paper', paperRecordSchema, { ...validPaperRecord, unexpected: true }],
    ['edition', editionRecordSchema, { ...validEditionRecord, unexpected: true }],
    ['coverage', editionRecordSchema, { ...validEditionRecord, coverage: [{ ...validEditionRecord.coverage[0], unexpected: true }] }],
    ['entry', editionRecordSchema, { ...validEditionRecord, entries: [{ ...validReadFirstEntry, unexpected: true }] }],
  ])('rejects unknown keys on strict %s objects', (_scope, schema, record) => {
    expect(() => schema.parse(clone(record))).toThrow();
  });
});
