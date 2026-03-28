# astro-kit

A collection of reusable [Astro](https://astro.build) integrations and components, published to npm as independent packages.

## Packages

| Package | Version | Description |
|---|---|---|
| [`@alexcarol/astro-llms-txt`](./packages/astro-llms-txt) | [![npm](https://img.shields.io/npm/v/@alexcarol/astro-llms-txt)](https://www.npmjs.com/package/@alexcarol/astro-llms-txt) | Generates `llms.txt` and `llms-full.txt` at build time |

## Getting started

Each package can be installed independently:

```bash
npm install @alexcarol/astro-llms-txt
```

Refer to the individual package README for usage instructions and configuration options.

## Contributing

### Prerequisites

- Node.js >= 22

### Setup

```bash
git clone https://github.com/alexcarol/astro-kit.git
cd astro-kit
npm install
```

### Running tests

```bash
# All packages
npm test

# Single package
npm test -w packages/astro-llms-txt
```

### Project structure

```
packages/
  astro-llms-txt/   # Astro integration for llms.txt generation
```

The monorepo uses [npm workspaces](https://docs.npmjs.com/cli/using-npm/workspaces). Each package under `packages/` is independently versioned and published.

### Releasing

Create a [GitHub Release](https://github.com/alexcarol/astro-kit/releases/new) with a tag in the format `<package>@<version>` (e.g. `astro-llms-txt@0.1.0`). The CI workflow verifies the version matches `package.json`, runs tests, and publishes to npm with `--provenance`.

## License

MIT
