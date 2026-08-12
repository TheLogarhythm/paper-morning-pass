import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const workflowPath = new URL('../../.github/workflows/deploy-pages.yml', import.meta.url);

describe('GitHub Pages workflow', () => {
  it('validates, builds, uploads dist, and deploys with bounded permissions', async () => {
    const workflow = (await readFile(workflowPath, 'utf8')).replace(/\r\n/g, '\n');

    expect(workflow).toContain('name: Deploy GitHub Pages');
    expect(workflow).toMatch(/push:\n\s+branches:\n\s+- main/);
    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).toContain('cancel-in-progress: false');
    expect(workflow).toContain('contents: read');
    expect(workflow).toContain('pages: write');
    expect(workflow).toContain('id-token: write');
    expect(workflow).toContain('uses: actions/checkout@v7');
    expect(workflow).toContain('uses: actions/setup-node@v7');
    expect(workflow).toContain('node-version: 22');
    expect(workflow).toContain('cache: npm');
    expect(workflow).toContain('run: npm ci');
    expect(workflow).toContain('run: npm run check');
    expect(workflow).toContain('run: npm test');
    expect(workflow).toContain('run: npm run build');
    expect(workflow).toContain('uses: actions/upload-pages-artifact@v5');
    expect(workflow).toContain('path: ./dist');
    expect(workflow).toContain('uses: actions/deploy-pages@v5');
    expect(workflow).toContain('name: github-pages');
    expect(workflow).not.toContain('secrets.');
  });
});
