import { load } from 'cheerio';
import type { SourceName } from '../schemas/content';
import { parsedSourcePayloadSchema, type CandidateRecord, type ParsedSourcePayload } from './contracts';
import { stableCandidateKey } from './deduplicate';

function headingDate(value: string): string | undefined {
  const match = value.match(/(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun),\s+(\d{1,2})\s+([A-Z][a-z]{2})\s+(\d{4})/);
  if (!match) return undefined;
  const parsed = Date.parse(`${match[2]} ${match[1]}, ${match[3]} UTC`);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString().slice(0, 10) : undefined;
}

export function parseArxivRecent(
  html: string,
  source: Extract<SourceName, 'arxiv_cs_cv' | 'arxiv_cs_gr'>,
  requestedDates: readonly string[],
): ParsedSourcePayload {
  try {
    const $ = load(html);
    const articles = $('#articles');
    if (articles.length === 0 || articles.find('h3').length === 0) {
      return parsedSourcePayloadSchema.parse({
        structural_valid: false,
        observed_dates: [],
        record_count: 0,
        corroborated_empty: false,
        corroborated_low_count: false,
        candidates: [],
        detail: 'The arXiv response did not contain the expected dated article list.',
      });
    }

    const requested = new Set(requestedDates);
    const observedDates = new Set<string>();
    const candidates: CandidateRecord[] = [];
    let currentDate: string | undefined;
    let pendingId: string | undefined;

    articles.children('h3, dt, dd').each((_index, element) => {
      const tag = element.tagName.toLowerCase();
      if (tag === 'h3') {
        currentDate = headingDate($(element).text());
        if (currentDate && requested.has(currentDate)) observedDates.add(currentDate);
        pendingId = undefined;
        return;
      }
      if (!currentDate || !requested.has(currentDate)) return;
      if (tag === 'dt') {
        pendingId = $(element).find('a[title="Abstract"]').first().attr('id')?.replace(/v\d+$/i, '');
        return;
      }
      if (tag !== 'dd' || !pendingId) return;

      const metadata = $(element);
      const title = metadata.find('.list-title').text().replace(/^\s*Title:\s*/i, '').replace(/\s+/g, ' ').trim();
      const authors = metadata.find('.list-authors a').map((_authorIndex, author) => $(author).text().trim()).get();
      const subjectsText = metadata.find('.list-subjects').text().replace(/^\s*Subjects:\s*/i, '').replace(/\s+/g, ' ').trim();
      const externalIds = [{ kind: 'arxiv' as const, value: pendingId }];
      if (title && authors.length > 0) {
        candidates.push({
          candidate_key: stableCandidateKey(externalIds),
          external_ids: externalIds,
          title,
          authors,
          subjects: subjectsText ? subjectsText.split(';').map((value) => value.trim()) : [],
          source_dates: [{ source, date: currentDate }],
          links: [
            { kind: 'paper', url: `https://arxiv.org/abs/${pendingId}` },
            { kind: 'pdf', url: `https://arxiv.org/pdf/${pendingId}` },
            { kind: 'source', url: `https://arxiv.org/list/${source === 'arxiv_cs_cv' ? 'cs.CV' : 'cs.GR'}/recent` },
          ],
        });
      }
      pendingId = undefined;
    });

    return parsedSourcePayloadSchema.parse({
      structural_valid: true,
      observed_dates: [...observedDates].sort(),
      record_count: candidates.length,
      corroborated_empty: observedDates.size === requestedDates.length && candidates.length === 0,
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
      detail: 'The arXiv response could not be parsed.',
    });
  }
}
