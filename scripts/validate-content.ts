import { loadContentRepositoryFromFileSystem } from '../src/lib/content-repository';

try {
  const repository = await loadContentRepositoryFromFileSystem();
  const paperCount = repository.papersById.size;
  const editionCount = repository.editions.length;
  const paperLabel = paperCount === 1 ? 'paper' : 'papers';
  const editionLabel = editionCount === 1 ? 'edition' : 'editions';
  console.log(`Validated ${paperCount} ${paperLabel} and ${editionCount} ${editionLabel}; latest delivery date ${repository.latest.delivery_date}.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Content repository validation failed');
  process.exitCode = 1;
}
