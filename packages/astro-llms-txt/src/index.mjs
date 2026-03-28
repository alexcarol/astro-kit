import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { parse } from 'node-html-parser';
import TurndownService from 'turndown';

const BOM = '\uFEFF';

const DEFAULT_EXCLUDED_PATHS = new Set(['404']);

const VALID_TITLE_SOURCES = new Set(['h1', 'title']);

const PARSE_OPTIONS = { comment: false, blockTextElements: { script: false, style: false } };

function elementText(el) {
  return el ? el.text.replace(/\s+/g, ' ').trim() : '';
}

/**
 * Convert an HTML element to clean Markdown using Turndown.
 * Strips scripts, styles, and aria-hidden elements before converting.
 */
export function htmlToMarkdown(node) {
  node.querySelectorAll('script, style, nav, [aria-hidden="true"], .page-header, .no-llms, img, picture, svg').forEach((el) => el.remove());

  const td = new TurndownService({
    headingStyle: 'atx',
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
  });

  let md = td.turndown(node.toString());
  md = md.replace(/\n{3,}/g, '\n\n').trim();
  return md;
}

/**
 * Read a built HTML file and extract its title, description, and main content as Markdown.
 *
 * @param {string} htmlPath - path to the HTML file
 * @param {'h1' | 'title'} titleSource - which element to use as the page title
 */
export async function extractPage(htmlPath, titleSource) {
  const html = await readFile(htmlPath, 'utf-8');
  const root = parse(html, PARSE_OPTIONS);

  let title = '';
  if (titleSource === 'h1') {
    title = elementText(root.querySelector('h1'));
  }
  if (!title) {
    title = elementText(root.querySelector('title'));
  }

  const descEl = root.querySelector('meta[name="description"]');
  const description = descEl ? descEl.getAttribute('content') ?? '' : '';

  const mainEl = root.querySelector('main');
  if (mainEl) {
    const h1 = mainEl.querySelector('h1');
    if (h1) h1.remove();
  }
  const content = mainEl ? htmlToMarkdown(mainEl) : '';

  return { title, description, content };
}

function formatHeader(name, homeDescription) {
  return [
    `# ${name}`,
    '',
    `> ${homeDescription}`,
    '',
  ];
}

/**
 * Format the extracted pages into llms.txt content (lightweight index).
 */
export function formatIndex(name, site, pages) {
  const homeDesc = pages.find((p) => p.pathname === '/')?.description ?? '';
  const lines = [
    ...formatHeader(name, homeDesc),
    '## Pages',
    '',
  ];

  for (const page of pages) {
    lines.push(
      `- [${page.title}](${site}${page.pathname}): ${page.description}`,
    );
  }
  lines.push('');

  return BOM + lines.join('\n');
}

/**
 * Format the extracted pages into llms-full.txt content (full content).
 */
export function formatFull(name, site, pages) {
  const homeDesc = pages.find((p) => p.pathname === '/')?.description ?? '';
  const lines = [...formatHeader(name, homeDesc)];

  for (const page of pages) {
    lines.push(
      `## [${page.title}](${site}${page.pathname})`,
      '',
      page.content,
      '',
    );
  }

  return BOM + lines.join('\n');
}

/**
 * Collect and sort pages from the Astro build output.
 *
 * @param {{ pathname: string }[]} builtPages - pages from Astro's build
 * @param {string} outDir - absolute path to the build output directory
 * @param {object} options
 * @param {Set<string>} options.excludedPaths
 * @param {'h1' | 'title'} options.titleSource
 * @param {{ warn: (msg: string) => void }} options.logger
 */
export async function collectPages(builtPages, outDir, { excludedPaths, titleSource, logger }) {
  const pagePromises = [];
  for (const { pathname } of builtPages) {
    const clean = pathname.replace(/\/$/, '');
    if (excludedPaths.has(clean)) continue;

    if (clean.includes('.')) continue;

    const htmlFile = join(outDir, pathname, 'index.html');
    const urlPath = `/${pathname}`;

    pagePromises.push(
      extractPage(htmlFile, titleSource)
        .then((data) => ({ pathname: urlPath, ...data }))
        .catch(() => {
          logger.warn(`Could not read ${htmlFile}, skipping`);
          return null;
        }),
    );
  }
  const pages = (await Promise.all(pagePromises)).filter(Boolean);

  pages.sort((a, b) => {
    if (a.pathname === '/') return -1;
    if (b.pathname === '/') return 1;
    return a.pathname.localeCompare(b.pathname);
  });

  return pages;
}

/**
 * Astro integration that generates `/llms.txt` and `/llms-full.txt` after build.
 *
 * @param {object} [options]
 * @param {string} [options.name] - Site name for the heading. Inferred from homepage h1 if omitted.
 * @param {'h1' | 'title'} [options.titleSource='h1'] - Which element to use as page titles.
 * @param {string[]} [options.excludedPaths=['404']] - Path segments to exclude.
 */
export default function llmsTxt(options = {}) {
  const excludedPaths = new Set(options.excludedPaths ?? DEFAULT_EXCLUDED_PATHS);
  const titleSource = options.titleSource ?? 'h1';

  if (!VALID_TITLE_SOURCES.has(titleSource)) {
    throw new Error(
      `[llms-txt] Invalid \`titleSource\`: "${titleSource}". Must be "h1" or "title".`,
    );
  }

  let site = '';
  let name = options.name ?? '';

  return {
    name: 'llms-txt',
    hooks: {
      'astro:config:done': ({ config, logger }) => {
        if (!config.site) {
          throw new Error(
            '[llms-txt] The `site` option must be set in your Astro config. ' +
            'llms.txt requires absolute URLs. ' +
            'Example: defineConfig({ site: "https://example.com" })',
          );
        }
        site = config.site.replace(/\/$/, '');
        logger.info(`Using site: ${site}`);
      },

      'astro:build:done': async ({ dir, pages: builtPages, logger }) => {
        const outDir = fileURLToPath(dir);

        const pages = await collectPages(builtPages, outDir, {
          excludedPaths,
          titleSource,
          logger,
        });

        if (!name) {
          const homepage = pages.find((p) => p.pathname === '/');
          if (homepage?.title) {
            name = homepage.title;
            logger.info(`Using homepage <h1> as name: "${name}"`);
          } else {
            name = new URL(site).hostname.replace(/^www\./, '');
            logger.info(`No homepage <h1> found, using hostname: "${name}"`);
          }
        }

        const llmsTxtContent = formatIndex(name, site, pages);
        const llmsFullContent = formatFull(name, site, pages);

        const llmsTxtPath = join(outDir, 'llms.txt');
        const llmsFullPath = join(outDir, 'llms-full.txt');
        await Promise.all([
          writeFile(llmsTxtPath, llmsTxtContent, 'utf-8'),
          writeFile(llmsFullPath, llmsFullContent, 'utf-8'),
        ]);
        logger.info(`Generated llms.txt and llms-full.txt (${pages.length} pages)`);
      },
    },
  };
}
