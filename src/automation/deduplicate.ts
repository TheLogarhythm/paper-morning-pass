import { createHash } from 'node:crypto';
import { candidateRecordSchema, type CandidateRecord } from './contracts';

type ExternalId = CandidateRecord['external_ids'][number];

function normalizedAlias({ kind, value }: ExternalId): string {
  const normalized = kind === 'arxiv' ? value.replace(/v\d+$/i, '') : value.toLowerCase();
  return `${kind}:${normalized}`;
}

function canonicalAlias(externalIds: readonly ExternalId[]): string {
  const priorities = { arxiv: 0, doi: 1, huggingface: 2 } as const;
  const aliases = externalIds
    .map((externalId) => ({ alias: normalizedAlias(externalId), priority: priorities[externalId.kind] }))
    .sort((left, right) => left.priority - right.priority || left.alias.localeCompare(right.alias));
  if (!aliases[0]) throw new Error('A candidate requires at least one external ID.');
  return aliases[0].alias;
}

export function stableCandidateKey(externalIds: readonly ExternalId[]): string {
  const hex = createHash('sha256').update(canonicalAlias(externalIds)).digest('hex').slice(0, 32).split('');
  hex[12] = '5';
  hex[16] = ((Number.parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8).join('')}-${hex.slice(8, 12).join('')}-${hex.slice(12, 16).join('')}-${hex.slice(16, 20).join('')}-${hex.slice(20).join('')}`;
}

function uniqueBy<T>(values: readonly T[], key: (value: T) => string): T[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const candidate = key(value);
    if (seen.has(candidate)) return false;
    seen.add(candidate);
    return true;
  });
}

export function mergeCandidates(inputs: readonly CandidateRecord[]): CandidateRecord[] {
  const candidates = candidateRecordSchema.array().parse(inputs);
  const aliasToIndex = new Map<string, number>();
  const merged: CandidateRecord[] = [];

  for (const candidate of candidates) {
    const aliases = candidate.external_ids.map(normalizedAlias);
    const existingIndex = aliases.map((alias) => aliasToIndex.get(alias)).find((index) => index !== undefined);
    if (existingIndex === undefined) {
      const next = structuredClone(candidate);
      next.candidate_key = stableCandidateKey(next.external_ids);
      const index = merged.push(next) - 1;
      aliases.forEach((alias) => aliasToIndex.set(alias, index));
      continue;
    }

    const existing = merged[existingIndex];
    existing.external_ids = uniqueBy([...existing.external_ids, ...candidate.external_ids], normalizedAlias);
    existing.source_dates = uniqueBy(
      [...existing.source_dates, ...candidate.source_dates],
      ({ source, date }) => `${source}:${date}`,
    ).sort((left, right) => left.source.localeCompare(right.source) || left.date.localeCompare(right.date));
    existing.links = uniqueBy([...existing.links, ...candidate.links], ({ url }) => url);
    existing.subjects = uniqueBy([...existing.subjects, ...candidate.subjects], (value) => value);
    if (!existing.abstract && candidate.abstract) existing.abstract = candidate.abstract;
    existing.candidate_key = stableCandidateKey(existing.external_ids);
    for (const alias of existing.external_ids.map(normalizedAlias)) aliasToIndex.set(alias, existingIndex);
  }

  return candidateRecordSchema.array().parse(merged);
}
