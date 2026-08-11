import { expect, test } from 'playwright/test';

const basePath = '/paper-morning-pass';
const fixturePaperId = 'paper-018f4a90-6d31-7b2c-9dd3-7e12c8b77210';
const fixtureTitle = 'Fixture Paper: Layered Motion Fields for Dynamic Scenes';

test('latest edition is a content-first Daily Brief', async ({ page }) => {
  await page.goto(`${basePath}/`);

  await expect(page.locator('h1')).toHaveCount(1);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Paper Morning Pass');
  await expect(page.getByRole('main')).toContainText('10 August 2026');
  await expect(page.getByRole('main')).toContainText('1 paper · 8 minutes');
  await expect(page.getByRole('main')).toContainText('arXiv cs.CV');
  await expect(page.getByRole('main')).toContainText('Complete');

  const readFirst = page.getByRole('region', { name: 'Read First' });
  await expect(readFirst).toContainText(fixtureTitle);
  for (const label of [
    'Verdict',
    'Contribution',
    'Why it matters',
    'Evidence',
    'Limitation',
    'Review depth',
    'Estimated reading time',
  ]) {
    await expect(readFirst.getByText(label, { exact: true })).toBeVisible();
  }
});

test('archive keeps edition links in server-rendered HTML', async ({ page }) => {
  await page.goto(`${basePath}/archive`);

  const editionLink = page.getByRole('link', { name: '10 August 2026' });
  await expect(editionLink).toHaveAttribute('href', `${basePath}/editions/2026-08-10`);
  await expect(page.locator('select[name="topic"]')).toBeVisible();
  await expect(page.locator('input[name="month"][type="month"]')).toBeVisible();
});

test('archive edition links provide at least 44px touch targets', async ({ page }) => {
  await page.goto(`${basePath}/archive`);

  const editionLink = page.getByRole('link', { name: '10 August 2026' });
  const box = await editionLink.boundingBox();
  expect(box?.height).toBeGreaterThanOrEqual(44);
});

test('dated edition renders the fixture at its stable paper anchor', async ({ page }) => {
  await page.goto(`${basePath}/editions/2026-08-10`);

  const paper = page.locator(`#${fixturePaperId}`);
  await expect(paper).toBeVisible();
  await expect(paper).toContainText(fixtureTitle);
  await expect(paper).toContainText('This fictional fixture is a complete sample for interface development.');
  await expect(page.locator(`a[href="#${fixturePaperId}"]`)).toBeVisible();
});

test('unknown edition dates use the site not-found page', async ({ page }) => {
  const response = await page.goto(`${basePath}/editions/1900-01-01`);

  expect(response?.status()).toBe(404);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Page not found');
  await expect(page.getByRole('link', { name: 'Return to the latest edition' })).toHaveAttribute(
    'href',
    `${basePath}/`,
  );
});

test('content links are safe and site URLs honor the production base', async ({ page }) => {
  await page.goto(`${basePath}/`);

  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    'href',
    'https://thelogarhythm.github.io/paper-morning-pass/',
  );
  await expect(page).toHaveTitle('Daily Brief · Paper Morning Pass');
  await expect(page.getByRole('link', { name: 'Skip to content' })).toHaveAttribute('href', '#main-content');
  await expect(page.getByRole('main')).toHaveAttribute('id', 'main-content');
  await expect(page.locator('meta[http-equiv="Content-Security-Policy"]')).toHaveAttribute(
    'content',
    expect.stringContaining("object-src 'none'"),
  );
  await expect(page.getByRole('link', { name: 'Latest' })).toHaveAttribute('href', `${basePath}/`);
  await expect(page.getByRole('link', { name: 'Archive' })).toHaveAttribute('href', `${basePath}/archive`);
  await expect(page.getByRole('link', { name: 'Starred' })).toHaveAttribute('href', `${basePath}/starred`);

  const externalLinks = page.locator('main a[href^="https://"], main a[href^="http://"]');
  expect(await externalLinks.count()).toBeGreaterThan(0);
  for (const link of await externalLinks.all()) {
    await expect(link).toHaveAttribute('target', '_blank');
    const rel = (await link.getAttribute('rel'))?.split(/\s+/) ?? [];
    expect(rel).toEqual(expect.arrayContaining(['noopener', 'noreferrer', 'external']));
  }
});

test('paper links provide at least 44px touch targets', async ({ page }) => {
  await page.goto(`${basePath}/`);

  const paperLinks = page.locator('.paper-card a');
  expect(await paperLinks.count()).toBeGreaterThan(0);
  for (const link of await paperLinks.all()) {
    const box = await link.boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(44);
  }
});

test('starred papers honestly reports unavailable reading state', async ({ page }) => {
  await page.goto(`${basePath}/starred`);

  await expect(page.locator('h1')).toHaveCount(1);
  await expect(page.getByRole('heading', { level: 1, name: 'Starred papers' })).toBeVisible();

  const unavailableState = page.getByRole('status');
  await expect(unavailableState.getByText('Reading state unavailable', { exact: true })).toBeVisible();
  await expect(
    unavailableState.getByText(
      'No paper is inferred to be unread or unstarred while reading state is unavailable.',
      { exact: true },
    ),
  ).toBeVisible();
  await expect(page.locator('[data-state-root="starred"]')).toHaveCount(1);

  await expect(page.getByText(fixtureTitle, { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /read|star/i })).toHaveCount(0);
  await expect(page.getByRole('checkbox')).toHaveCount(0);

  await expect(page).toHaveTitle('Starred papers · Paper Morning Pass');
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    'href',
    'https://thelogarhythm.github.io/paper-morning-pass/starred',
  );
  await expect(page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Latest' })).toHaveAttribute(
    'href',
    `${basePath}/`,
  );
  await expect(page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Archive' })).toHaveAttribute(
    'href',
    `${basePath}/archive`,
  );
  await expect(page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Starred' })).toHaveAttribute(
    'href',
    `${basePath}/starred`,
  );
});
