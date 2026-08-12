import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const skillRoot = resolve(import.meta.dirname, '../../.agents/skills/publish-daily-brief');

describe('publish-daily-brief skill contract', () => {
  it('encodes the durable execution and safety policy', () => {
    const skill = readFileSync(resolve(skillRoot, 'SKILL.md'), 'utf8');
    const runContract = readFileSync(resolve(skillRoot, 'references/run-contract.md'), 'utf8');
    const editorialPolicy = readFileSync(resolve(skillRoot, 'references/editorial-policy.md'), 'utf8');
    const combined = `${skill}\n${runContract}\n${editorialPolicy}`;

    for (const required of [
      '$publish-daily-brief',
      'daily:prepare',
      'daily:finalize',
      'daily:preflight',
      '2 minutes',
      '8 additional minutes',
      'Partial coverage',
      'all three fail',
      'advance watermarks only',
      'Graphics and Vision–Graphics',
      'quality-first',
      'never force-push',
      'human review',
      'private notes',
    ]) {
      expect(combined, `missing durable instruction: ${required}`).toContain(required);
    }
  });

  it('provides valid user-facing metadata for explicit invocation', () => {
    const metadata = readFileSync(resolve(skillRoot, 'agents/openai.yaml'), 'utf8');
    expect(metadata).toContain('display_name: "Publish Daily Brief"');
    expect(metadata).toContain('$publish-daily-brief');
    expect(metadata).toContain('allow_implicit_invocation: false');
  });
});
