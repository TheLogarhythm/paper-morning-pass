import { describe, expect, it } from 'vitest';
import { evaluateGitPreflight } from '../../src/automation/git-preflight';

const clean = { branch: 'main', upstream: 'origin/main', dirty: false, ahead: 0, behind: 0 };

describe('Daily Brief Git preflight', () => {
  it('accepts only a clean synchronized main checkout', () => {
    expect(evaluateGitPreflight(clean)).toEqual({ outcome: 'ready' });
  });

  it('stops on user changes, branch mismatch, or remote divergence', () => {
    expect(() => evaluateGitPreflight({ ...clean, dirty: true })).toThrow(/dirty/i);
    expect(() => evaluateGitPreflight({ ...clean, branch: 'feature' })).toThrow(/main/i);
    expect(() => evaluateGitPreflight({ ...clean, upstream: 'fork/main' })).toThrow(/origin\/main/i);
    expect(() => evaluateGitPreflight({ ...clean, behind: 1 })).toThrow(/diverged|behind/i);
  });

  it('identifies a clean local commit that must be validated and pushed first', () => {
    expect(evaluateGitPreflight({ ...clean, ahead: 1 })).toEqual({ outcome: 'push_pending', commits: 1 });
  });
});
