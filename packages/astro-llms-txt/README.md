# astro-llms-txt

Astro integration that generates [`llms.txt`](https://llmstxt.org/) and `llms-full.txt` at build
time by reading your rendered HTML output.

- **`llms.txt`** - a lightweight index of all pages with links and descriptions
- **`llms-full.txt`** - the full text content of every page

## Install

```bash
npx astro add @alexcarol/astro-llms-txt
```

> **Note:** `astro add` will auto-generate the import name `alexcarolllmsTxt` from the scoped
> package name. You may want to rename it to `llmsTxt` for readability.

Or install manually:

```bash
npm install @alexcarol/astro-llms-txt
```

## Quick start

If you used `astro add`, your config is already set up. Otherwise, add the integration manually:

```js
// astro.config.mjs
import { defineConfig } from 'astro/config';
import llmsTxt from '@alexcarol/astro-llms-txt';

export default defineConfig({
  site: 'https://example.com', // required
  integrations: [llmsTxt()],
});
```

That's it. With no options the integration will:

1. Use the homepage `<h1>` as the `# heading` (falls back to hostname)
2. Use `<h1>` text as page titles (falls back to `<title>` if no `<h1>` is present)
3. Exclude `/404` pages
4. Extract content from `<main>`, descriptions from `<meta name="description">`

## Options

All options are optional.

| Option | Type | Default | Description |
|---|---|---|---|
| `name` | `string` | homepage `<h1>`, then hostname | Site or brand name used as the `# heading` in generated files. |
| `titleSource` | `'h1'` \| `'title'` | `'h1'` | Which HTML element to read page titles from. `'h1'` uses the first `<h1>` (falls back to `<title>`). `'title'` uses the raw `<title>` tag text. |
| `excludedPaths` | `string[]` | `['404']` | Path segments to exclude. Matched without leading/trailing slashes (e.g. `'admin'` excludes `/admin/`). |

## Examples

```js
// Zero-config
llmsTxt()

// Explicit name (recommended for personal/brand sites)
llmsTxt({ name: 'Alex Carol' })

// Use raw <title> tags instead of <h1>
llmsTxt({ name: 'My Site', titleSource: 'title' })

// Custom exclusions
llmsTxt({ name: 'My Site', excludedPaths: ['404', 'admin', 'drafts'] })
```

## Title source

The `titleSource` option controls where page titles come from:

- **`'h1'` (default)** - reads the first `<h1>` on the page. This avoids the common
  "Page Title - Site Name" suffix pattern in `<title>` tags, producing cleaner output.
  Falls back to `<title>` if no `<h1>` is found.
- **`'title'`** - reads the raw `<title>` tag, including any site name suffix.

Most static sites use an `<h1>` that matches the clean page name, so the default works
without configuration.

## How it works

The integration hooks into two Astro lifecycle events:

1. **`astro:config:done`** - validates that `site` is set in your Astro config (throws if
   missing).

2. **`astro:build:done`** - reads each built `index.html` in parallel, extracts page data,
   infers the site name from the homepage `<h1>` if not provided, then writes both output
   files.

Pages are sorted with the homepage first, then alphabetically by path.

## Output format

Follows the [llms.txt specification](https://llmstxt.org/):

**`llms.txt`**
```
# Site Name

> Homepage description from meta tag

## Pages

- [Home](https://example.com/): Homepage description
- [About](https://example.com/about/): About page description
```

**`llms-full.txt`**
```
# Site Name

> Homepage description from meta tag

## [Home](https://example.com/)

Full text content of the homepage...

## [About](https://example.com/about/)

Full text content of the about page...
```

## Requirements

- `site` must be set in your Astro config (the integration throws a clear error if missing)
- Pages should use `<main>` for primary content
- Pages should have `<meta name="description">` for summaries
- For the default `titleSource: 'h1'`, pages should have an `<h1>` element

## License

MIT
