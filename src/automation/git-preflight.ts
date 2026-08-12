import { z } from 'zod';

const gitPreflightInputSchema = z.object({
  branch: z.string(),
  upstream: z.string(),
  dirty: z.boolean(),
  ahead: z.number().int().nonnegative(),
  behind: z.number().int().nonnegative(),
}).strict();

export type GitPreflightInput = z.infer<typeof gitPreflightInputSchema>;

export function evaluateGitPreflight(input: GitPreflightInput):
  | { outcome: 'ready' }
  | { outcome: 'push_pending'; commits: number } {
  const status = gitPreflightInputSchema.parse(input);
  if (status.branch !== 'main') throw new Error('Daily Brief publication requires the main branch.');
  if (status.upstream !== 'origin/main') throw new Error('Daily Brief main must track origin/main.');
  if (status.dirty) throw new Error('Daily Brief publication refuses a dirty working tree.');
  if (status.behind > 0) throw new Error('Local main is behind or diverged from origin/main.');
  if (status.ahead > 0) return { outcome: 'push_pending', commits: status.ahead };
  return { outcome: 'ready' };
}
