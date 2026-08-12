import {
  automationStateSchema,
  preparedSourceResultSchema,
  sourceNames,
  sourceObservationSchema,
  type AutomationState,
  type PreparedSourceResult,
  type SourceObservation,
} from './contracts';

const DAY_MS = 24 * 60 * 60 * 1000;

function dateValue(date: string): number {
  const value = Date.parse(`${date}T00:00:00.000Z`);
  if (!Number.isFinite(value)) throw new Error('Expected a valid calendar date.');
  return value;
}

function isoDate(value: number): string {
  return new Date(value).toISOString().slice(0, 10);
}

export function unprocessedDates(processedThrough: string, deliveryDate: string): string[] {
  const processed = dateValue(processedThrough);
  const delivery = dateValue(deliveryDate);
  if (processed >= delivery) {
    throw new Error('The source watermark must be before delivery.');
  }

  const dates: string[] = [];
  for (let value = processed + DAY_MS; value < delivery; value += DAY_MS) {
    dates.push(isoDate(value));
  }
  return dates;
}

function median(values: readonly number[]): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

export function assessSourceObservation(input: SourceObservation): { status: 'complete' | 'degraded'; detail?: string } {
  const observation = sourceObservationSchema.parse(input);
  if (!observation.structural_valid) {
    return { status: 'degraded', detail: 'The source response was malformed or structurally invalid.' };
  }

  const observed = new Set(observation.observed_dates);
  const missing = observation.expected_dates.filter((date) => !observed.has(date));
  if (missing.length > 0) {
    return { status: 'degraded', detail: 'The source response was missing a requested date.' };
  }

  if (observation.record_count === 0 && !observation.corroborated_empty) {
    return { status: 'degraded', detail: 'An empty response was not independently corroborated.' };
  }

  const typicalCount = median(observation.recent_counts);
  const lowThreshold = typicalCount === undefined ? undefined : typicalCount * 0.2;
  if (
    observation.record_count > 0
    && typicalCount !== undefined
    && lowThreshold !== undefined
    && typicalCount >= 5
    && observation.record_count < lowThreshold
    && !observation.corroborated_low_count
  ) {
    return { status: 'degraded', detail: 'The source returned an unusually low record count.' };
  }

  return { status: 'complete' };
}

function validateSourceSet(results: readonly PreparedSourceResult[]): PreparedSourceResult[] {
  const parsed = preparedSourceResultSchema.array().parse(results);
  const actual = [...new Set(parsed.map(({ source }) => source))].sort();
  const expected = [...sourceNames].sort();
  if (actual.length !== expected.length || actual.some((source, index) => source !== expected[index])) {
    throw new Error('A run requires exactly one result for all three approved sources.');
  }
  return parsed;
}

export function decidePublication(
  results: readonly PreparedSourceResult[],
): 'complete' | 'partial' | 'all_failed' {
  const parsed = validateSourceSet(results);
  const completeCount = parsed.filter(({ status }) => status === 'complete').length;
  if (completeCount === parsed.length) return 'complete';
  if (completeCount === 0) return 'all_failed';
  return 'partial';
}

export function advanceSuccessfulWatermarks(
  stateInput: AutomationState,
  results: readonly PreparedSourceResult[],
): AutomationState {
  const state = automationStateSchema.parse(structuredClone(stateInput));
  const parsed = validateSourceSet(results);

  for (const result of parsed) {
    if (result.status !== 'complete') continue;
    const latestDate = [...result.requested_dates].sort().at(-1);
    if (!latestDate) continue;
    const current = state.sources[result.source];
    current.processed_through = latestDate;
    current.recent_counts = [
      ...current.recent_counts,
      { date: latestDate, count: result.record_count },
    ].slice(-14);
  }

  return automationStateSchema.parse(state);
}
