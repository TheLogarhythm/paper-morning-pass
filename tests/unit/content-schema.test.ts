import { describe, expect, it } from 'vitest';
import {
  editionRecordSchema,
  paperRecordSchema,
  reviewDepthSchema,
} from '../../src/schemas/content';
import { validEditionRecord, validPaperRecord, validReadFirstEntry } from '../fixtures/content';

function clone<T>(value: T): T {
  return structuredClone(value);
}

type TestPaper = Record<string, unknown> & {
  links: Array<{ url: string }>;
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

  it('requires each coverage source to declare complete or degraded status', () => {
    const edition = clone(validEditionRecord) as TestEdition;
    edition.coverage[0].status = '';
    expect(() => editionRecordSchema.parse(edition)).toThrow();
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

  it.each([
    ['paper', paperRecordSchema, { ...validPaperRecord, private_score: 99 }],
    ['edition', editionRecordSchema, { ...validEditionRecord, personal_note: 'private' }],
    ['coverage', editionRecordSchema, { ...validEditionRecord, coverage: [{ ...validEditionRecord.coverage[0], owner_id: 'private' }] }],
    ['entry', editionRecordSchema, { ...validEditionRecord, entries: [{ ...validReadFirstEntry, selection_rationale: 'private' }] }],
  ])('rejects unknown private fields on strict %s objects', (_scope, schema, record) => {
    expect(() => schema.parse(clone(record))).toThrow();
  });
});
