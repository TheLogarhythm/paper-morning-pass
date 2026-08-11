import {
  validateEditionAgainstPapers,
  type ClaimProvenance,
  type EditorialLane,
  type EditionRecord,
  type PaperRecord,
  type ReviewDepth,
  type SourceName,
} from '../schemas/content';

const monthNames = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const laneLabels: Record<EditorialLane, string> = {
  graphics_3d_4d: 'Graphics / 3D / 4D',
  broader_vision: 'Broader vision',
  general_ai: 'General AI',
};

const reviewDepthLabels: Record<ReviewDepth, string> = {
  abstract: 'Abstract',
  full_paper: 'Full paper',
  full_paper_plus_artifacts: 'Full paper plus artifacts',
};

const sourceLabels: Record<SourceName, string> = {
  arxiv_cs_cv: 'arXiv cs.CV',
  arxiv_cs_gr: 'arXiv cs.GR',
  huggingface_papers: 'Hugging Face Papers',
};

function formatDeliveryDate(deliveryDate: string): string {
  const [year, month, day] = deliveryDate.split('-').map(Number);
  return `${day} ${monthNames[month - 1]} ${year}`;
}

function claimSourceLine(claims: ClaimProvenance[], field: ClaimProvenance['field']): string {
  const urls = claims.find((claim) => claim.field === field)?.urls ?? [];
  return `Primary source: ${urls.map((url) => `[source](${url})`).join(', ')}.`;
}

function renderReadFirstEntry(entry: Extract<EditionRecord['entries'][number], { tier: 'read_first' }>): string[] {
  const sections: Array<[string, string, ClaimProvenance['field']]> = [
    ['Verdict', entry.verdict, 'verdict'],
    ['Contribution', entry.contribution, 'contribution'],
    ['Why it matters', entry.why_it_matters, 'why_it_matters'],
    ['Evidence', entry.evidence, 'evidence'],
    ['Limitation', entry.limitation, 'limitation'],
  ];
  if (entry.venue_context) {
    sections.push(['Venue context', entry.venue_context, 'venue_context']);
  }

  return sections.flatMap(([heading, text, field]) => [
    `### ${heading}`,
    '',
    text,
    '',
    claimSourceLine(entry.claim_provenance, field),
    '',
  ]);
}

function renderWorthSkimmingEntry(entry: Extract<EditionRecord['entries'][number], { tier: 'worth_skimming' }>): string[] {
  return [
    '### Editorial note',
    '',
    entry.editorial_note,
    '',
    claimSourceLine(entry.claim_provenance, 'editorial_note'),
    '',
  ];
}

export function renderEditionMarkdown(edition: EditionRecord, papers: PaperRecord[]): string {
  validateEditionAgainstPapers(edition, papers);
  const papersById = new Map(papers.map((paper) => [paper.paper_id, paper]));
  const fixtureOnly = edition.entries.every((entry) => papersById.get(entry.paper_id)?.tags.includes('fixture'));
  const lines = [
    '---',
    `delivery_date: ${edition.delivery_date}`,
    `fixture_only: ${fixtureOnly}`,
    '---',
    '',
    `# Paper Morning Pass — ${formatDeliveryDate(edition.delivery_date)}`,
    '',
    fixtureOnly
      ? '> Fixture content for interface development. It is not a claim about a real publication.'
      : '> A curated technical reading brief from public source records.',
    '',
  ];

  if (edition.editorial_theme) {
    lines.push('## Editorial theme', '', edition.editorial_theme, '');
  }

  lines.push('## Coverage', '');
  for (const coverage of edition.coverage) {
    const detail = coverage.detail ? ` — ${coverage.detail}` : '';
    lines.push(`- ${sourceLabels[coverage.source]}: ${coverage.dates.join(', ')} (${coverage.status})${detail}`);
  }
  lines.push('');

  for (const [index, entry] of edition.entries.entries()) {
    const paper = papersById.get(entry.paper_id);
    if (!paper) {
      throw new Error(`Edition entry references an unknown paper: ${entry.paper_id}`);
    }

    const fixtureSuffix = fixtureOnly ? ' (fixture)' : '';
    lines.push(
      `## ${paper.title}`,
      '',
      `- Authors: ${paper.authors.join(', ')}`,
      `- Affiliations: ${paper.affiliations.join(', ') || 'Not provided'}`,
      `- Tier: ${entry.tier === 'read_first' ? 'Read first' : 'Worth skimming'}${fixtureSuffix}`,
      `- Lane: ${laneLabels[entry.lane]}`,
      `- Review depth: ${reviewDepthLabels[entry.review_depth]}${fixtureSuffix}`,
      `- Estimated reading time: ${entry.estimated_minutes} minutes`,
      '',
      '### Abstract',
      '',
      paper.abstract,
      '',
    );
    lines.push(...(entry.tier === 'read_first' ? renderReadFirstEntry(entry) : renderWorthSkimmingEntry(entry)));

    const canonicalLinks = paper.links.filter(({ kind }) => kind === 'paper' || kind === 'source');
    lines.push('### Canonical links', '');
    for (const link of canonicalLinks) {
      lines.push(`- [${link.label}](${link.url})`);
    }
    if (index < edition.entries.length - 1) {
      lines.push('');
    }
  }

  return `${lines.join('\n')}\n`;
}
