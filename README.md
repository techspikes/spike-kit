# Spike Kit

[![Node.js CI](https://github.com/techspikes/spike-kit/actions/workflows/node.js.yml/badge.svg)](https://github.com/techspikes/spike-kit/actions/workflows/node.js.yml)

Specification and tools for agile teams to quickly sketch disposable data
stores for user stories.

Valuable Data Specification v1 is a YAML or JSON format for describing data this service
currently considers valuable enough to keep, based on customer
conversation and feedback. `reason` and `trace` make the document AI First by
giving AI enough context to understand why the data exists. The
`kysely-migration` and `table-spec` commands project the specification into implementation
and documentation artifacts. See
[docs/valuable-data-specification-v1.md](docs/valuable-data-specification-v1.md) for the full
specification.

A disposable YAML document written in the specification can be called a Data Sketch.
Stores with `tentative: true` are still tentative and need human review.

## Requirements

- Node.js 22 or later
- npm 10 or later

## Setup

```sh
npm install --save-dev git+https://github.com/techspikes/spike-kit.git
```

The CLI is installed as `shot`, named after the shot used when making espresso.

## Usage

```sh
shot check <file>
shot kysely-migration <file> --output <file>
shot table-spec <file> --output <file>
```

After installation, run the CLI through npm:

```sh
npx shot --help
```

The package also exposes a small library API for programmatic use:

```ts
import { check, kyselyMigration, tableSpec } from '@techspikes/spike-kit'
```

## Commands

### Validate a Data Sketch

```sh
npx shot check path/to/data-sketch.yaml
```

The command validates a Data Sketch and exits with
status `0` when it is valid.

### Generate a Kysely migration

```sh
npx shot kysely-migration path/to/data-sketch.yaml --output migrations/001_initial.ts
```

By default, the command generates an initial migration. To generate a diff
migration, pass a previously generated migration that contains an embedded
snapshot:

```sh
npx shot kysely-migration path/to/data-sketch.yaml \
  --previous-migration migrations/001_initial.ts \
  --output migrations/002_update.ts
```

Useful options:

- `--types-output <file.d.ts>` writes a `Database` declaration file.
- `--iso-prefix` prefixes the output file name with the current ISO timestamp.
- `--include-tentative` explicitly includes stores marked with `tentative: true`.
- `--dry-run` validates and renders without writing files.

### Generate Markdown table documentation

```sh
npx shot table-spec path/to/data-sketch.yaml --output docs/tables.md
```

## Data Sketch Example

```yaml
data-sketch: 1.0.0-draft.0

info:
  name: online-shop

sources:
  openapi: ./openapi.yaml

stores:
  customer:
    name: customers
    reason: Persist customer information.
    trace:
      operations:
        - createCustomer
        - getCustomer
    fields:
      id:
        name: id
        type:
          name: integer
        nullable: false
      name:
        name: name
        type:
          name: varchar
          length: 100
        nullable: false
        aliases:
          - customer full name
    keys:
      primary:
        name: pk_customers
        fields:
          - id
```

## Development

```sh
npm install
npm run build
npm run lint
npm test
npm run test:smoke
```

When working from this repository, run the built CLI with Node:

```sh
node dist/cli.mjs --help
```

`npm run build` updates `dist/cli.mjs`, `dist/index.mjs`, and
`dist/index.d.ts`. Because this project distributes bundled files, include the
affected `dist` files when source changes affect the CLI or library output.

## Documentation

- [Valuable Data Specification v1](docs/valuable-data-specification-v1.md)
- [`check` command specification](docs/shot-check-command-spec.md)
- [`kysely-migration` command specification](docs/shot-kysely-migration-command-spec.md)
- [`table-spec` command specification](docs/shot-table-spec-command-spec.md)
