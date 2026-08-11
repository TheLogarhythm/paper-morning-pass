import { describe, expect, it } from 'vitest';
import config from '../../playwright.config';

describe('Playwright web server ownership', () => {
  it('forces Astro into the foreground so the literal E2E command owns the server', () => {
    expect(config.webServer).not.toBeUndefined();
    expect(Array.isArray(config.webServer)).toBe(false);
    if (!config.webServer || Array.isArray(config.webServer)) return;

    expect(config.webServer.env).toMatchObject({ ASTRO_DEV_BACKGROUND: '0' });
  });
});
