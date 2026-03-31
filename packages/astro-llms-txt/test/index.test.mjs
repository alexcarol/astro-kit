import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { parse } from 'node-html-parser';
import llmsTxt, { htmlToMarkdown, extractPage, formatIndex, formatFull, collectPages } from '../src/index.mjs';

const BOM = '\uFEFF';

function makePageWriter(getTempDir) {
  return async (pathname, title, description, mainContent) => {
    const dir = join(getTempDir(), pathname);
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, 'index.html'),
      `<html>
        <head>
          <title>${title}</title>
          <meta name="description" content="${description}">
        </head>
        <body><main>${mainContent}</main></body>
      </html>`,
      'utf-8',
    );
  };
}

// -- htmlToMarkdown --

describe('htmlToMarkdown', () => {
  it('converts HTML to Markdown preserving structure', () => {
    const node = parse('<div>Hello <strong>world</strong></div>');
    expect(htmlToMarkdown(node)).toBe('Hello **world**');
  });

  it('removes script and style elements', () => {
    const node = parse('<div>Visible<script>alert(1)</script><style>.x{}</style> text</div>');
    expect(htmlToMarkdown(node)).toBe('Visible text');
  });

  it('removes aria-hidden elements', () => {
    const node = parse('<div>Visible<span aria-hidden="true">Hidden</span> end</div>');
    expect(htmlToMarkdown(node)).toBe('Visible end');
  });

  it('preserves headings as ATX style', () => {
    const node = parse('<div><h2>Section</h2><p>Content</p></div>');
    expect(htmlToMarkdown(node)).toContain('## Section');
    expect(htmlToMarkdown(node)).toContain('Content');
  });

  it('preserves links', () => {
    const node = parse('<div><a href="https://example.com">Example</a></div>');
    expect(htmlToMarkdown(node)).toBe('[Example](https://example.com)');
  });

  it('collapses excessive blank lines', () => {
    const node = parse('<div><p>line1</p><p>line2</p></div>');
    expect(htmlToMarkdown(node)).not.toMatch(/\n{3,}/);
  });
});

// -- extractPage --

describe('extractPage', () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = join(tmpdir(), `llms-txt-test-${Date.now()}`);
    await mkdir(tempDir, { recursive: true });
  });

  afterEach(() => rm(tempDir, { recursive: true, force: true }));

  async function writeHtml(filename, html) {
    const path = join(tempDir, filename);
    await writeFile(path, html, 'utf-8');
    return path;
  }

  it('extracts h1, description, and main content as markdown', async () => {
    const path = await writeHtml('page.html', `
      <html>
        <head>
          <title>My Page - My Site</title>
          <meta name="description" content="A test page">
        </head>
        <body><main><h1>My Page</h1><p>Hello world</p></main></body>
      </html>
    `);

    const result = await extractPage(path, 'h1');
    expect(result.title).toBe('My Page');
    expect(result.description).toBe('A test page');
    expect(result.content).toContain('Hello world');
    expect(result.content).not.toContain('My Page');
  });

  it('uses <title> when titleSource is "title"', async () => {
    const path = await writeHtml('page.html', `
      <html>
        <head><title>My Page - My Site</title></head>
        <body><main><h1>My Page</h1><p>Content</p></main></body>
      </html>
    `);

    const result = await extractPage(path, 'title');
    expect(result.title).toBe('My Page - My Site');
  });

  it('falls back to <title> when h1 is missing', async () => {
    const path = await writeHtml('page.html', `
      <html>
        <head><title>Fallback Title</title></head>
        <body><main><p>No heading</p></main></body>
      </html>
    `);

    const result = await extractPage(path, 'h1');
    expect(result.title).toBe('Fallback Title');
  });

  it('collapses whitespace in h1 (e.g. from <br> tags)', async () => {
    const path = await writeHtml('br.html', `
      <html>
        <head><title>Alex Carol</title></head>
        <body><main><h1>Alex<br>Carol</h1><p>Content</p></main></body>
      </html>
    `);

    const result = await extractPage(path, 'h1');
    expect(result.title).toBe('Alex Carol');
  });

  it('returns empty strings when elements are missing', async () => {
    const path = await writeHtml('empty.html', '<html><body></body></html>');

    const result = await extractPage(path, 'h1');
    expect(result.title).toBe('');
    expect(result.description).toBe('');
    expect(result.content).toBe('');
  });

  it('returns empty description when meta has no content attribute', async () => {
    const path = await writeHtml('no-content.html', `
      <html><head><meta name="description"></head><body></body></html>
    `);

    const result = await extractPage(path, 'h1');
    expect(result.description).toBe('');
  });
});

// -- formatIndex --

describe('formatIndex', () => {
  const pages = [
    { pathname: '/', title: 'Home', description: 'Welcome to the site', content: '' },
    { pathname: '/about/', title: 'About', description: 'About us', content: '' },
  ];

  it('starts with BOM', () => {
    const output = formatIndex('Test Site', 'https://example.com', pages);
    expect(output.startsWith(BOM)).toBe(true);
  });

  it('uses the provided name as heading', () => {
    const output = formatIndex('Test Site', 'https://example.com', pages);
    expect(output).toContain('# Test Site\n');
  });

  it('includes homepage description as blockquote', () => {
    const output = formatIndex('Test Site', 'https://example.com', pages);
    expect(output).toContain('> Welcome to the site');
  });

  it('lists pages with absolute URLs', () => {
    const output = formatIndex('Test Site', 'https://example.com', pages);
    expect(output).toContain('- [Home](https://example.com/): Welcome to the site');
    expect(output).toContain('- [About](https://example.com/about/): About us');
  });

  it('handles empty pages array', () => {
    const output = formatIndex('Test', 'https://example.com', []);
    expect(output).toContain('# Test');
    expect(output).toContain('> ');
  });
});

// -- formatFull --

describe('formatFull', () => {
  const pages = [
    { pathname: '/', title: 'Home', description: 'Welcome', content: 'Homepage content here' },
    { pathname: '/about/', title: 'About', description: 'About us', content: 'About content here' },
  ];

  it('starts with BOM', () => {
    const output = formatFull('Test Site', 'https://example.com', pages);
    expect(output.startsWith(BOM)).toBe(true);
  });

  it('uses the provided name as heading', () => {
    const output = formatFull('Test Site', 'https://example.com', pages);
    expect(output).toContain('# Test Site\n');
  });

  it('includes full page content under linked headings', () => {
    const output = formatFull('Test Site', 'https://example.com', pages);
    expect(output).toContain('## [Home](https://example.com/)');
    expect(output).toContain('Homepage content here');
    expect(output).toContain('## [About](https://example.com/about/)');
    expect(output).toContain('About content here');
  });
});

// -- collectPages --

describe('collectPages', () => {
  let tempDir;
  const logger = { warn: vi.fn(), info: vi.fn() };

  beforeEach(async () => {
    tempDir = join(tmpdir(), `llms-txt-collect-${Date.now()}`);
    await mkdir(tempDir, { recursive: true });
    logger.warn.mockClear();
  });

  afterEach(() => rm(tempDir, { recursive: true, force: true }));

  const writePageHtml = makePageWriter(() => tempDir);

  it('collects pages and sorts homepage first', async () => {
    await writePageHtml('', 'Home', 'Welcome', '<h1>Home</h1><p>Hi</p>');
    await writePageHtml('about/', 'About', 'About me', '<h1>About</h1><p>Bio</p>');

    const pages = await collectPages(
      [{ pathname: 'about/' }, { pathname: '' }],
      tempDir,
      { excludedPaths: new Set(), titleSource: 'h1', logger },
    );

    expect(pages).toHaveLength(2);
    expect(pages[0].pathname).toBe('/');
    expect(pages[1].pathname).toBe('/about/');
  });

  it('excludes paths in excludedPaths set', async () => {
    await writePageHtml('', 'Home', 'Welcome', '<h1>Home</h1><p>Hi</p>');
    await writePageHtml('admin/', 'Admin', 'Admin panel', '<h1>Admin</h1><p>Admin</p>');

    const pages = await collectPages(
      [{ pathname: '' }, { pathname: 'admin/' }],
      tempDir,
      { excludedPaths: new Set(['admin']), titleSource: 'h1', logger },
    );

    expect(pages).toHaveLength(1);
    expect(pages[0].pathname).toBe('/');
  });

  it('skips non-HTML routes with dots in the path', async () => {
    await writePageHtml('', 'Home', 'Welcome', '<h1>Home</h1><p>Hi</p>');

    const pages = await collectPages(
      [{ pathname: '' }, { pathname: 'robots.txt' }],
      tempDir,
      { excludedPaths: new Set(), titleSource: 'h1', logger },
    );

    expect(pages).toHaveLength(1);
  });

  it('warns and skips when HTML file cannot be read', async () => {
    const pages = await collectPages(
      [{ pathname: 'missing/' }],
      tempDir,
      { excludedPaths: new Set(), titleSource: 'h1', logger },
    );

    expect(pages).toHaveLength(0);
    expect(logger.warn).toHaveBeenCalledOnce();
    expect(logger.warn.mock.calls[0][0]).toContain('missing');
  });

  it('uses h1 for titles when titleSource is h1', async () => {
    await writePageHtml('', 'Home - My Site', 'Welcome', '<h1>Home</h1><p>Hi</p>');

    const pages = await collectPages(
      [{ pathname: '' }],
      tempDir,
      { excludedPaths: new Set(), titleSource: 'h1', logger },
    );

    expect(pages[0].title).toBe('Home');
  });

  it('uses raw <title> when titleSource is title', async () => {
    await writePageHtml('', 'Home - My Site', 'Welcome', '<h1>Home</h1><p>Hi</p>');

    const pages = await collectPages(
      [{ pathname: '' }],
      tempDir,
      { excludedPaths: new Set(), titleSource: 'title', logger },
    );

    expect(pages[0].title).toBe('Home - My Site');
  });

  it('sorts pages alphabetically after homepage', async () => {
    await writePageHtml('', 'Home', 'Home', '<h1>Home</h1><p>H</p>');
    await writePageHtml('contact/', 'Contact', 'Contact', '<h1>Contact</h1><p>C</p>');
    await writePageHtml('about/', 'About', 'About', '<h1>About</h1><p>A</p>');
    await writePageHtml('blog/', 'Blog', 'Blog', '<h1>Blog</h1><p>B</p>');

    const pages = await collectPages(
      [{ pathname: 'contact/' }, { pathname: '' }, { pathname: 'blog/' }, { pathname: 'about/' }],
      tempDir,
      { excludedPaths: new Set(), titleSource: 'h1', logger },
    );

    expect(pages.map((p) => p.pathname)).toEqual(['/', '/about/', '/blog/', '/contact/']);
  });
});

// -- llmsTxt integration factory --

describe('llmsTxt', () => {
  describe('integration structure', () => {
    it('returns an integration with the correct name', () => {
      const integration = llmsTxt();
      expect(integration.name).toBe('llms-txt');
    });

    it('has astro:config:done and astro:build:done hooks', () => {
      const integration = llmsTxt();
      expect(integration.hooks['astro:config:done']).toBeTypeOf('function');
      expect(integration.hooks['astro:build:done']).toBeTypeOf('function');
    });

    it('accepts zero-config usage', () => {
      expect(() => llmsTxt()).not.toThrow();
    });

    it('throws on invalid titleSource', () => {
      expect(() => llmsTxt({ titleSource: 'meta' })).toThrow('Invalid `titleSource`');
    });
  });

  describe('astro:config:done hook', () => {
    it('throws when config.site is not set', () => {
      const integration = llmsTxt();
      const hook = integration.hooks['astro:config:done'];

      expect(() => hook({
        config: {},
        logger: { info: vi.fn() },
      })).toThrow('`site` option must be set');
    });

    it('accepts a valid site config', () => {
      const integration = llmsTxt({ name: 'Test' });
      const hook = integration.hooks['astro:config:done'];
      const logger = { info: vi.fn() };

      expect(() => hook({
        config: { site: 'https://example.com' },
        logger,
      })).not.toThrow();

      expect(logger.info).toHaveBeenCalledWith('Using site: https://example.com');
    });

    it('strips trailing slash from site URL', () => {
      const integration = llmsTxt({ name: 'Test' });
      const hook = integration.hooks['astro:config:done'];
      const logger = { info: vi.fn() };

      hook({ config: { site: 'https://example.com/' }, logger });

      expect(logger.info).toHaveBeenCalledWith('Using site: https://example.com');
    });

    it('does not resolve name at config time when not provided', () => {
      const integration = llmsTxt();
      const hook = integration.hooks['astro:config:done'];
      const logger = { info: vi.fn() };

      hook({ config: { site: 'https://example.com' }, logger });

      expect(logger.info).not.toHaveBeenCalledWith(
        expect.stringContaining('homepage'),
      );
    });
  });

  describe('astro:build:done hook (end-to-end)', () => {
    let tempDir;

    beforeEach(async () => {
      tempDir = join(tmpdir(), `llms-txt-e2e-${Date.now()}`);
      await mkdir(tempDir, { recursive: true });
    });

    afterEach(() => rm(tempDir, { recursive: true, force: true }));

    const writePageHtml = makePageWriter(() => tempDir);

    async function runIntegration(integration, pages) {
      const logger = { info: vi.fn(), warn: vi.fn() };
      integration.hooks['astro:config:done']({
        config: { site: 'https://test.com' },
        logger,
      });
      await integration.hooks['astro:build:done']({
        dir: new URL(`file://${tempDir}/`),
        pages,
        logger,
      });
      const { readFile: read } = await import('node:fs/promises');
      return {
        llmsTxt: await read(join(tempDir, 'llms.txt'), 'utf-8'),
        llmsFull: await read(join(tempDir, 'llms-full.txt'), 'utf-8'),
        logger,
      };
    }

    it('generates llms.txt and llms-full.txt with h1 titles', async () => {
      await writePageHtml('', 'Home - Test Site', 'Welcome to Test', '<h1>Home</h1><p>Homepage</p>');
      await writePageHtml('about/', 'About - Test Site', 'About page', '<h1>About</h1><p>About content</p>');

      const { llmsTxt: idx, llmsFull: full } = await runIntegration(
        llmsTxt({ name: 'Test Site' }),
        [{ pathname: '' }, { pathname: 'about/' }],
      );

      expect(idx).toContain('# Test Site');
      expect(idx).toContain('[Home](https://test.com/)');
      expect(idx).toContain('[About](https://test.com/about/)');
      expect(idx).not.toContain('Test Site]');

      expect(full).toContain('# Test Site');
      expect(full).toContain('Homepage');
      expect(full).toContain('About content');
    });

    it('works with zero-config, inferring name from homepage h1', async () => {
      await writePageHtml('', 'Home - test.com', 'Welcome', '<h1>My Brand</h1><p>Hi</p>');
      await writePageHtml('about/', 'About - test.com', 'About page', '<h1>About</h1><p>Bio</p>');

      const { llmsTxt: idx } = await runIntegration(
        llmsTxt(),
        [{ pathname: '' }, { pathname: 'about/' }],
      );

      expect(idx).toContain('# My Brand');
      expect(idx).toContain('[My Brand]');
      expect(idx).toContain('[About]');
    });

    it('falls back to hostname when homepage has no title at all', async () => {
      const dir = join(tempDir, '');
      await mkdir(dir, { recursive: true });
      await writeFile(
        join(dir, 'index.html'),
        '<html><head><meta name="description" content="Welcome"></head><body><main><p>Hi</p></main></body></html>',
        'utf-8',
      );

      const { llmsTxt: idx } = await runIntegration(
        llmsTxt(),
        [{ pathname: '' }],
      );

      expect(idx).toContain('# test.com');
    });

    it('uses raw <title> when titleSource is title', async () => {
      await writePageHtml('', 'Home - My Brand', 'Welcome', '<h1>Home</h1><p>Hi</p>');

      const { llmsTxt: idx } = await runIntegration(
        llmsTxt({ name: 'My Brand', titleSource: 'title' }),
        [{ pathname: '' }],
      );

      expect(idx).toContain('[Home - My Brand]');
    });

    it('respects excludedPaths option', async () => {
      await writePageHtml('', 'Home', 'Welcome', '<h1>Home</h1><p>Hi</p>');
      await writePageHtml('admin/', 'Admin', 'Admin', '<h1>Admin</h1><p>Admin</p>');
      await writePageHtml('404/', '404', 'Not Found', '<h1>404</h1><p>404</p>');

      const { llmsTxt: idx } = await runIntegration(
        llmsTxt({ name: 'Test', excludedPaths: ['404', 'admin'] }),
        [{ pathname: '' }, { pathname: 'admin/' }, { pathname: '404/' }],
      );

      expect(idx).not.toContain('Admin');
      expect(idx).not.toContain('404');
      expect(idx).toContain('[Home]');
    });
  });
});

// -- astro add compatibility --

describe('astro add compatibility', () => {
  const pkgPath = join(
    dirname(fileURLToPath(import.meta.url)),
    '..',
    'package.json',
  );

  it('package.json has required astro-integration keyword', async () => {
    const pkg = JSON.parse(await readFile(pkgPath, 'utf-8'));
    expect(pkg.keywords).toContain('astro-integration');
  });

  it('package.json has withastro keyword for directory discovery', async () => {
    const pkg = JSON.parse(await readFile(pkgPath, 'utf-8'));
    expect(pkg.keywords).toContain('withastro');
  });

  it('default export is a callable that returns a valid integration', () => {
    expect(llmsTxt).toBeTypeOf('function');
    const integration = llmsTxt();
    expect(integration).toHaveProperty('name');
    expect(integration).toHaveProperty('hooks');
    expect(integration.hooks).toHaveProperty('astro:config:done');
    expect(integration.hooks).toHaveProperty('astro:build:done');
  });

  it('package.json exports "." entry point', async () => {
    const pkg = JSON.parse(await readFile(pkgPath, 'utf-8'));
    expect(pkg.exports['.']).toBeDefined();
  });
});
