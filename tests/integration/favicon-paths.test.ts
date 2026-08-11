import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)));

describe('favicon paths', () => {
  it('keeps favicon assets below the deployed base', async () => {
    const page = await readFile(join(projectRoot, 'dist', 'index.html'), 'utf8');

    expect(page).toContain('href="/paper-morning-pass/favicon.svg"');
    expect(page).toContain('href="/paper-morning-pass/favicon.ico"');
  });
});
