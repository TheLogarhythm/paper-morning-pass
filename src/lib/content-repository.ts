import { readdir, readFile } from 'node:fs/promises';
import {
  editionRecordSchema,
  paperRecordSchema,
  validateEditionAgainstPapers,
  type EditionRecord,
  type PaperRecord,
} from '../schemas/content';

export type ContentRepository = {
  papersById: ReadonlyMap<string, PaperRecord>;
  editions: readonly EditionRecord[];
  latest: EditionRecord;
};

type SourceLabels = {
  papers?: readonly string[];
  editions?: readonly string[];
};

function labelFor(labels: readonly string[] | undefined, index: number, fallback: string): string {
  return labels?.[index] ?? `${fallback}[${index}]`;
}

function normalizedExternalIdAlias(kind: PaperRecord['external_ids'][number]['kind'], value: string): string {
  if (kind === 'arxiv') return value.replace(/v\d+$/i, '');
  return value.toLowerCase();
}

function schemaIssues(label: string, issues: { path: PropertyKey[]; message: string }[]): string[] {
  return issues.map((issue) => {
    const path = issue.path.length > 0 ? `.${issue.path.join('.')}` : '';
    return `${label}${path}: ${issue.message}`;
  });
}

function entryEdition(edition: EditionRecord, entry: EditionRecord['entries'][number]): EditionRecord {
  const totalMinutes = entry.estimated_minutes;
  return {
    ...edition,
    entries: [entry],
    exceptional_length: totalMinutes > 20,
  } as EditionRecord;
}

function contentValidationError(errors: readonly string[]): Error {
  return new Error(`Content repository validation failed:\n${errors.map((error) => `- ${error}`).join('\n')}`);
}

/**
 * Validates parsed JSON records and creates the immutable repository view.
 * Source labels are internal plumbing for loaders so file-based failures retain
 * their path without changing the public API shape.
 */
export function buildContentRepository(
  papers: readonly unknown[],
  editions: readonly unknown[],
  sourceLabels: SourceLabels = {},
  priorErrors: readonly string[] = [],
): ContentRepository {
  const errors: string[] = [...priorErrors];
  const parsedPapers: PaperRecord[] = [];
  const parsedEditions: EditionRecord[] = [];

  for (const [index, paper] of papers.entries()) {
    const result = paperRecordSchema.safeParse(paper);
    if (result.success) {
      parsedPapers.push(result.data);
    } else {
      errors.push(...schemaIssues(labelFor(sourceLabels.papers, index, 'papers'), result.error.issues));
    }
  }

  for (const [index, edition] of editions.entries()) {
    const result = editionRecordSchema.safeParse(edition);
    if (result.success) {
      parsedEditions.push(result.data);
    } else {
      errors.push(...schemaIssues(labelFor(sourceLabels.editions, index, 'editions'), result.error.issues));
    }
  }

  const papersById = new Map<string, PaperRecord>();
  const aliases = new Map<string, string>();
  for (const paper of parsedPapers) {
    const paperLabel = paper.paper_id;
    if (papersById.has(paper.paper_id)) {
      errors.push(`Duplicate paper_id: ${paper.paper_id}`);
    } else {
      papersById.set(paper.paper_id, paper);
    }

    for (const externalId of paper.external_ids) {
      const alias = `${externalId.kind}:${normalizedExternalIdAlias(externalId.kind, externalId.value)}`;
      const previousPaperId = aliases.get(alias);
      if (previousPaperId) {
        errors.push(`Duplicate external-ID alias: ${alias} (${previousPaperId} and ${paperLabel})`);
      } else {
        aliases.set(alias, paperLabel);
      }
    }
  }

  const deliveryDates = new Set<string>();
  for (const edition of parsedEditions) {
    if (deliveryDates.has(edition.delivery_date)) {
      errors.push(`Duplicate delivery_date: ${edition.delivery_date}`);
    } else {
      deliveryDates.add(edition.delivery_date);
    }

    // The schema module owns paper-reference and provenance validation. Isolate
    // each URL so its first-error behavior cannot hide later bad URLs.
    for (const entry of edition.entries) {
      const referencedPaper = papersById.get(entry.paper_id);
      if (!referencedPaper) {
        try {
          validateEditionAgainstPapers(entryEdition(edition, entry), parsedPapers);
        } catch (error) {
          errors.push(`Edition ${edition.delivery_date}, paper ${entry.paper_id}: ${error instanceof Error ? error.message : 'cross-record validation failed'}`);
        }
        continue;
      }

      const canonicalUrl = referencedPaper.links.find((link) => link.kind === 'paper' || link.kind === 'source')?.url;
      if (!canonicalUrl) continue;
      for (const [claimIndex, claim] of entry.claim_provenance.entries()) {
        for (const url of claim.urls) {
          const isolatedEntry = {
            ...entry,
            claim_provenance: entry.claim_provenance.map((candidate, index) => ({
              ...candidate,
              urls: index === claimIndex ? [url] : [canonicalUrl],
            })),
          } as EditionRecord['entries'][number];
          try {
            validateEditionAgainstPapers(entryEdition(edition, isolatedEntry), parsedPapers);
          } catch (error) {
            errors.push(`Edition ${edition.delivery_date}, paper ${entry.paper_id}: ${error instanceof Error ? error.message : 'cross-record validation failed'}`);
          }
        }
      }
    }
  }

  if (parsedEditions.length === 0) errors.push('At least one valid edition is required');
  if (errors.length > 0) throw contentValidationError(errors);

  const sortedEditions = [...parsedEditions].sort((a, b) => b.delivery_date.localeCompare(a.delivery_date));
  return {
    papersById,
    editions: sortedEditions,
    latest: sortedEditions[0],
  };
}

function valuesFromViteGlob(glob: Record<string, unknown>, kind: 'paper' | 'edition'): { values: unknown[]; labels: string[] } {
  const entries = Object.entries(glob).sort(([left], [right]) => left.localeCompare(right));
  if (kind === 'paper') {
    const paperEntry = entries.find(([path]) => path.endsWith('/papers/index.json'));
    if (!paperEntry) throw contentValidationError(['Missing required content file: src/data/papers/index.json']);
    if (!Array.isArray(paperEntry[1])) {
      throw contentValidationError(['src/data/papers/index.json: expected a JSON array']);
    }
    return {
      values: paperEntry[1],
      labels: paperEntry[1].map((_, index) => `src/data/papers/index.json[${index}]`),
    };
  }

  if (entries.length === 0) throw contentValidationError(['Missing edition files: src/data/editions/*.json']);
  return {
    values: entries.map(([, value]) => value),
    labels: entries.map(([path]) => path.replace(/^\.\.\//, 'src/')),
  };
}

/** Vite/Astro loader for production site builds. */
export async function loadContentRepository(): Promise<ContentRepository> {
  const papers = valuesFromViteGlob(
    import.meta.glob('../data/papers/index.json', { eager: true, import: 'default' }),
    'paper',
  );
  const editions = valuesFromViteGlob(
    import.meta.glob('../data/editions/*.json', { eager: true, import: 'default' }),
    'edition',
  );
  return buildContentRepository(papers.values, editions.values, { papers: papers.labels, editions: editions.labels });
}

async function readJsonFile(path: URL, label: string): Promise<{ value: unknown } | { error: string }> {
  try {
    const text = await readFile(path, 'utf8');
    try {
      return { value: JSON.parse(text) };
    } catch {
      return { error: `${label}: invalid JSON` };
    }
  } catch (error) {
    const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
    return {
      error: code === 'ENOENT'
        ? `Missing required content file: ${label}`
        : `${label}: unable to read file`,
    };
  }
}

/** Node-only adapter for the CLI; validation remains in buildContentRepository. */
export async function loadContentRepositoryFromFileSystem(
  dataDirectory = new URL('../data/', import.meta.url),
): Promise<ContentRepository> {
  const papersPath = new URL('papers/index.json', dataDirectory);
  const editionsDirectory = new URL('editions/', dataDirectory);
  const errors: string[] = [];
  let paperDocument: unknown = [];
  let editionNames: string[] = [];

  const paperResult = await readJsonFile(papersPath, 'src/data/papers/index.json');
  if ('error' in paperResult) errors.push(paperResult.error);
  else paperDocument = paperResult.value;
  try {
    editionNames = (await readdir(editionsDirectory)).filter((name) => name.endsWith('.json')).sort();
  } catch {
    errors.push('Missing edition files: src/data/editions/*.json');
  }

  const editionResults = await Promise.all(editionNames.map(async (name) => {
    const label = `src/data/editions/${name}`;
    const result = await readJsonFile(new URL(name, editionsDirectory), label);
    return 'error' in result ? result : { label, value: result.value };
  }));

  if (!Array.isArray(paperDocument)) errors.push('src/data/papers/index.json: expected a JSON array');
  if (editionNames.length === 0 && !errors.some((error) => error.startsWith('Missing edition files'))) {
    errors.push('Missing edition files: src/data/editions/*.json');
  }
  const papers = Array.isArray(paperDocument) ? paperDocument : [];
  const editions = editionResults.filter((document): document is { label: string; value: unknown } => 'label' in document);
  errors.push(...editionResults.flatMap((document) => 'error' in document ? [document.error] : []));
  return buildContentRepository(
    papers,
    editions.map((document) => document.value),
    {
      papers: papers.map((_, index) => `src/data/papers/index.json[${index}]`),
      editions: editions.map((document) => document.label),
    },
    errors,
  );
}
