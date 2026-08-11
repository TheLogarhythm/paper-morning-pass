import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { runContentValidation } from '../../src/lib/content-validation-command';
import { validEditionRecord, validPaperRecord } from '../fixtures/content';

describe('content validation command', () => {
  it('reports safe validation context without reflecting credential markers', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'content-validation-command-'));
    const marker = 'TEST_ONLY_SECRET_MARKER_9QK';
    const unsafeUrl = `https://fixture:${marker}@example.org/private?token=${marker}`;
    const paper = structuredClone(validPaperRecord);
    paper.provenance[0].url = unsafeUrl;
    const stdout: string[] = [];
    const stderr: string[] = [];

    try {
      await mkdir(join(directory, 'papers'));
      await mkdir(join(directory, 'editions'));
      await writeFile(join(directory, 'papers', 'index.json'), JSON.stringify([paper]));
      await writeFile(join(directory, 'editions', 'fixture.json'), JSON.stringify(validEditionRecord));

      const exitCode = await runContentValidation({
        dataDirectory: pathToFileURL(`${directory}/`),
        writeOutput: (line) => stdout.push(line),
        writeError: (line) => stderr.push(line),
      });

      expect(exitCode).toBe(1);
      expect(stdout).toEqual([]);
      expect(stderr.join('\n')).toContain('src/data/papers/index.json[0].provenance.0.url');
      expect(stderr.join('\n')).not.toContain(marker);
      expect(stderr.join('\n')).not.toContain(unsafeUrl);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
