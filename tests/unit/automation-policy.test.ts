import { describe, expect, it } from 'vitest';
import {
  advanceSuccessfulWatermarks,
  assessSourceObservation,
  decidePublication,
  unprocessedDates,
} from '../../src/automation/policy';
import type { AutomationState, PreparedSourceResult } from '../../src/automation/contracts';

const sourceNames = ['arxiv_cs_cv', 'arxiv_cs_gr', 'huggingface_papers'] as const;

function sourceResult(
  source: typeof sourceNames[number],
  status: 'complete' | 'degraded',
  dates = ['2026-08-10'],
): PreparedSourceResult {
  return {
    source,
    requested_dates: dates,
    status,
    record_count: status === 'complete' ? 4 : 0,
    attempts: [{ attempted_at: '2026-08-11T00:00:00.000Z', outcome: status }],
    candidates: [],
    ...(status === 'degraded' ? { detail: 'Requested date could not be verified.' } : {}),
  };
}

function initialState(): AutomationState {
  return {
    schema_version: 1,
    sources: {
      arxiv_cs_cv: { processed_through: '2026-08-07', recent_counts: [] },
      arxiv_cs_gr: { processed_through: '2026-08-07', recent_counts: [] },
      huggingface_papers: { processed_through: '2026-08-07', recent_counts: [] },
    },
  };
}

describe('Daily Brief automation policy', () => {
  it('processes every unprocessed date through the day before delivery, including weekend safety dates', () => {
    expect(unprocessedDates('2026-08-07', '2026-08-11')).toEqual([
      '2026-08-08',
      '2026-08-09',
      '2026-08-10',
    ]);
    expect(unprocessedDates('2026-08-10', '2026-08-11')).toEqual([]);
  });

  it('rejects a watermark on or after the delivery date', () => {
    expect(() => unprocessedDates('2026-08-11', '2026-08-11')).toThrow(/before delivery/i);
  });

  it('classifies malformed, missing-date, uncorroborated empty, and unusually low observations as degraded', () => {
    expect(assessSourceObservation({
      expected_dates: ['2026-08-10'],
      observed_dates: ['2026-08-10'],
      structural_valid: false,
      record_count: 10,
      recent_counts: [10, 12, 9],
      corroborated_empty: false,
      corroborated_low_count: false,
    }).status).toBe('degraded');

    expect(assessSourceObservation({
      expected_dates: ['2026-08-10'],
      observed_dates: [],
      structural_valid: true,
      record_count: 10,
      recent_counts: [10, 12, 9],
      corroborated_empty: false,
      corroborated_low_count: false,
    }).detail).toMatch(/missing a requested date/i);

    expect(assessSourceObservation({
      expected_dates: ['2026-08-10'],
      observed_dates: ['2026-08-10'],
      structural_valid: true,
      record_count: 0,
      recent_counts: [],
      corroborated_empty: false,
      corroborated_low_count: false,
    }).detail).toMatch(/empty response/i);

    expect(assessSourceObservation({
      expected_dates: ['2026-08-10'],
      observed_dates: ['2026-08-10'],
      structural_valid: true,
      record_count: 1,
      recent_counts: [10, 12, 8, 11],
      corroborated_empty: false,
      corroborated_low_count: false,
    }).detail).toMatch(/unusually low/i);
  });

  it('accepts structurally valid normal counts and corroborated empty dates', () => {
    expect(assessSourceObservation({
      expected_dates: ['2026-08-10'],
      observed_dates: ['2026-08-10'],
      structural_valid: true,
      record_count: 8,
      recent_counts: [10, 12, 8, 11],
      corroborated_empty: false,
      corroborated_low_count: false,
    }).status).toBe('complete');

    expect(assessSourceObservation({
      expected_dates: ['2026-08-09'],
      observed_dates: ['2026-08-09'],
      structural_valid: true,
      record_count: 0,
      recent_counts: [3, 2],
      corroborated_empty: true,
      corroborated_low_count: false,
    }).status).toBe('complete');
  });

  it('distinguishes complete, partial, and all-failed source sets', () => {
    expect(decidePublication(sourceNames.map((source) => sourceResult(source, 'complete')))).toBe('complete');
    expect(decidePublication([
      sourceResult('arxiv_cs_cv', 'complete'),
      sourceResult('arxiv_cs_gr', 'degraded'),
      sourceResult('huggingface_papers', 'complete'),
    ])).toBe('partial');
    expect(decidePublication(sourceNames.map((source) => sourceResult(source, 'degraded')))).toBe('all_failed');
  });

  it('advances only complete source watermarks and count history', () => {
    const next = advanceSuccessfulWatermarks(initialState(), [
      sourceResult('arxiv_cs_cv', 'complete', ['2026-08-08', '2026-08-09', '2026-08-10']),
      sourceResult('arxiv_cs_gr', 'degraded', ['2026-08-08', '2026-08-09', '2026-08-10']),
      sourceResult('huggingface_papers', 'complete', ['2026-08-08', '2026-08-09', '2026-08-10']),
    ]);

    expect(next.sources.arxiv_cs_cv.processed_through).toBe('2026-08-10');
    expect(next.sources.huggingface_papers.processed_through).toBe('2026-08-10');
    expect(next.sources.arxiv_cs_gr.processed_through).toBe('2026-08-07');
    expect(next.sources.arxiv_cs_cv.recent_counts).toEqual([{ date: '2026-08-10', count: 4 }]);
    expect(next.sources.arxiv_cs_gr.recent_counts).toEqual([]);
  });

  it('requires exactly one result for every approved source', () => {
    expect(() => decidePublication([
      sourceResult('arxiv_cs_cv', 'complete'),
      sourceResult('arxiv_cs_gr', 'complete'),
    ])).toThrow(/three approved sources/i);
  });
});
