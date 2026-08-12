import { z } from 'zod';
import { sourceNameSchema, type SourceName } from '../schemas/content';

const strictDate = z.iso.date();

export const sourceNames = ['arxiv_cs_cv', 'arxiv_cs_gr', 'huggingface_papers'] as const satisfies readonly SourceName[];

export const automationSourceStateSchema = z.object({
  processed_through: strictDate,
  recent_counts: z.array(z.object({
    date: strictDate,
    count: z.number().int().nonnegative(),
  }).strict()).max(14),
}).strict();

export const automationStateSchema = z.object({
  schema_version: z.literal(1),
  sources: z.object({
    arxiv_cs_cv: automationSourceStateSchema,
    arxiv_cs_gr: automationSourceStateSchema,
    huggingface_papers: automationSourceStateSchema,
  }).strict(),
}).strict();

export type AutomationState = z.infer<typeof automationStateSchema>;

export const candidateExternalIdSchema = z.object({
  kind: z.enum(['arxiv', 'doi', 'huggingface']),
  value: z.string().trim().min(1),
}).strict();

export const candidateRecordSchema = z.object({
  candidate_key: z.string().trim().min(1),
  external_ids: z.array(candidateExternalIdSchema).min(1),
  title: z.string().trim().min(1),
  authors: z.array(z.string().trim().min(1)).min(1),
  abstract: z.string().trim().min(1).optional(),
  subjects: z.array(z.string().trim().min(1)),
  source_dates: z.array(z.object({
    source: sourceNameSchema,
    date: strictDate,
  }).strict()).min(1),
  links: z.array(z.object({
    kind: z.enum(['paper', 'pdf', 'source', 'project', 'code']),
    url: z.url(),
  }).strict()).min(1),
}).strict();

export type CandidateRecord = z.infer<typeof candidateRecordSchema>;

export const parsedSourcePayloadSchema = z.object({
  structural_valid: z.boolean(),
  observed_dates: z.array(strictDate),
  record_count: z.number().int().nonnegative(),
  corroborated_empty: z.boolean(),
  corroborated_low_count: z.boolean(),
  candidates: z.array(candidateRecordSchema),
  detail: z.string().trim().min(1).optional(),
}).strict();

export type ParsedSourcePayload = z.infer<typeof parsedSourcePayloadSchema>;

export const sourceAttemptSchema = z.object({
  attempted_at: z.iso.datetime(),
  outcome: z.enum(['complete', 'degraded']),
  detail: z.string().trim().min(1).optional(),
}).strict();

export const preparedSourceResultSchema = z.object({
  source: sourceNameSchema,
  requested_dates: z.array(strictDate),
  status: z.enum(['complete', 'degraded']),
  record_count: z.number().int().nonnegative(),
  attempts: z.array(sourceAttemptSchema),
  candidates: z.array(candidateRecordSchema),
  detail: z.string().trim().min(1).optional(),
}).strict().superRefine((result, ctx) => {
  if (result.requested_dates.length === 0) {
    if (result.status !== 'complete' || result.attempts.length !== 0 || result.record_count !== 0 || result.candidates.length !== 0) {
      ctx.addIssue({
        code: 'custom',
        message: 'An already-processed source must be complete with no attempts, records, or candidates.',
      });
    }
  } else if (result.attempts.length === 0) {
    ctx.addIssue({ code: 'custom', path: ['attempts'], message: 'A requested source requires at least one attempt.' });
  }
});

export type PreparedSourceResult = z.infer<typeof preparedSourceResultSchema>;

export const preparedRunSchema = z.object({
  delivery_date: strictDate,
  prepared_at: z.iso.datetime(),
  publication_decision: z.enum(['complete', 'partial', 'all_failed']),
  sources: z.array(preparedSourceResultSchema).length(3),
  candidates: z.array(candidateRecordSchema),
}).strict();

export type PreparedRun = z.infer<typeof preparedRunSchema>;

export const sourceObservationSchema = z.object({
  expected_dates: z.array(strictDate).min(1),
  observed_dates: z.array(strictDate),
  structural_valid: z.boolean(),
  record_count: z.number().int().nonnegative(),
  recent_counts: z.array(z.number().int().nonnegative()),
  corroborated_empty: z.boolean(),
  corroborated_low_count: z.boolean(),
}).strict();

export type SourceObservation = z.infer<typeof sourceObservationSchema>;
