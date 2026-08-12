import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { parseArxivRecent } from '../../src/automation/arxiv-source';
import { parseHuggingFaceDaily } from '../../src/automation/huggingface-source';
import { mergeCandidates, stableCandidateKey } from '../../src/automation/deduplicate';

const arxivFixture = new URL('../fixtures/sources/arxiv-recent.html', import.meta.url);
const huggingFaceFixture = new URL('../fixtures/sources/huggingface-daily.json', import.meta.url);

describe('Daily Brief source adapters', () => {
  it('extracts one requested arXiv date without mixing adjacent date sections', async () => {
    const parsed = parseArxivRecent(
      await readFile(arxivFixture, 'utf8'),
      'arxiv_cs_cv',
      ['2026-08-10'],
    );

    expect(parsed.structural_valid).toBe(true);
    expect(parsed.observed_dates).toEqual(['2026-08-10']);
    expect(parsed.record_count).toBe(2);
    expect(parsed.candidates.map(({ title }) => title)).toEqual([
      'SimWAM: A Simple World Action Model',
      'Geometry Fixture',
    ]);
    expect(parsed.candidates[0]).toMatchObject({
      authors: ['Zongchuang Zhao', 'Xin Zhou'],
      external_ids: [{ kind: 'arxiv', value: '2608.07468' }],
      source_dates: [{ source: 'arxiv_cs_cv', date: '2026-08-10' }],
    });
  });

  it('returns a structurally valid missing-date observation for policy degradation', async () => {
    const parsed = parseArxivRecent(
      await readFile(arxivFixture, 'utf8'),
      'arxiv_cs_gr',
      ['2026-08-09'],
    );
    expect(parsed.structural_valid).toBe(true);
    expect(parsed.observed_dates).toEqual([]);
    expect(parsed.candidates).toEqual([]);
  });

  it('accepts the live arXiv shape with one article list per dated section', async () => {
    const fixture = await readFile(arxivFixture, 'utf8');
    const multiListFixture = fixture.replace(
      '<h3>Fri, 7 Aug 2026',
      '</dl><dl id="articles"><h3>Fri, 7 Aug 2026',
    );
    const parsed = parseArxivRecent(multiListFixture, 'arxiv_cs_cv', ['2026-08-10']);

    expect(parsed.structural_valid).toBe(true);
    expect(parsed.observed_dates).toEqual(['2026-08-10']);
    expect(parsed.record_count).toBe(2);
  });

  it('extracts Hugging Face Daily Papers metadata for the requested date', async () => {
    const parsed = parseHuggingFaceDaily(
      JSON.parse(await readFile(huggingFaceFixture, 'utf8')),
      ['2026-08-10'],
    );

    expect(parsed).toMatchObject({
      structural_valid: true,
      observed_dates: ['2026-08-10'],
      record_count: 1,
    });
    expect(parsed.candidates[0]).toMatchObject({
      title: 'SimWAM: A Simple World Action Model',
      abstract: 'A fixture abstract describing a world-action model.',
      external_ids: [
        { kind: 'arxiv', value: '2608.07468' },
        { kind: 'huggingface', value: '2608.07468' },
      ],
    });
  });

  it('marks malformed Hugging Face payloads structurally invalid without reflecting them', () => {
    const parsed = parseHuggingFaceDaily({ token: 'DO_NOT_REFLECT' }, ['2026-08-10']);
    expect(parsed.structural_valid).toBe(false);
    expect(parsed.detail).toBe('The Hugging Face response was not an array of Daily Papers records.');
    expect(JSON.stringify(parsed)).not.toContain('DO_NOT_REFLECT');
  });

  it('uses a stable UUID and merges the same arXiv paper across sources', async () => {
    expect(stableCandidateKey([{ kind: 'arxiv', value: '2608.07468v2' }]))
      .toBe(stableCandidateKey([{ kind: 'arxiv', value: '2608.07468' }]));

    const arxiv = parseArxivRecent(await readFile(arxivFixture, 'utf8'), 'arxiv_cs_cv', ['2026-08-10']);
    const huggingFace = parseHuggingFaceDaily(
      JSON.parse(await readFile(huggingFaceFixture, 'utf8')),
      ['2026-08-10'],
    );
    const merged = mergeCandidates([...arxiv.candidates, ...huggingFace.candidates]);
    const simwam = merged.find(({ title }) => title.startsWith('SimWAM'));

    expect(merged).toHaveLength(2);
    expect(simwam?.source_dates).toEqual([
      { source: 'arxiv_cs_cv', date: '2026-08-10' },
      { source: 'huggingface_papers', date: '2026-08-10' },
    ]);
    expect(simwam?.links.some(({ kind }) => kind === 'code')).toBe(true);
  });
});
