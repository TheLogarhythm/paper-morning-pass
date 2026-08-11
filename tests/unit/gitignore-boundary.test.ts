import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const projectRoot = fileURLToPath(new URL('../..', import.meta.url));

function isIgnored(path: string): boolean {
  const result = spawnSync('git', ['check-ignore', '--quiet', '--', path], {
    cwd: projectRoot,
    encoding: 'utf8',
  });
  if (result.error) throw result.error;
  if (result.status !== 0 && result.status !== 1) {
    throw new Error(`git check-ignore failed with status ${result.status}`);
  }
  return result.status === 0;
}

describe('public repository environment-file boundary', () => {
  it.each([
    '.env.local',
    '.env.development',
    '.env.test.local',
  ])('ignores dotenv variant %s using Git semantics', (path) => {
    expect(isIgnored(path)).toBe(true);
  });

  it('keeps a future public .env.example template trackable', () => {
    expect(isIgnored('.env.example')).toBe(false);
  });
});
