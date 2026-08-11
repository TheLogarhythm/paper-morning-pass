import { loadContentRepositoryFromFileSystem } from './content-repository';

type ContentValidationCommandOptions = {
  dataDirectory?: URL;
  writeOutput?: (line: string) => void;
  writeError?: (line: string) => void;
};

export async function runContentValidation({
  dataDirectory,
  writeOutput = console.log,
  writeError = console.error,
}: ContentValidationCommandOptions = {}): Promise<0 | 1> {
  try {
    const repository = await loadContentRepositoryFromFileSystem(dataDirectory);
    const paperCount = repository.papersById.size;
    const editionCount = repository.editions.length;
    const paperLabel = paperCount === 1 ? 'paper' : 'papers';
    const editionLabel = editionCount === 1 ? 'edition' : 'editions';
    writeOutput(`Validated ${paperCount} ${paperLabel} and ${editionCount} ${editionLabel}; latest delivery date ${repository.latest.delivery_date}.`);
    return 0;
  } catch (error) {
    const safeMessage = error instanceof Error
      && error.message.startsWith('Content repository validation failed:')
      ? error.message
      : 'Content repository validation failed.';
    writeError(safeMessage);
    return 1;
  }
}
