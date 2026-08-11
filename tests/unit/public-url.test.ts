import { describe, expect, it } from 'vitest';
import { publicPath } from '../../src/lib/public-url';

describe('publicPath', () => {
  it('joins routes under a normalized Astro base', () => {
    expect(publicPath('/paper-morning-pass/', '/archive')).toBe('/paper-morning-pass/archive');
    expect(publicPath('/', '/editions/2026-08-10')).toBe('/editions/2026-08-10');
  });

  it('joins public assets for deployed and local-root bases', () => {
    expect(publicPath('/paper-morning-pass/', '/favicon.svg')).toBe('/paper-morning-pass/favicon.svg');
    expect(publicPath('/paper-morning-pass/', '/favicon.ico')).toBe('/paper-morning-pass/favicon.ico');
    expect(publicPath('/', '/favicon.svg')).toBe('/favicon.svg');
    expect(publicPath('/', '/favicon.ico')).toBe('/favicon.ico');
  });

  it('rejects protocol-relative and absolute URLs', () => {
    expect(() => publicPath('/paper-morning-pass/', '//attacker.example')).toThrow();
    expect(() => publicPath('/paper-morning-pass/', 'https://attacker.example')).toThrow();
  });

  it.each([
    '/\\attacker.example',
    '/\\\\attacker.example',
  ])('rejects backslash authority paths that browsers can resolve off-origin: %s', (route) => {
    expect(() => publicPath('/', route)).toThrow('Route must be a root-relative path.');

    let resolvedOrigin = 'https://expected.example';
    try {
      resolvedOrigin = new URL(publicPath('/', route), `${resolvedOrigin}/`).origin;
    } catch {
      // Rejection is the desired outcome; the origin remains the expected origin.
    }
    expect(resolvedOrigin).toBe('https://expected.example');
  });
});
