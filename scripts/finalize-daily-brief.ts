import { readFile, rename, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { finalizeRun, type EditorialDraft } from '../src/automation/finalize-run';
import { automationStateSchema, preparedRunSchema } from '../src/automation/contracts';
import { editionRecordSchema, paperRecordSchema, type EditionRecord } from '../src/schemas/content';

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function optionalEdition(path: string): Promise<EditionRecord | undefined> {
  try {
    return editionRecordSchema.parse(await readJson(path));
  } catch (error) {
    const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
    if (code === 'ENOENT') return undefined;
    throw error;
  }
}

async function stageJson(path: string, value: unknown): Promise<string> {
  const temporaryPath = `${path}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  return temporaryPath;
}

async function main(): Promise<void> {
  const deliveryDate = argument('--delivery-date');
  if (!deliveryDate) throw new Error('Usage: npm run daily:finalize -- --delivery-date YYYY-MM-DD [--draft path]');

  const root = resolve(import.meta.dirname, '..');
  const runDirectory = resolve(root, '.paper-morning-pass', 'runs', deliveryDate);
  const preparedPath = resolve(runDirectory, 'candidates.json');
  const draftPath = resolve(root, argument('--draft') ?? resolve(runDirectory, 'draft.json'));
  const statePath = resolve(root, 'automation', 'state.json');
  const papersPath = resolve(root, 'src', 'data', 'papers', 'index.json');
  const editionPath = resolve(root, 'src', 'data', 'editions', `${deliveryDate}.json`);
  const markdownPath = resolve(root, 'content', 'editions', `${deliveryDate}.md`);

  const prepared = preparedRunSchema.parse(await readJson(preparedPath));
  if (prepared.delivery_date !== deliveryDate) throw new Error('Prepared manifest delivery date does not match the command.');
  const draft = await readJson(draftPath) as EditorialDraft;
  const state = automationStateSchema.parse(await readJson(statePath));
  const existingPapers = paperRecordSchema.array().parse(await readJson(papersPath));
  const existingEdition = await optionalEdition(editionPath);
  const finalized = finalizeRun({ prepared, draft, state, existingPapers, existingEdition });

  const summary = {
    delivery_date: finalized.edition.delivery_date,
    publication_status: finalized.edition.publication_status,
    selected_papers: finalized.edition.entries.length,
    degraded_sources: finalized.edition.coverage.filter(({ status }) => status === 'degraded').map(({ source }) => source),
    changed: finalized.changed,
  };
  if (process.argv.includes('--check')) {
    process.stdout.write(`${JSON.stringify({ ...summary, mode: 'check' }, null, 2)}\n`);
    return;
  }
  if (!finalized.changed) {
    process.stdout.write(`${JSON.stringify({ ...summary, mode: 'no-change' }, null, 2)}\n`);
    return;
  }

  const staged = await Promise.all([
    stageJson(papersPath, finalized.papers),
    stageJson(editionPath, finalized.edition),
    stageJson(statePath, finalized.state),
    (async () => {
      const path = `${markdownPath}.tmp`;
      await writeFile(path, finalized.markdown, 'utf8');
      return path;
    })(),
  ]);
  for (const [temporaryPath, targetPath] of staged.map((path, index) => [path, [papersPath, editionPath, statePath, markdownPath][index]] as const)) {
    await rename(temporaryPath, targetPath);
  }

  process.stdout.write(`${JSON.stringify({ ...summary, mode: 'write' }, null, 2)}\n`);
}

await main();
