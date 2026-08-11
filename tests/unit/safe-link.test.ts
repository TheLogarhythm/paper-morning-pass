import { describe, expect, it } from 'vitest';
import { safeExternalUrl } from '../../src/lib/safe-link';

describe('safeExternalUrl', () => {
  it.each([
    ['https://example.org/papers/fixture', 'https://example.org/papers/fixture'],
    ['http://example.org:80/a/../paper?q=one two#abstract', 'http://example.org/paper?q=one%20two#abstract'],
  ])('normalizes absolute HTTP(S) URLs: %s', (value, normalized) => {
    expect(safeExternalUrl(value)).toBe(normalized);
  });

  it.each([
    'javascript:alert(1)',
    'data:text/plain,unsafe',
    'file:///etc/passwd',
    '//example.org/paper',
    '/paper',
    'paper',
    'https://',
    '',
  ])('rejects unsafe, relative, malformed, or empty strings: %s', (value) => {
    expect(() => safeExternalUrl(value)).toThrow('External URL is not permitted.');
  });

  it.each([
    'https://reader@example.org/paper',
    'https://reader:secret@example.org/paper',
  ])('rejects URLs containing credentials without reflecting them: %s', (value) => {
    let message = '';
    try {
      safeExternalUrl(value);
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toBe('External URL is not permitted.');
    expect(message).not.toContain(value);
    expect(message).not.toContain('reader');
    expect(message).not.toContain('secret');
  });

  it.each([undefined, null, 42, {}, []])('rejects non-string input without reflecting it: %j', (value) => {
    expect(() => safeExternalUrl(value)).toThrow('External URL is not permitted.');
  });
});
