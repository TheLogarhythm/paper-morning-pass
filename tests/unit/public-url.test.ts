import { describe, expect, it } from 'vitest';
import { publicPath } from '../../src/lib/public-url';

const sentinelOrigin = 'https://expected.example';
const asciiControlCodes = [
  ...Array.from({ length: 0x20 }, (_, code) => code),
  0x7f,
];

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

  it('preserves query and fragment components on valid root-relative routes', () => {
    const result = publicPath('/paper-morning-pass/', '/archive?topic=vision#2026-08-10');

    expect(result).toBe('/paper-morning-pass/archive?topic=vision#2026-08-10');
    expect(new URL(result, `${sentinelOrigin}/`).origin).toBe(sentinelOrigin);
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

  it.each([
    { label: 'tab', code: 0x09 },
    { label: 'line feed', code: 0x0a },
    { label: 'carriage return', code: 0x0d },
  ])('rejects an actual $label that WHATWG strips into a route authority', ({ code }) => {
    const route = `/${String.fromCharCode(code)}/attacker.example`;
    expect(new URL(route, `${sentinelOrigin}/`).origin).toBe('https://attacker.example');
    expect(() => publicPath('/', route)).toThrow('Route must be a root-relative path.');
  });

  it('rejects every raw ASCII control character in route and base inputs', () => {
    for (const code of asciiControlCodes) {
      const control = String.fromCharCode(code);
      const label = `U+${code.toString(16).toUpperCase().padStart(4, '0')}`;
      expect(() => publicPath('/', `/safe${control}segment`), `${label} route`).toThrow(
        'Route must be a root-relative path.',
      );
      expect(() => publicPath(`/safe${control}base/`, '/archive'), `${label} base`).toThrow(
        'Route must be a root-relative path.',
      );
    }
  });

  it.each([
    { label: 'tab', code: 0x09 },
    { label: 'line feed', code: 0x0a },
    { label: 'carriage return', code: 0x0d },
    { label: 'backslash', code: 0x5c },
  ])('rejects a $label in the base that WHATWG can reinterpret as an authority', ({ code }) => {
    const control = String.fromCharCode(code);
    const base = `/${control}/attacker.example/`;
    const uncheckedJoin = `/${base.slice(1, -1)}/archive`;
    expect(new URL(uncheckedJoin, `${sentinelOrigin}/`).origin).toBe('https://attacker.example');
    expect(() => publicPath(base, '/archive')).toThrow('Route must be a root-relative path.');
  });

  it.each([
    'https://attacker.example/base',
    '//attacker.example/base',
    '/paper-morning-pass?mode=preview',
    '/paper-morning-pass#fragment',
  ])('rejects non-pathname base input without reflecting it: %s', (base) => {
    expect(() => publicPath(base, '/archive')).toThrow('Route must be a root-relative path.');
  });
});
