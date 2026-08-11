import { describe, expect, it } from 'vitest';
import { publicPath } from '../../src/lib/public-url';

describe('publicPath', () => {
  it('joins routes under a normalized Astro base', () => {
    expect(publicPath('/paper-morning-pass/', '/archive')).toBe('/paper-morning-pass/archive');
    expect(publicPath('/', '/editions/2026-08-10')).toBe('/editions/2026-08-10');
  });

  it('rejects protocol-relative and absolute URLs', () => {
    expect(() => publicPath('/paper-morning-pass/', '//attacker.example')).toThrow();
    expect(() => publicPath('/paper-morning-pass/', 'https://attacker.example')).toThrow();
  });
});
