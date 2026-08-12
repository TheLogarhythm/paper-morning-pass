import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from 'playwright/test';

const basePath = '/paper-morning-pass';
const publicRoutes = [
  { name: 'latest', path: `${basePath}/` },
  { name: 'archive', path: `${basePath}/archive` },
  { name: 'dated edition', path: `${basePath}/editions/2026-08-10` },
  { name: 'starred', path: `${basePath}/starred` },
  { name: 'not found', path: `${basePath}/editions/1900-01-01` },
] as const;

const viewports = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'iPad portrait', width: 834, height: 1194 },
  { name: 'iPad landscape', width: 1194, height: 834 },
] as const;

async function expectVisibleFocusOutline(page: Page) {
  const focus = await page.locator(':focus').evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      outlineColor: style.outlineColor,
      outlineStyle: style.outlineStyle,
      outlineWidth: Number.parseFloat(style.outlineWidth),
    };
  });

  expect(focus.outlineStyle).not.toBe('none');
  expect(focus.outlineColor).not.toBe('transparent');
  expect(focus.outlineWidth).toBeGreaterThanOrEqual(2);
}

function expectedFocusStops(page: Page) {
  const primaryNavigation = page.getByRole('navigation', { name: 'Primary' });
  return [
    page.locator('.skip-link'),
    page.locator('.wordmark'),
    primaryNavigation.getByRole('link', { name: 'Latest' }),
    primaryNavigation.getByRole('link', { name: 'Archive' }),
    primaryNavigation.getByRole('link', { name: 'Starred' }),
    page.locator('.paper-card a').first(),
  ];
}

test.describe('public route accessibility', () => {
  for (const route of publicRoutes) {
    test(`${route.name} has one landmark heading, logical headings, no overflow, and no high-impact axe violations`, async ({ page }) => {
      await page.goto(route.path);

      await expect(page.getByRole('main')).toHaveCount(1);
      await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);

      const headingLevels = await page.getByRole('main').locator('h1, h2, h3, h4, h5, h6').evaluateAll((headings) =>
        headings.map((heading) => Number.parseInt(heading.tagName.slice(1), 10)),
      );
      for (let index = 1; index < headingLevels.length; index += 1) {
        expect(
          headingLevels[index] - headingLevels[index - 1],
          `${route.name} skips from h${headingLevels[index - 1]} to h${headingLevels[index]}`,
        ).toBeLessThanOrEqual(1);
      }

      const hasHorizontalOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      );
      expect(hasHorizontalOverflow).toBe(false);

      const axeResults = await new AxeBuilder({ page }).analyze();
      const highImpactViolations = axeResults.violations.filter(
        ({ impact }) => impact === 'serious' || impact === 'critical',
      );
      expect(highImpactViolations).toEqual([]);
    });
  }

  test('real Tab traversal starts at the skip link, covers the header, and reaches a text-labelled paper link', async ({ page, browserName }) => {
    test.skip(
      browserName === 'webkit' && process.platform === 'win32',
      'Windows WebKit does not expose Safari\'s OS-level “tab to links” preference.',
    );
    await page.goto(`${basePath}/`);

    for (const stop of expectedFocusStops(page)) {
      await page.keyboard.press('Tab');
      await expect(stop).toBeFocused();
      await expect(stop).toBeVisible();
      await expectVisibleFocusOutline(page);
      expect((await stop.innerText()).trim().length).toBeGreaterThan(0);
    }
  });

  test('Windows WebKit direct focus renders outlines at ordered stops without exercising Tab traversal', async ({ page, browserName }) => {
    test.skip(
      browserName !== 'webkit' || process.platform !== 'win32',
      'This direct-focus check documents the Windows WebKit keyboard-emulation limitation only.',
    );
    await page.goto(`${basePath}/`);

    for (const stop of expectedFocusStops(page)) {
      await stop.focus();
      await expect(stop).toBeFocused();
      await expect(stop).toBeVisible();
      await expectVisibleFocusOutline(page);
      expect((await stop.innerText()).trim().length).toBeGreaterThan(0);
    }
  });

  test('source meanings and paper links expose visible text', async ({ page }) => {
    await page.goto(`${basePath}/`);

    const textLabelledElements = page.locator([
      '.source-status__line strong',
      '.source-status__description',
      '.paper-card a',
    ].join(', '));
    expect(await textLabelledElements.count()).toBeGreaterThan(0);
    for (const element of await textLabelledElements.all()) {
      await expect(element).toBeVisible();
      expect((await element.innerText()).trim().length).toBeGreaterThan(0);
    }
  });

  test('visually unmarked ordered lists retain explicit list semantics', async ({ page }) => {
    for (const path of [`${basePath}/`, `${basePath}/editions/2026-08-10`]) {
      await page.goto(path);
      const paperLists = page.locator('ol.paper-list');
      expect(await paperLists.count()).toBeGreaterThan(0);
      for (const list of await paperLists.all()) {
        await expect(list).toHaveAttribute('role', 'list');
      }
    }

    await page.goto(`${basePath}/archive`);
    await expect(page.locator('ol.archive-list')).toHaveAttribute('role', 'list');
  });

  test('archive empty-filter feedback is an announced status', async ({ page }) => {
    await page.goto(`${basePath}/archive`);
    await expect(page.locator('[data-archive-empty]')).toHaveAttribute('role', 'status');
  });

  test('starred state mount is inert and the page owns one main landmark', async ({ page }) => {
    await page.goto(`${basePath}/starred`);

    await expect(page.getByRole('main')).toHaveCount(1);
    const stateMount = page.locator('[data-state-root="starred"]');
    await expect(stateMount).toHaveCount(1);
    await expect(stateMount.locator([
      'a[href]',
      'area[href]',
      'button',
      'input',
      'select',
      'textarea',
      'summary',
      'iframe',
      'audio[controls]',
      'video[controls]',
      '[contenteditable]:not([contenteditable="false"])',
      '[tabindex]:not([tabindex="-1"])',
      '[role="button"]',
      '[role="switch"]',
      '[role="checkbox"]',
      '[role="textbox"]',
      '[role="combobox"]',
      '[role="link"]',
    ].join(', '))).toHaveCount(0);
  });
});

test.describe('representative responsive layouts', () => {
  for (const viewport of viewports) {
    test(`${viewport.name} keeps the reading flow and archive controls inside one calm column`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto(`${basePath}/`);

      const mainBox = await page.getByRole('main').boundingBox();
      expect(mainBox).not.toBeNull();
      expect(mainBox!.width).toBeLessThanOrEqual(768);
      const paperCards = page.locator('.paper-card');
      expect(await paperCards.count()).toBeGreaterThan(0);
      for (const paperCard of await paperCards.all()) {
        const cardBox = await paperCard.boundingBox();
        expect(cardBox).not.toBeNull();
        expect(cardBox!.x).toBeGreaterThanOrEqual(0);
        expect(cardBox!.x + cardBox!.width).toBeLessThanOrEqual(viewport.width);
      }

      await page.goto(`${basePath}/archive`);
      const controls = page.locator('.archive-filters, .archive-filters select, .archive-filters input');
      await expect(page.locator('.archive-filters')).toBeVisible();
      for (const control of await controls.all()) {
        const box = await control.boundingBox();
        expect(box).not.toBeNull();
        expect(box!.x).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
      }
      for (const control of await page.locator('.archive-filters select, .archive-filters input').all()) {
        const box = await control.boundingBox();
        expect(box!.height).toBeGreaterThanOrEqual(44);
      }
    });
  }
});
