# astro-kit

Monorepo for reusable Astro integrations and components, published to npm.

## Structure

```
packages/
  astro-llms-txt/   # Astro integration: generates llms.txt + llms-full.txt at build time
```

npm workspaces manage the monorepo. Each package under `packages/` is independently versioned and published.

## Commands

- `npm test` - run tests across all packages
- `npm test -w packages/astro-llms-txt` - run tests for a single package

## Releasing

Create a GitHub Release with a `<package>@<version>` tag (e.g. `astro-llms-txt@0.1.0`). Publishing the release triggers the npm publish workflow, which parses the tag, verifies the version matches `package.json`, runs tests, and publishes. Uses `--provenance` for supply chain transparency.

## Conventions

- ESM only (`"type": "module"` everywhere)
- Node >= 22 (CI tests on 22, 24, 25)
- Tests with vitest
- No build step needed - `.mjs` files publish directly
- No `package-lock.json` committed (library repo)
- Package keywords must include `astro-integration` and `withastro` for Astro integration directory discovery
