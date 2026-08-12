import { describe, expect, it } from 'vitest';
import { finalizeRun } from '../../src/automation/finalize-run';
import type { AutomationState, PreparedRun } from '../../src/automation/contracts';
import type { PaperRecord } from '../../src/schemas/content';

const candidateId = '00000000-0000-5000-8000-000000000001';
const sourceUrl = 'https://arxiv.org/abs/2608.07468';
const listingUrl = 'https://arxiv.org/list/cs.CV/recent';

const state: AutomationState = {
  schema_version: 1,
  sources: {
    arxiv_cs_cv: { processed_through: '2026-08-09', recent_counts: [] },
    arxiv_cs_gr: { processed_through: '2026-08-09', recent_counts: [] },
    huggingface_papers: { processed_through: '2026-08-09', recent_counts: [] },
  },
};

function prepared(statuses: Array<'complete' | 'degraded'>): PreparedRun {
  const names = ['arxiv_cs_cv', 'arxiv_cs_gr', 'huggingface_papers'] as const;
  return {
    delivery_date: '2026-08-11',
    prepared_at: '2026-08-11T00:00:00.000Z',
    publication_decision: statuses.every((status) => status === 'complete')
      ? 'complete'
      : statuses.every((status) => status === 'degraded') ? 'all_failed' : 'partial',
    sources: names.map((source, index) => ({
      source,
      requested_dates: ['2026-08-10'],
      status: statuses[index],
      record_count: index === 0 ? 1 : 0,
      attempts: [{
        attempted_at: '2026-08-11T00:00:00.000Z',
        outcome: statuses[index],
        ...(statuses[index] === 'degraded' ? { detail: 'The source response was malformed or structurally invalid.' } : {}),
      }],
      candidates: index === 0 ? [{
        candidate_key: candidateId,
        external_ids: [{ kind: 'arxiv', value: '2608.07468' }],
        title: 'Selected paper',
        authors: ['Fixture Author'],
        abstract: 'Fixture abstract.',
        subjects: ['cs.CV'],
        source_dates: [{ source: 'arxiv_cs_cv', date: '2026-08-10' }],
        links: [{ kind: 'paper', url: sourceUrl }, { kind: 'source', url: listingUrl }],
      }] : [],
      ...(statuses[index] === 'degraded' ? { detail: 'The source response was malformed or structurally invalid.' } : {}),
    })),
    candidates: [{
      candidate_key: candidateId,
      external_ids: [{ kind: 'arxiv', value: '2608.07468' }],
      title: 'Selected paper',
      authors: ['Fixture Author'],
      abstract: 'Fixture abstract.',
      subjects: ['cs.CV'],
      source_dates: [{ source: 'arxiv_cs_cv', date: '2026-08-10' }],
      links: [{ kind: 'paper', url: sourceUrl }, { kind: 'source', url: listingUrl }],
    }],
  };
}

const paper: PaperRecord = {
  paper_id: candidateId,
  external_ids: [{ kind: 'arxiv', value: '2608.07468' }],
  title: 'Selected paper',
  authors: ['Fixture Author'],
  affiliations: [],
  abstract: 'Fixture abstract.',
  source_dates: [{ source: 'arxiv_cs_cv', date: '2026-08-10' }],
  links: [
    { kind: 'paper', label: 'arXiv', url: sourceUrl },
    { kind: 'source', label: 'Source listing', url: listingUrl },
  ],
  tags: ['vision'],
  provenance: [{ field: 'metadata', url: sourceUrl, checked_at: '2026-08-11T00:00:00.000Z' }],
};

const draft = {
  generated_at: '2026-08-11T00:30:00.000Z',
  editorial_theme: 'A quality-first pilot.',
  papers: [paper],
  entries: [{
    paper_id: candidateId,
    tier: 'worth_skimming' as const,
    lane: 'broader_vision' as const,
    review_depth: 'abstract' as const,
    editorial_note: 'A concise technical direction worth tracking. The evidence is preliminary.',
    claim_provenance: [{ field: 'editorial_note' as const, urls: [sourceUrl] }],
    estimated_minutes: 4,
  }],
};

describe('Daily Brief finalization', () => {
  it('derives partial coverage and advances only successful source watermarks', () => {
    const result = finalizeRun({ prepared: prepared(['complete', 'degraded', 'complete']), draft, state, existingPapers: [] });

    expect(result.edition.publication_status).toBe('partial');
    expect(result.edition.coverage.map(({ source, status }) => [source, status])).toEqual([
      ['arxiv_cs_cv', 'complete'],
      ['arxiv_cs_gr', 'degraded'],
      ['huggingface_papers', 'complete'],
    ]);
    expect(result.state.sources.arxiv_cs_cv.processed_through).toBe('2026-08-10');
    expect(result.state.sources.arxiv_cs_gr.processed_through).toBe('2026-08-09');
    expect(result.state.sources.huggingface_papers.processed_through).toBe('2026-08-10');
    expect(result.markdown).toContain('Partial coverage');
  });

  it('refuses publication when all sources fail', () => {
    expect(() => finalizeRun({ prepared: prepared(['degraded', 'degraded', 'degraded']), draft, state, existingPapers: [] }))
      .toThrow(/all sources/i);
  });

  it('publishes a complete zero-selection edition when every source succeeded', () => {
    const emptyDraft = { ...draft, papers: [], entries: [] };
    const result = finalizeRun({
      prepared: { ...prepared(['complete', 'complete', 'complete']), candidates: [] },
      draft: emptyDraft,
      state,
      existingPapers: [],
    });

    expect(result.edition.publication_status).toBe('complete');
    expect(result.edition.entries).toEqual([]);
    expect(result.markdown).toContain('No papers met the quality bar for this edition.');
  });

  it('refuses editorial papers that were not in the prepared candidate manifest', () => {
    const unrelated = structuredClone(draft);
    unrelated.papers[0].paper_id = '00000000-0000-5000-8000-000000000099';
    unrelated.entries[0].paper_id = unrelated.papers[0].paper_id;
    expect(() => finalizeRun({ prepared: prepared(['complete', 'complete', 'complete']), draft: unrelated, state, existingPapers: [] }))
      .toThrow(/prepared candidate/i);
  });

  it('refuses candidate metadata or source attribution drift in the editorial draft', () => {
    const drifted = structuredClone(draft);
    drifted.papers[0].source_dates = [{ source: 'arxiv_cs_gr', date: '2026-08-10' }];
    expect(() => finalizeRun({ prepared: prepared(['complete', 'complete', 'complete']), draft: drifted, state, existingPapers: [] }))
      .toThrow(/candidate metadata/i);
  });

  it('reconciles the same edition without regressing earlier successful coverage', () => {
    const first = finalizeRun({ prepared: prepared(['complete', 'degraded', 'complete']), draft, state, existingPapers: [] });
    const recovery = prepared(['complete', 'complete', 'complete']);
    recovery.sources[0].requested_dates = [];
    recovery.sources[0].attempts = [];
    recovery.sources[0].record_count = 0;
    recovery.sources[0].candidates = [];
    recovery.sources[2].requested_dates = [];
    recovery.sources[2].attempts = [];
    recovery.sources[2].record_count = 0;
    recovery.sources[2].candidates = [];

    const result = finalizeRun({
      prepared: recovery,
      draft,
      state: first.state,
      existingPapers: first.papers,
      existingEdition: first.edition,
    });

    expect(result.edition.publication_status).toBe('complete');
    expect(result.edition.coverage.every(({ status }) => status === 'complete')).toBe(true);
  });

  it('rejects a stale prepared manifest after its source dates were already processed', () => {
    const advanced = structuredClone(state);
    for (const source of Object.values(advanced.sources)) source.processed_through = '2026-08-10';
    expect(() => finalizeRun({ prepared: prepared(['complete', 'complete', 'complete']), draft, state: advanced, existingPapers: [] }))
      .toThrow(/stale prepared/i);
  });

  it('preserves the existing edition timestamp and reports no change on a semantic rerun', () => {
    const first = finalizeRun({ prepared: prepared(['complete', 'complete', 'complete']), draft, state, existingPapers: [] });
    const rerun = prepared(['complete', 'complete', 'complete']);
    rerun.candidates = [];
    for (const source of rerun.sources) {
      source.requested_dates = [];
      source.attempts = [];
      source.record_count = 0;
      source.candidates = [];
    }
    const laterDraft = { ...draft, generated_at: '2026-08-12T00:00:00.000Z' };

    const result = finalizeRun({
      prepared: rerun,
      draft: laterDraft,
      state: first.state,
      existingPapers: first.papers,
      existingEdition: first.edition,
    });

    expect(result.changed).toBe(false);
    expect(result.edition.generated_at).toBe(first.edition.generated_at);
  });
});
