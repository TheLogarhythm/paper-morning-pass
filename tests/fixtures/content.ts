export const fixturePaperId = '018f4a90-6d31-7b2c-9dd3-7e12c8b77210';

export const validPaperRecord = {
  paper_id: fixturePaperId,
  external_ids: [{ kind: 'arxiv', value: '2608.00001' }],
  title: 'Fixture Paper: Layered Motion Fields for Dynamic Scenes',
  authors: ['Ada Fixture'],
  affiliations: ['Fixture Research Lab'],
  abstract: 'This fictional fixture supports interface development only.',
  source_dates: [{ source: 'arxiv_cs_cv', date: '2026-08-10' }],
  links: [
    { kind: 'paper', label: 'Fixture paper record', url: 'https://example.org/papers/layered-motion-fields' },
    { kind: 'pdf', label: 'Fixture PDF', url: 'https://example.org/papers/layered-motion-fields.pdf' },
    { kind: 'source', label: 'Fixture source', url: 'https://example.org/sources/arxiv-cs-cv' },
  ],
  tags: ['fixture', 'graphics_3d_4d'],
  provenance: [
    { field: 'metadata', url: 'https://example.org/sources/arxiv-cs-cv', checked_at: '2026-08-10T08:00:00.000Z' },
  ],
};

export const validReadFirstEntry = {
  paper_id: fixturePaperId,
  tier: 'read_first',
  lane: 'graphics_3d_4d',
  review_depth: 'full_paper',
  verdict: 'This fictional fixture is a complete sample for interface development.',
  contribution: 'It models a made-up layered motion-field representation.',
  why_it_matters: 'It provides deterministic copy for the Daily Brief layout.',
  evidence: 'The fixture record links every claim to an example.org primary source.',
  limitation: 'It is not a real publication and has no research findings.',
  claim_provenance: [
    { field: 'verdict', urls: ['https://example.org/papers/layered-motion-fields'] },
    { field: 'contribution', urls: ['https://example.org/papers/layered-motion-fields'] },
    { field: 'why_it_matters', urls: ['https://example.org/papers/layered-motion-fields'] },
    { field: 'evidence', urls: ['https://example.org/papers/layered-motion-fields'] },
    { field: 'limitation', urls: ['https://example.org/papers/layered-motion-fields'] },
  ],
  estimated_minutes: 8,
};

export const validEditionRecord = {
  delivery_date: '2026-08-10',
  generated_at: '2026-08-10T08:00:00.000Z',
  publication_status: 'complete',
  coverage: [
    { source: 'arxiv_cs_cv', dates: ['2026-08-10'], status: 'complete' },
    { source: 'arxiv_cs_gr', dates: ['2026-08-10'], status: 'complete' },
    { source: 'huggingface_papers', dates: ['2026-08-10'], status: 'complete' },
  ],
  editorial_theme: 'Fixture edition for interface development.',
  entries: [validReadFirstEntry],
  exceptional_length: false,
  validation_status: 'validated',
};
