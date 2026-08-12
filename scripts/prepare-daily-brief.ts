import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseArxivRecent } from '../src/automation/arxiv-source';
import {
  automationStateSchema,
  parsedSourcePayloadSchema,
  type ParsedSourcePayload,
} from '../src/automation/contracts';
import { parseHuggingFaceDaily } from '../src/automation/huggingface-source';
import { prepareRun, type SourceLoader } from '../src/automation/prepare-run';

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function degraded(detail: string): ParsedSourcePayload {
  return parsedSourcePayloadSchema.parse({
    structural_valid: false,
    observed_dates: [],
    record_count: 0,
    corroborated_empty: false,
    corroborated_low_count: false,
    candidates: [],
    detail,
  });
}

async function publicFetch(url: string): Promise<Response> {
  return fetch(url, {
    headers: {
      'User-Agent': 'PaperMorningPass/0.1 (+https://github.com/TheLogarhythm/paper-morning-pass)',
      Accept: 'application/json, text/html;q=0.9',
    },
  });
}

const loader: SourceLoader = async (source, requestedDates) => {
  try {
    if (source === 'arxiv_cs_cv' || source === 'arxiv_cs_gr') {
      const category = source === 'arxiv_cs_cv' ? 'cs.CV' : 'cs.GR';
      const response = await publicFetch(`https://arxiv.org/list/${category}/recent?skip=0&show=2000`);
      if (!response.ok) return degraded('The arXiv source request failed.');
      return parseArxivRecent(await response.text(), source, requestedDates);
    }

    const payloads: ParsedSourcePayload[] = [];
    for (const date of requestedDates) {
      const url = new URL('https://huggingface.co/api/daily_papers');
      url.searchParams.set('p', '0');
      url.searchParams.set('limit', '100');
      url.searchParams.set('date', date);
      url.searchParams.set('sort', 'publishedAt');
      const response = await publicFetch(url.toString());
      if (!response.ok) return degraded('The Hugging Face Daily Papers request failed.');
      payloads.push(parseHuggingFaceDaily(await response.json(), [date]));
    }
    if (payloads.some(({ structural_valid }) => !structural_valid)) {
      return degraded('One or more Hugging Face Daily Papers responses were malformed.');
    }
    const candidates = payloads.flatMap(({ candidates }) => candidates);
    return parsedSourcePayloadSchema.parse({
      structural_valid: true,
      observed_dates: payloads.flatMap(({ observed_dates }) => observed_dates),
      record_count: candidates.length,
      corroborated_empty: candidates.length === 0 && payloads.every(({ corroborated_empty }) => corroborated_empty),
      corroborated_low_count: false,
      candidates,
    });
  } catch {
    return degraded('The source request or response processing failed.');
  }
};

async function main(): Promise<void> {
  const deliveryDate = argument('--delivery-date');
  if (!deliveryDate) throw new Error('Usage: npm run daily:prepare -- --delivery-date YYYY-MM-DD [--retry-delays-ms 120000,480000]');
  const retryDelays = (argument('--retry-delays-ms') ?? '120000,480000')
    .split(',')
    .filter(Boolean)
    .map((value) => Number.parseInt(value, 10));
  if (retryDelays.some((value) => !Number.isInteger(value) || value < 0)) {
    throw new Error('Retry delays must be comma-separated non-negative integers.');
  }

  const repositoryRoot = resolve(import.meta.dirname, '..');
  const state = automationStateSchema.parse(JSON.parse(
    await readFile(resolve(repositoryRoot, 'automation/state.json'), 'utf8'),
  ));
  const run = await prepareRun({
    deliveryDate,
    state,
    loader,
    retryDelaysMs: retryDelays,
    sleep: (milliseconds) => new Promise((resolveSleep) => setTimeout(resolveSleep, milliseconds)),
    now: () => new Date().toISOString(),
  });
  const outputDirectory = resolve(repositoryRoot, '.paper-morning-pass', 'runs', deliveryDate);
  await mkdir(outputDirectory, { recursive: true });
  const outputPath = resolve(outputDirectory, 'candidates.json');
  await writeFile(outputPath, `${JSON.stringify(run, null, 2)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify({
    delivery_date: run.delivery_date,
    publication_decision: run.publication_decision,
    sources: run.sources.map(({ source, status, record_count, attempts }) => ({
      source,
      status,
      record_count,
      attempts: attempts.length,
    })),
    candidates: run.candidates.length,
    output: outputPath,
  }, null, 2)}\n`);
}

await main();
