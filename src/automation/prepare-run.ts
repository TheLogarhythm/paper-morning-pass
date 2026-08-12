import {
  parsedSourcePayloadSchema,
  preparedRunSchema,
  sourceNames,
  type AutomationState,
  type ParsedSourcePayload,
  type PreparedRun,
  type PreparedSourceResult,
} from './contracts';
import { mergeCandidates } from './deduplicate';
import { assessSourceObservation, decidePublication, unprocessedDates } from './policy';

export type SourceLoader = (
  source: typeof sourceNames[number],
  requestedDates: string[],
) => Promise<ParsedSourcePayload>;

type PrepareRunOptions = {
  deliveryDate: string;
  state: AutomationState;
  loader: SourceLoader;
  retryDelaysMs: number[];
  sleep: (milliseconds: number) => Promise<void>;
  now: () => string;
};

type MutableSource = {
  source: typeof sourceNames[number];
  requestedDates: string[];
  payload?: ParsedSourcePayload;
  attempts: PreparedSourceResult['attempts'];
  status: 'complete' | 'degraded';
  detail?: string;
};

export async function prepareRun(options: PrepareRunOptions): Promise<PreparedRun> {
  const mutable: MutableSource[] = sourceNames.map((source) => ({
    source,
    requestedDates: unprocessedDates(options.state.sources[source].processed_through, options.deliveryDate),
    attempts: [],
    status: 'complete',
  }));

  const attempt = async (item: MutableSource): Promise<void> => {
    const payload = parsedSourcePayloadSchema.parse(await options.loader(item.source, item.requestedDates));
    const assessment = assessSourceObservation({
      expected_dates: item.requestedDates,
      observed_dates: payload.observed_dates,
      structural_valid: payload.structural_valid,
      record_count: payload.record_count,
      recent_counts: options.state.sources[item.source].recent_counts.map(({ count }) => count),
      corroborated_empty: payload.corroborated_empty,
      corroborated_low_count: payload.corroborated_low_count,
    });
    item.payload = payload;
    item.status = assessment.status;
    item.detail = assessment.detail ?? payload.detail;
    item.attempts.push({
      attempted_at: options.now(),
      outcome: assessment.status,
      ...(item.detail ? { detail: item.detail } : {}),
    });
  };

  await Promise.all(mutable.filter(({ requestedDates }) => requestedDates.length > 0).map(attempt));
  for (const delay of options.retryDelaysMs) {
    const degraded = mutable.filter(({ status }) => status === 'degraded');
    if (degraded.length === 0) break;
    await options.sleep(delay);
    await Promise.all(degraded.map(attempt));
  }

  const sources: PreparedSourceResult[] = mutable.map((item) => ({
    source: item.source,
    requested_dates: item.requestedDates,
    status: item.status,
    record_count: item.payload?.record_count ?? 0,
    attempts: item.attempts,
    candidates: item.payload?.candidates ?? [],
    ...(item.detail ? { detail: item.detail } : {}),
  }));
  return preparedRunSchema.parse({
    delivery_date: options.deliveryDate,
    prepared_at: options.now(),
    publication_decision: decidePublication(sources),
    sources,
    candidates: mergeCandidates(sources.flatMap(({ candidates }) => candidates)),
  });
}
