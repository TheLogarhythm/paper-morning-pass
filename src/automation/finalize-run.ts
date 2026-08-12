import { z } from 'zod';
import { buildContentRepository } from '../lib/content-repository';
import { renderEditionMarkdown } from '../lib/edition-markdown';
import {
  editionEntrySchema,
  editionRecordSchema,
  paperRecordSchema,
  validateEditionAgainstPapers,
  type EditionRecord,
  type PaperRecord,
} from '../schemas/content';
import { automationStateSchema, preparedRunSchema, sourceNames, type AutomationState, type PreparedRun } from './contracts';
import { advanceSuccessfulWatermarks, decidePublication, unprocessedDates } from './policy';

const editorialDraftSchema = z.object({
  generated_at: z.iso.datetime(),
  editorial_theme: z.string().trim().min(1).optional(),
  papers: z.array(paperRecordSchema),
  entries: z.array(editionEntrySchema),
}).strict();

export type EditorialDraft = z.infer<typeof editorialDraftSchema>;

type FinalizeRunInput = {
  prepared: PreparedRun;
  draft: EditorialDraft;
  state: AutomationState;
  existingPapers: PaperRecord[];
  existingEdition?: EditionRecord;
};

type FinalizedRun = {
  edition: EditionRecord;
  papers: PaperRecord[];
  state: AutomationState;
  markdown: string;
  changed: boolean;
};

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function withoutGeneratedAt(edition: EditionRecord): Omit<EditionRecord, 'generated_at'> {
  const { generated_at: _generatedAt, ...rest } = edition;
  return rest;
}

function coverageFor(
  prepared: PreparedRun,
  existingEdition: EditionRecord | undefined,
): EditionRecord['coverage'] {
  const previous = new Map(existingEdition?.coverage.map((item) => [item.source, item]) ?? []);
  return sourceNames.map((source) => {
    const result = prepared.sources.find((item) => item.source === source);
    if (!result) throw new Error('Prepared run is missing an approved source.');
    const prior = previous.get(source);

    if (result.requested_dates.length === 0) {
      if (!prior || prior.status !== 'complete') {
        throw new Error('Already-processed source coverage requires a prior complete record for the same edition.');
      }
      return prior;
    }

    const dates = [...new Set([...(prior?.dates ?? []), ...result.requested_dates])].sort();
    if (prior?.status === 'complete' && result.status === 'degraded') return prior;
    return {
      source,
      dates,
      status: result.status,
      ...(result.status === 'degraded'
        ? { detail: result.detail ?? 'The source could not be validated after retries.' }
        : {}),
    };
  });
}

function verifyDraftCandidates(
  prepared: PreparedRun,
  draftPapers: PaperRecord[],
  existingPapers: PaperRecord[],
): void {
  const existingById = new Map(existingPapers.map((paper) => [paper.paper_id, paper]));
  const candidates = new Map(prepared.candidates.map((candidate) => [candidate.candidate_key, candidate]));
  const successfulSources = new Set(
    prepared.sources.filter(({ status }) => status === 'complete').map(({ source }) => source),
  );

  for (const paper of draftPapers) {
    const candidate = candidates.get(paper.paper_id);
    if (!candidate) {
      const existing = existingById.get(paper.paper_id);
      if (existing && sameJson(existing, paper)) continue;
      throw new Error('Every new or changed editorial paper must match a prepared candidate.');
    }
    if (!candidate.source_dates.some(({ source }) => successfulSources.has(source))) {
      throw new Error('A paper cannot be selected exclusively from degraded source coverage.');
    }
    const paperAliases = new Set(paper.external_ids.map(({ kind, value }) => `${kind}:${value.replace(/v\d+$/i, '')}`));
    const candidateAliases = candidate.external_ids.map(({ kind, value }) => `${kind}:${value.replace(/v\d+$/i, '')}`);
    if (!candidateAliases.every((alias) => paperAliases.has(alias))) {
      throw new Error('The editorial paper external IDs do not match its prepared candidate.');
    }
    const paperSourceDates = paper.source_dates.map(({ source, date }) => `${source}:${date}`).sort();
    const candidateSourceDates = candidate.source_dates.map(({ source, date }) => `${source}:${date}`).sort();
    if (
      paper.title !== candidate.title
      || !sameJson(paper.authors, candidate.authors)
      || !sameJson(paperSourceDates, candidateSourceDates)
    ) {
      throw new Error('Editorial candidate metadata does not match the prepared manifest.');
    }
  }
}

export function finalizeRun(input: FinalizeRunInput): FinalizedRun {
  const prepared = preparedRunSchema.parse(input.prepared);
  const draft = editorialDraftSchema.parse(input.draft);
  const state = automationStateSchema.parse(input.state);
  const existingPapers = paperRecordSchema.array().parse(input.existingPapers);
  const existingEdition = input.existingEdition ? editionRecordSchema.parse(input.existingEdition) : undefined;

  const derivedDecision = decidePublication(prepared.sources);
  if (prepared.publication_decision !== derivedDecision) {
    throw new Error('Prepared publication decision does not match its source results.');
  }
  if (derivedDecision === 'all_failed') {
    throw new Error('Publication is forbidden when all sources fail.');
  }
  if (existingEdition && existingEdition.delivery_date !== prepared.delivery_date) {
    throw new Error('Reconciliation can only update the same delivery-date edition.');
  }
  for (const result of prepared.sources) {
    const expectedDates = unprocessedDates(state.sources[result.source].processed_through, prepared.delivery_date);
    if (!sameJson(result.requested_dates, expectedDates)) {
      throw new Error('Stale prepared manifest: requested dates do not match the current source watermark.');
    }
  }

  verifyDraftCandidates(prepared, draft.papers, existingPapers);
  const papersById = new Map(existingPapers.map((paper) => [paper.paper_id, paper]));
  for (const paper of draft.papers) papersById.set(paper.paper_id, paper);
  const papers = [...papersById.values()];
  const coverage = coverageFor(prepared, existingEdition);
  const completeCount = coverage.filter(({ status }) => status === 'complete').length;
  if (completeCount === 0) throw new Error('Publication is forbidden when all sources fail.');

  const totalMinutes = draft.entries.reduce((sum, entry) => sum + entry.estimated_minutes, 0);
  const candidateEdition = editionRecordSchema.parse({
    delivery_date: prepared.delivery_date,
    generated_at: draft.generated_at,
    publication_status: completeCount === sourceNames.length ? 'complete' : 'partial',
    coverage,
    ...(draft.editorial_theme ? { editorial_theme: draft.editorial_theme } : {}),
    entries: draft.entries,
    exceptional_length: totalMinutes > 20,
    validation_status: 'validated',
  });
  validateEditionAgainstPapers(candidateEdition, papers);
  buildContentRepository(papers, [candidateEdition]);
  const nextState = advanceSuccessfulWatermarks(state, prepared.sources);
  const changed = !existingEdition
    || !sameJson(withoutGeneratedAt(existingEdition), withoutGeneratedAt(candidateEdition))
    || !sameJson(existingPapers, papers)
    || !sameJson(state, nextState);
  const edition = !changed && existingEdition ? existingEdition : candidateEdition;

  return {
    edition,
    papers,
    state: nextState,
    markdown: renderEditionMarkdown(edition, papers),
    changed,
  };
}
