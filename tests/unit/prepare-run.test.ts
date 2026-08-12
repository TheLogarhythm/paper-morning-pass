import { describe, expect, it } from 'vitest';
import { prepareRun, type SourceLoader } from '../../src/automation/prepare-run';
import type { AutomationState } from '../../src/automation/contracts';

const state: AutomationState = {
  schema_version: 1,
  sources: {
    arxiv_cs_cv: { processed_through: '2026-08-09', recent_counts: [] },
    arxiv_cs_gr: { processed_through: '2026-08-09', recent_counts: [] },
    huggingface_papers: { processed_through: '2026-08-09', recent_counts: [] },
  },
};

function completePayload(source: 'arxiv_cs_cv' | 'arxiv_cs_gr' | 'huggingface_papers') {
  return {
    structural_valid: true,
    observed_dates: ['2026-08-10'],
    record_count: 1,
    corroborated_empty: false,
    corroborated_low_count: false,
    candidates: [{
      candidate_key: '00000000-0000-5000-8000-000000000001',
      external_ids: [{ kind: 'arxiv' as const, value: '2608.07468' }],
      title: 'Shared candidate',
      authors: ['Fixture Author'],
      subjects: ['Fixture'],
      source_dates: [{ source, date: '2026-08-10' }],
      links: [
        { kind: 'paper' as const, url: 'https://arxiv.org/abs/2608.07468' },
        { kind: 'source' as const, url: 'https://example.org/source' },
      ],
    }],
  };
}

describe('Daily Brief run preparation', () => {
  it('retries only degraded sources and keeps exact attempt history', async () => {
    const calls = new Map<string, number>();
    const sleeps: number[] = [];
    const loader: SourceLoader = async (source) => {
      const count = (calls.get(source) ?? 0) + 1;
      calls.set(source, count);
      if (source === 'arxiv_cs_cv' && count === 1) {
        return {
          structural_valid: false,
          observed_dates: [],
          record_count: 0,
          corroborated_empty: false,
          corroborated_low_count: false,
          candidates: [],
          detail: 'Malformed source response.',
        };
      }
      if (source === 'arxiv_cs_gr') {
        return {
          structural_valid: false,
          observed_dates: [],
          record_count: 0,
          corroborated_empty: false,
          corroborated_low_count: false,
          candidates: [],
          detail: 'Malformed source response.',
        };
      }
      return completePayload(source);
    };

    const run = await prepareRun({
      deliveryDate: '2026-08-11',
      state,
      loader,
      retryDelaysMs: [0, 0],
      sleep: async (milliseconds) => { sleeps.push(milliseconds); },
      now: (() => {
        let second = 0;
        return () => `2026-08-11T00:00:0${second++}.000Z`;
      })(),
    });

    expect(run.publication_decision).toBe('partial');
    expect(run.sources.find(({ source }) => source === 'arxiv_cs_cv')?.attempts).toHaveLength(2);
    expect(run.sources.find(({ source }) => source === 'arxiv_cs_gr')?.attempts).toHaveLength(3);
    expect(run.sources.find(({ source }) => source === 'huggingface_papers')?.attempts).toHaveLength(1);
    expect(sleeps).toEqual([0, 0]);
    expect(run.candidates).toHaveLength(1);
  });

  it('requests every source date after its own watermark through delivery minus one', async () => {
    const datesBySource = new Map<string, string[]>();
    const catchupState = structuredClone(state);
    catchupState.sources.arxiv_cs_cv.processed_through = '2026-08-07';
    const loader: SourceLoader = async (source, requestedDates) => {
      datesBySource.set(source, requestedDates);
      return {
        ...completePayload(source),
        observed_dates: requestedDates,
        record_count: 0,
        corroborated_empty: true,
        candidates: [],
      };
    };

    const run = await prepareRun({
      deliveryDate: '2026-08-11',
      state: catchupState,
      loader,
      retryDelaysMs: [],
      sleep: async () => {},
      now: () => '2026-08-11T00:00:00.000Z',
    });

    expect(datesBySource.get('arxiv_cs_cv')).toEqual(['2026-08-08', '2026-08-09', '2026-08-10']);
    expect(datesBySource.get('arxiv_cs_gr')).toEqual(['2026-08-10']);
    expect(run.publication_decision).toBe('complete');
  });

  it('does not refetch sources already processed for a same-edition reconciliation', async () => {
    const calls: string[] = [];
    const reconciliationState = structuredClone(state);
    reconciliationState.sources.arxiv_cs_cv.processed_through = '2026-08-10';
    reconciliationState.sources.huggingface_papers.processed_through = '2026-08-10';
    const loader: SourceLoader = async (source) => {
      calls.push(source);
      return completePayload(source);
    };

    const run = await prepareRun({
      deliveryDate: '2026-08-11',
      state: reconciliationState,
      loader,
      retryDelaysMs: [],
      sleep: async () => {},
      now: () => '2026-08-11T01:00:00.000Z',
    });

    expect(calls).toEqual(['arxiv_cs_gr']);
    expect(run.sources.find(({ source }) => source === 'arxiv_cs_cv')).toMatchObject({
      requested_dates: [],
      status: 'complete',
      attempts: [],
    });
  });
});
