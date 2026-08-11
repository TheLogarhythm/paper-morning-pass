import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  buildContentRepository,
  buildContentRepositoryFromViteModules,
  loadContentRepositoryFromFileSystem,
} from '../../src/lib/content-repository';
import { validEditionRecord, validPaperRecord } from '../fixtures/content';

function clone<T>(value: T): T {
  return structuredClone(value);
}

describe('content repository', () => {
  it('indexes papers by immutable ID and sorts editions newest first', () => {
    const earlierEdition = clone(validEditionRecord);
    earlierEdition.delivery_date = '2026-08-09';

    const repository = buildContentRepository([validPaperRecord], [earlierEdition, validEditionRecord]);

    expect(repository.papersById.get(validPaperRecord.paper_id)).toMatchObject({ title: validPaperRecord.title });
    expect(repository.editions.map((edition) => edition.delivery_date)).toEqual(['2026-08-10', '2026-08-09']);
    expect(repository.latest.delivery_date).toBe('2026-08-10');
  });

  it('rejects duplicate paper IDs', () => {
    expect(() => buildContentRepository([validPaperRecord, clone(validPaperRecord)], [validEditionRecord]))
      .toThrow(/duplicate paper_id/i);
  });

  it('rejects duplicate normalized external-ID aliases across papers', () => {
    const secondPaper = clone(validPaperRecord);
    secondPaper.paper_id = '018f4a90-6d31-7b2c-9dd3-7e12c8b77211';
    secondPaper.external_ids = [{ kind: 'doi', value: '10.1000/CaseSensitive' }];
    const firstPaper = clone(validPaperRecord);
    firstPaper.external_ids = [{ kind: 'doi', value: '10.1000/casesensitive' }];

    expect(() => buildContentRepository([firstPaper, secondPaper], [validEditionRecord]))
      .toThrow(/duplicate external-ID alias: doi:10\.1000\/casesensitive/i);
  });

  it('rejects unresolved edition references', () => {
    const edition = clone(validEditionRecord);
    edition.entries[0].paper_id = '018f4a90-6d31-7b2c-9dd3-7e12c8b77211';

    expect(() => buildContentRepository([validPaperRecord], [edition]))
      .toThrow(/unknown paper/i);
  });

  it('allows one paper in multiple editions without changing its identity', () => {
    const earlierEdition = clone(validEditionRecord);
    earlierEdition.delivery_date = '2026-08-09';
    const repository = buildContentRepository([validPaperRecord], [validEditionRecord, earlierEdition]);

    expect(repository.editions).toHaveLength(2);
    expect(repository.editions.every((edition) => edition.entries[0].paper_id === validPaperRecord.paper_id)).toBe(true);
    expect(repository.papersById).toHaveLength(1);
  });

  it('rejects duplicate delivery dates', () => {
    expect(() => buildContentRepository([validPaperRecord], [validEditionRecord, clone(validEditionRecord)]))
      .toThrow(/duplicate delivery_date/i);
  });

  it('has stable canonical JSON serialization across repeated builds', () => {
    const papers = [clone(validPaperRecord)];
    const editions = [clone(validEditionRecord)];
    const serialize = () => {
      const repository = buildContentRepository(papers, editions);
      return JSON.stringify({
        papers: [...repository.papersById.values()],
        editions: repository.editions,
      });
    };

    expect(serialize()).toBe(serialize());
  });

  it('loads the canonical repository through the Node filesystem adapter', async () => {
    const repository = await loadContentRepositoryFromFileSystem();

    expect(repository.papersById.size).toBe(1);
    expect(repository.latest.delivery_date).toBe('2026-08-10');
  });

  it('aggregates filesystem, alias, date, and reference errors from a fixture directory', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'content-repository-'));
    await mkdir(join(directory, 'papers'));
    await mkdir(join(directory, 'editions'));
    const duplicateAliasPaper = clone(validPaperRecord);
    duplicateAliasPaper.paper_id = '018f4a90-6d31-7b2c-9dd3-7e12c8b77211';
    const unresolvedEdition = clone(validEditionRecord);
    unresolvedEdition.entries[0].paper_id = '018f4a90-6d31-7b2c-9dd3-7e12c8b77212';

    try {
      await writeFile(join(directory, 'papers', 'index.json'), JSON.stringify([validPaperRecord, duplicateAliasPaper]));
      await writeFile(join(directory, 'editions', 'broken.json'), '{not JSON');
      await writeFile(join(directory, 'editions', 'first.json'), JSON.stringify(validEditionRecord));
      await writeFile(join(directory, 'editions', 'second.json'), JSON.stringify(unresolvedEdition));

      const error = await loadContentRepositoryFromFileSystem(pathToFileURL(`${directory}/`)).catch((reason: unknown) => reason);
      expect(error).toBeInstanceOf(Error);
      const message = (error as Error).message;
      expect(message).toContain('src/data/editions/broken.json: invalid JSON');
      expect(message).toContain('Duplicate external-ID alias');
      expect(message).toContain('Duplicate delivery_date: 2026-08-10');
      expect(message).toContain('unknown paper');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('aggregates every invalid provenance URL in one entry', () => {
    const edition = clone(validEditionRecord);
    edition.entries[0].claim_provenance[0].urls = [
      'https://unrelated.example/one',
      'https://unrelated.example/two',
    ];

    const error = (() => {
      try {
        buildContentRepository([validPaperRecord], [edition]);
      } catch (reason) {
        return reason;
      }
      throw new Error('Expected validation to fail');
    })();
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain('https://unrelated.example/one');
    expect((error as Error).message).toContain('https://unrelated.example/two');
  });

  it('aggregates raw Vite module errors with independent alias, schema, and reference errors without source payloads', () => {
    const duplicateAliasPaper = clone(validPaperRecord);
    duplicateAliasPaper.paper_id = '018f4a90-6d31-7b2c-9dd3-7e12c8b77211';
    const unresolvedEdition = clone(validEditionRecord);
    unresolvedEdition.entries[0].paper_id = '018f4a90-6d31-7b2c-9dd3-7e12c8b77212';
    const schemaInvalidEdition = clone(validEditionRecord) as Record<string, unknown>;
    schemaInvalidEdition.validation_status = 'unvalidated';

    const error = (() => {
      try {
        buildContentRepositoryFromViteModules(
          { '../data/papers/index.json': JSON.stringify([validPaperRecord, duplicateAliasPaper]) },
          {
            '../data/editions/broken.json': '{"abstract":"DO_NOT_DISCLOSE"',
            '../data/editions/first.json': JSON.stringify(validEditionRecord),
            '../data/editions/invalid.json': JSON.stringify(schemaInvalidEdition),
            '../data/editions/second.json': JSON.stringify(unresolvedEdition),
          },
        );
      } catch (reason) {
        return reason;
      }
      throw new Error('Expected validation to fail');
    })();

    expect(error).toBeInstanceOf(Error);
    const message = (error as Error).message;
    expect(message).toContain('src/data/editions/broken.json: invalid JSON');
    expect(message).toContain('Duplicate external-ID alias');
    expect(message).toContain('validation_status');
    expect(message).toContain('unknown paper');
    expect(message).not.toContain('DO_NOT_DISCLOSE');
  });

  it('aggregates missing and wrong-shaped raw Vite modules with remaining module errors', () => {
    const unresolvedEdition = clone(validEditionRecord);
    unresolvedEdition.entries[0].paper_id = '018f4a90-6d31-7b2c-9dd3-7e12c8b77212';
    const schemaInvalidEdition = clone(validEditionRecord) as Record<string, unknown>;
    schemaInvalidEdition.validation_status = 'unvalidated';

    const missingError = (() => {
      try {
        buildContentRepositoryFromViteModules({}, {
          '../data/editions/broken.json': '{not JSON',
          '../data/editions/unresolved.json': JSON.stringify(unresolvedEdition),
        });
      } catch (reason) {
        return reason;
      }
      throw new Error('Expected validation to fail');
    })();
    expect(missingError).toBeInstanceOf(Error);
    expect((missingError as Error).message).toContain('Missing required content file: src/data/papers/index.json');
    expect((missingError as Error).message).toContain('src/data/editions/broken.json: invalid JSON');
    expect((missingError as Error).message).toContain('unknown paper');

    const shapeError = (() => {
      try {
        buildContentRepositoryFromViteModules(
          { '../data/papers/index.json': '{}' },
          { '../data/editions/invalid.json': JSON.stringify(schemaInvalidEdition) },
        );
      } catch (reason) {
        return reason;
      }
      throw new Error('Expected validation to fail');
    })();
    expect(shapeError).toBeInstanceOf(Error);
    expect((shapeError as Error).message).toContain('src/data/papers/index.json: expected a JSON array');
    expect((shapeError as Error).message).toContain('validation_status');
  });
});
