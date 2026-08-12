import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve } from 'node:path';
import { evaluateGitPreflight } from '../src/automation/git-preflight';

const execute = promisify(execFile);
const root = resolve(import.meta.dirname, '..');

async function git(args: string[]): Promise<string> {
  const { stdout } = await execute('git', args, { cwd: root, encoding: 'utf8' });
  return stdout.trim();
}

await git(['fetch', 'origin', 'main']);
const branch = await git(['branch', '--show-current']);
const upstream = await git(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']);
const dirty = (await git(['status', '--porcelain', '--untracked-files=all'])).length > 0;
const [behindText, aheadText] = (await git(['rev-list', '--left-right', '--count', 'origin/main...main'])).split(/\s+/);
const result = evaluateGitPreflight({
  branch,
  upstream,
  dirty,
  behind: Number.parseInt(behindText, 10),
  ahead: Number.parseInt(aheadText, 10),
});
process.stdout.write(`${JSON.stringify(result)}\n`);
