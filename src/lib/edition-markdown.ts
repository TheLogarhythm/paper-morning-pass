import {
  validateEditionAgainstPapers,
  type EditorialLane,
  type EditionRecord,
  type PaperRecord,
  type ReviewDepth,
  type SourceName,
} from '../schemas/content';
import { safeExternalUrl } from './safe-link';
import { getEditionViewState } from './edition-view-state';

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

function escapeMarkdownText(value: string): string {
  const singleLine = value.replace(/\r\n?|\n/g, ' ↵ ');
  const escaped = singleLine
    .replace(/\\/g, '\\\\')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/([`*_\[\]#!|])/g, '\\$1');

  return escaped
    .replace(/^([-+>])/, '\\$1')
    .replace(/^(\d+)\./, '$1\\.')
    .replace(/^([=~])/, '\\$1');
}

function serializeMarkdownDestination(value: string): string {
  return safeExternalUrl(value).replace(/\(/g, '%28').replace(/\)/g, '%29');
}

function serializeMarkdownLink(label: string, destination: string): string {
  return `[${escapeMarkdownText(label)}](${serializeMarkdownDestination(destination)})`;
}

function formatDeliveryDate(deliveryDate: string): string {
  const [year, month, day] = deliveryDate.split('-').map(Number);
  return `${day} ${monthNames[month - 1]} ${year}`;
}

function renderReadFirstEntry(entry: Extract<EditionRecord['entries'][number], { tier: 'read_first' }>): string[] {
  const sections: Array<[string, string]> = [
    ['Verdict', entry.verdict],
    ['Contribution', entry.contribution],
    ['Why it matters', entry.why_it_matters],
    ['Evidence', entry.evidence],
    ['Limitation', entry.limitation],
  ];
  if (entry.venue_context) {
    sections.push(['Venue context', entry.venue_context]);
  }

  return sections.flatMap(([heading, text]) => [
    `### ${heading}`,
    '',
    escapeMarkdownText(text),
    '',
  ]);
}

function renderWorthSkimmingEntry(entry: Extract<EditionRecord['entries'][number], { tier: 'worth_skimming' }>): string[] {
  return [
    '### Editorial note',
    '',
    escapeMarkdownText(entry.editorial_note),
    '',
  ];
}

export function renderEditionMarkdown(edition: EditionRecord, papers: PaperRecord[]): string {
  validateEditionAgainstPapers(edition, papers);
  const papersById = new Map(papers.map((paper) => [paper.paper_id, paper]));
  const { fixtureOnly, emptyMessage } = getEditionViewState(edition, papersById);
  const lines = [
    '---',
    `delivery_date: ${edition.delivery_date}`,
    `publication_status: ${edition.publication_status}`,
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

  lines.push(
    '## Publication status',
    '',
    edition.publication_status === 'complete' ? 'Complete coverage' : 'Partial coverage',
    '',
  );

  if (edition.editorial_theme) {
    lines.push('## Editorial theme', '', escapeMarkdownText(edition.editorial_theme), '');
  }

  lines.push('## Coverage', '');
  for (const coverage of edition.coverage) {
    const detail = coverage.detail ? ` — ${escapeMarkdownText(coverage.detail)}` : '';
    lines.push(`- ${sourceLabels[coverage.source]}: ${coverage.dates.join(', ')} (${coverage.status})${detail}`);
  }
  lines.push('');

  if (emptyMessage) {
    lines.push(emptyMessage, '');
  }

  for (const [index, entry] of edition.entries.entries()) {
    const paper = papersById.get(entry.paper_id);
    if (!paper) {
      throw new Error(`Edition entry references an unknown paper: ${entry.paper_id}`);
    }

    const fixtureSuffix = fixtureOnly ? ' (fixture)' : '';
    lines.push(
      `## ${escapeMarkdownText(paper.title)}`,
      '',
      `- Authors: ${paper.authors.map(escapeMarkdownText).join(', ')}`,
      `- Affiliations: ${paper.affiliations.map(escapeMarkdownText).join(', ') || 'Not provided'}`,
      `- Tier: ${entry.tier === 'read_first' ? 'Read first' : 'Worth skimming'}${fixtureSuffix}`,
      `- Lane: ${laneLabels[entry.lane]}`,
      `- Review depth: ${reviewDepthLabels[entry.review_depth]}${fixtureSuffix}`,
      `- Estimated reading time: ${entry.estimated_minutes} minutes`,
      '',
      '### Abstract',
      '',
      escapeMarkdownText(paper.abstract),
      '',
    );
    lines.push(...(entry.tier === 'read_first' ? renderReadFirstEntry(entry) : renderWorthSkimmingEntry(entry)));

    const canonicalLinks = paper.links.filter(({ kind }) => kind === 'paper' || kind === 'source');
    lines.push('### Canonical links', '');
    for (const link of canonicalLinks) {
      lines.push(`- ${serializeMarkdownLink(link.label, link.url)}`);
    }
    if (index < edition.entries.length - 1) {
      lines.push('');
    }
  }

  return `${lines.join('\n')}\n`;
}
