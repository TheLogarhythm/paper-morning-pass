import { z } from 'zod';

export const sourceNameSchema = z.enum(['arxiv_cs_cv', 'arxiv_cs_gr', 'huggingface_papers']);
export const reviewDepthSchema = z.enum(['abstract', 'full_paper', 'full_paper_plus_artifacts']);
export const editorialLaneSchema = z.enum(['graphics_3d_4d', 'broader_vision', 'general_ai']);

export type SourceName = z.infer<typeof sourceNameSchema>;
export type ReviewDepth = z.infer<typeof reviewDepthSchema>;
export type EditorialLane = z.infer<typeof editorialLaneSchema>;

export type PublicLink = {
  kind: 'paper' | 'pdf' | 'project' | 'code' | 'dataset' | 'video' | 'source';
  label: string;
  url: string;
};

export type PaperRecord = {
  paper_id: string;
  external_ids: Array<{ kind: 'arxiv' | 'doi' | 'huggingface'; value: string }>;
  title: string;
  authors: string[];
  affiliations: string[];
  abstract: string;
  source_dates: Array<{ source: SourceName; date: string }>;
  links: PublicLink[];
  tags: string[];
  provenance: Array<{ field: string; url: string; checked_at: string }>;
};

export type ClaimProvenance = {
  field: 'verdict' | 'contribution' | 'why_it_matters' | 'evidence' | 'limitation' | 'editorial_note' | 'venue_context';
  urls: string[];
};

export type ReadFirstEntry = {
  paper_id: string;
  tier: 'read_first';
  lane: EditorialLane;
  review_depth: ReviewDepth;
  verdict: string;
  contribution: string;
  why_it_matters: string;
  evidence: string;
  limitation: string;
  venue_context?: string;
  claim_provenance: ClaimProvenance[];
  estimated_minutes: number;
};

export type WorthSkimmingEntry = {
  paper_id: string;
  tier: 'worth_skimming';
  lane: EditorialLane;
  review_depth: ReviewDepth;
  editorial_note: string;
  claim_provenance: ClaimProvenance[];
  estimated_minutes: number;
};

export type EditionRecord = {
  delivery_date: string;
  generated_at: string;
  coverage: Array<{ source: SourceName; dates: string[]; status: 'complete' | 'degraded'; detail?: string }>;
  editorial_theme?: string;
  entries: Array<ReadFirstEntry | WorthSkimmingEntry>;
  exceptional_length: boolean;
  validation_status: 'validated';
};

const nonEmptyText = z.string().trim().min(1);
const strictDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');
const safeHttpUrlSchema = z.string().refine((value) => {
  try {
    const { protocol } = new URL(value);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}, 'Expected an HTTP(S) URL');

function uniqueBy<T>(values: readonly T[], key: (value: T) => string): boolean {
  return new Set(values.map(key)).size === values.length;
}

const nonEmptyUniqueTextArray = z.array(nonEmptyText).min(1).refine(
  (values) => uniqueBy(values, (value) => value),
  'Values must be unique',
);

const externalIdSchema = z.object({
  kind: z.enum(['arxiv', 'doi', 'huggingface']),
  value: nonEmptyText,
}).strict();

const sourceDateSchema = z.object({
  source: sourceNameSchema,
  date: strictDateSchema,
}).strict();

export const publicLinkSchema = z.object({
  kind: z.enum(['paper', 'pdf', 'project', 'code', 'dataset', 'video', 'source']),
  label: nonEmptyText,
  url: safeHttpUrlSchema,
}).strict();

const provenanceSchema = z.object({
  field: nonEmptyText,
  url: safeHttpUrlSchema,
  checked_at: z.iso.datetime(),
}).strict();

export const paperRecordSchema = z.object({
  paper_id: z.uuid(),
  external_ids: z.array(externalIdSchema),
  title: nonEmptyText,
  authors: nonEmptyUniqueTextArray,
  affiliations: z.array(nonEmptyText),
  abstract: nonEmptyText,
  source_dates: z.array(sourceDateSchema).min(1).refine(
    (values) => uniqueBy(values, ({ source, date }) => `${source}:${date}`),
    'Source dates must be unique',
  ),
  links: z.array(publicLinkSchema).min(1)
    .refine((values) => uniqueBy(values, ({ kind }) => kind), 'Link kinds must be unique')
    .refine((values) => uniqueBy(values, ({ url }) => url), 'Link URLs must be unique')
    .refine((values) => values.some(({ kind }) => kind === 'paper'), 'A canonical paper link is required')
    .refine((values) => values.some(({ kind }) => kind === 'source'), 'A source link is required'),
  tags: nonEmptyUniqueTextArray,
  provenance: z.array(provenanceSchema).min(1).refine(
    (values) => uniqueBy(values, ({ field, url }) => `${field}:${url}`),
    'Provenance entries must be unique',
  ),
}).strict();

const claimFieldSchema = z.enum([
  'verdict',
  'contribution',
  'why_it_matters',
  'evidence',
  'limitation',
  'editorial_note',
  'venue_context',
]);

export const claimProvenanceSchema = z.object({
  field: claimFieldSchema,
  urls: z.array(safeHttpUrlSchema).min(1).refine(
    (urls) => uniqueBy(urls, (url) => url),
    'Claim provenance URLs must be unique',
  ),
}).strict();

const claimProvenanceArraySchema = z.array(claimProvenanceSchema).min(1).refine(
  (claims) => uniqueBy(claims, ({ field }) => field),
  'Claim provenance fields must be unique',
);

function hasClaimProvenance(
  claims: ClaimProvenance[],
  field: ClaimProvenance['field'],
): boolean {
  return claims.some((claim) => claim.field === field && claim.urls.length > 0);
}

const readFirstEntrySchema = z.object({
  paper_id: z.uuid(),
  tier: z.literal('read_first'),
  lane: editorialLaneSchema,
  review_depth: reviewDepthSchema,
  verdict: nonEmptyText,
  contribution: nonEmptyText,
  why_it_matters: nonEmptyText,
  evidence: nonEmptyText,
  limitation: nonEmptyText,
  venue_context: nonEmptyText.optional(),
  claim_provenance: claimProvenanceArraySchema,
  estimated_minutes: z.number().positive(),
}).strict().superRefine((entry, ctx) => {
  for (const field of ['verdict', 'contribution', 'why_it_matters', 'evidence', 'limitation'] as const) {
    if (!hasClaimProvenance(entry.claim_provenance, field)) {
      ctx.addIssue({ code: 'custom', path: ['claim_provenance'], message: `${field} requires claim provenance` });
    }
  }
  if (entry.venue_context && !hasClaimProvenance(entry.claim_provenance, 'venue_context')) {
    ctx.addIssue({ code: 'custom', path: ['claim_provenance'], message: 'venue_context requires claim provenance' });
  }
});

function sentenceCount(value: string): number {
  return value.trim().match(/[.!?]+(?=\s|$)/g)?.length ?? 0;
}

const worthSkimmingEntrySchema = z.object({
  paper_id: z.uuid(),
  tier: z.literal('worth_skimming'),
  lane: editorialLaneSchema,
  review_depth: reviewDepthSchema,
  editorial_note: nonEmptyText.refine(
    (value) => {
      const count = sentenceCount(value);
      return count >= 2 && count <= 4;
    },
    'Editorial note must contain 2-4 sentences',
  ),
  claim_provenance: claimProvenanceArraySchema,
  estimated_minutes: z.number().positive(),
}).strict().superRefine((entry, ctx) => {
  if (!hasClaimProvenance(entry.claim_provenance, 'editorial_note')) {
    ctx.addIssue({ code: 'custom', path: ['claim_provenance'], message: 'editorial_note requires claim provenance' });
  }
});

const coverageSchema = z.object({
  source: sourceNameSchema,
  dates: z.array(strictDateSchema).min(1).refine(
    (dates) => uniqueBy(dates, (date) => date),
    'Coverage dates must be unique',
  ),
  status: z.enum(['complete', 'degraded']),
  detail: nonEmptyText.optional(),
}).strict();

export const editionRecordSchema = z.object({
  delivery_date: strictDateSchema,
  generated_at: z.iso.datetime(),
  coverage: z.array(coverageSchema).min(1).refine(
    (coverage) => uniqueBy(coverage, ({ source }) => source),
    'Coverage sources must be unique',
  ),
  editorial_theme: nonEmptyText.optional(),
  entries: z.array(z.discriminatedUnion('tier', [readFirstEntrySchema, worthSkimmingEntrySchema])).min(1),
  exceptional_length: z.boolean(),
  validation_status: z.literal('validated'),
}).strict().superRefine((edition, ctx) => {
  const totalMinutes = edition.entries.reduce((total, entry) => total + entry.estimated_minutes, 0);
  if (edition.exceptional_length !== (totalMinutes > 20)) {
    ctx.addIssue({
      code: 'custom',
      path: ['exceptional_length'],
      message: 'exceptional_length must be true exactly when total estimated minutes exceed 20',
    });
  }
});
