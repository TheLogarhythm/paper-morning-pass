import { parsedSourcePayloadSchema, type CandidateRecord, type ParsedSourcePayload } from './contracts';
import { stableCandidateKey } from './deduplicate';

type JsonRecord = Record<string, unknown>;

function object(value: unknown): JsonRecord | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as JsonRecord : undefined;
}

export function parseHuggingFaceDaily(payload: unknown, requestedDates: readonly string[]): ParsedSourcePayload {
  if (!Array.isArray(payload)) {
    return parsedSourcePayloadSchema.parse({
      structural_valid: false,
      observed_dates: [],
      record_count: 0,
      corroborated_empty: false,
      corroborated_low_count: false,
      candidates: [],
      detail: 'The Hugging Face response was not an array of Daily Papers records.',
    });
  }

  try {
    const requested = new Set(requestedDates);
    const candidates: CandidateRecord[] = [];
    for (const entryValue of payload) {
      const entry = object(entryValue);
      const paper = object(entry?.paper);
      const id = typeof paper?.id === 'string' ? paper.id.replace(/v\d+$/i, '') : undefined;
      const submitted = typeof paper?.submittedOnDailyAt === 'string' ? paper.submittedOnDailyAt.slice(0, 10) : undefined;
      const title = typeof paper?.title === 'string' ? paper.title.trim() : undefined;
      const summary = typeof paper?.summary === 'string'
        ? paper.summary.trim()
        : typeof entry?.summary === 'string' ? entry.summary.trim() : undefined;
      const authors = Array.isArray(paper?.authors)
        ? paper.authors.flatMap((author) => {
          const name = object(author)?.name;
          return typeof name === 'string' && name.trim() ? [name.trim()] : [];
        })
        : [];
      if (!id || !submitted || !title || authors.length === 0 || !requested.has(submitted)) {
        throw new Error('Invalid Daily Papers record');
      }
      const externalIds = [
        { kind: 'arxiv' as const, value: id },
        { kind: 'huggingface' as const, value: id },
      ];
      const links: CandidateRecord['links'] = [
        { kind: 'paper', url: `https://huggingface.co/papers/${id}` },
        { kind: 'source', url: `https://huggingface.co/papers?date=${submitted}` },
      ];
      const githubRepo = paper?.githubRepo;
      if (typeof githubRepo === 'string' && githubRepo.startsWith('https://')) {
        links.push({ kind: 'code', url: githubRepo });
      }
      candidates.push({
        candidate_key: stableCandidateKey(externalIds),
        external_ids: externalIds,
        title,
        authors,
        ...(summary ? { abstract: summary } : {}),
        subjects: [],
        source_dates: [{ source: 'huggingface_papers', date: submitted }],
        links,
      });
    }

    return parsedSourcePayloadSchema.parse({
      structural_valid: true,
      observed_dates: [...requested].sort(),
      record_count: candidates.length,
      corroborated_empty: candidates.length === 0,
      corroborated_low_count: false,
      candidates,
    });
  } catch {
    return parsedSourcePayloadSchema.parse({
      structural_valid: false,
      observed_dates: [],
      record_count: 0,
      corroborated_empty: false,
      corroborated_low_count: false,
      candidates: [],
      detail: 'The Hugging Face Daily Papers response contained malformed records.',
    });
  }
}
