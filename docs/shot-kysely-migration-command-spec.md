# `shot kysely-migration` Subcommand Specification

## Purpose

The `kysely-migration` subcommand generates a Kysely-compatible TypeScript initial migration or diff migration from a valid Valuable Data Specification v1 YAML or JSON document.

## Command

```text
shot kysely-migration <file> --output <output-file>
shot kysely-migration <file> -o <output-file>
shot kysely-migration <file> --output <output-file> --iso-prefix
shot kysely-migration <file> --output <output-file> --types-output <types-file.d.ts>
shot kysely-migration <file> --output <output-file> --include-tentative
shot kysely-migration <file> --output <output-file> --dry-run
shot kysely-migration <file> --previous-migration <previous-migration-file> --output <output-file>
shot kysely-migration <file> -p <previous-migration-file> --output <output-file>
shot kysely-migration --help
shot kysely-migration -h
```

- `<file>` is the path to a Valuable Data Specification v1 YAML or JSON file.
- `--output` and `-o` write one generated UTF-8 TypeScript migration file. An existing file is overwritten.
- `--previous-migration` and `-p` read an embedded `DB Projection Snapshot` from a previously generated migration file and generate a diff migration against the current Data Sketch snapshot. Without either option, the command generates an initial migration.
- `--iso-prefix` prefixes the output basename with `new Date().toISOString()` and `_`, preserving the output directory.
- `--types-output` writes a separate TypeScript declaration file containing `export interface Database`. The path must end with `.d.ts`.
- In diff migration mode, `--types-output` renders the type file from the post-diff snapshot.
- `--include-tentative` explicitly includes stores marked with `tentative: true`.
- Without `--include-tentative`, stores marked with `tentative: true` are treated as non-viable for migration output, excluded from the projection, and reported as warnings.
- `--dry-run` performs read, parse, validation, snapshot projection, previous snapshot reading, warning collection, and render validation, but writes no files.
- `--help` and `-h` write command usage to standard output and exit with status `0`.
- The command exits with status `0` after successful generation or dry-run validation.
- No partial migration or type file is written when an error occurs.

## DB Projection Snapshot

`DB Projection Snapshot` is an intermediate JSON model that extracts and normalizes only the information needed for DB-oriented projection from the Valuable Data Specification.

For migration generation, `kysely-migration` treats stores marked with `tentative: true` as non-viable for default output.

The `kysely-migration` subcommand projects the abstract Valuable Data Specification model into a relational database model:

- each Data Sketch `store` becomes a table
- each Data Sketch `field` becomes a column in that table
- `store.name` becomes the physical table name
- `field.name` becomes the physical column name
- Data Sketch `stores` and `fields` map keys become stable logical IDs in the snapshot

The snapshot contains only DDL-relevant information after that projection:

- tables
- columns
- store logical IDs
- field logical IDs
- SQL92 type metadata
- nullable flags
- literal default values
- primary keys
- unique constraints
- foreign keys
- normal indexes
- enum-derived check constraint intent

The snapshot does not contain stores marked with `tentative: true` unless `--include-tentative` is set. It also does not contain non-DDL fields such as `info`, `sources`, `reason`, `trace`, `format`, or `aliases`.

The snapshot is generated from a validated `Specification` value. Data Sketch parsing and validation failures are reported before snapshot generation.

`field.enum` is preserved as check constraint intent in the snapshot. The `kysely-migration` subcommand does not render check constraints; it emits a warning and ignores them in generated migration files.

`DbProjectionSnapshot` contains `data-sketch/db-projection-snapshot: 1.0.0-draft.0`. When the `kysely-migration` subcommand reads an embedded snapshot as diff input, it accepts only snapshots with that identifier.

## Diff Migration

A diff migration compares the embedded snapshot in the migration file passed to `--previous-migration` as the before snapshot with the snapshot generated from the current Data Sketch as the after snapshot.

Diff comparison covers:

- table additions and deletions
- column additions, deletions, type changes, nullable changes, and default changes
- primary key additions, deletions, and changes
- unique constraint additions, deletions, and changes
- foreign key additions, deletions, and changes
- normal index additions, deletions, and changes

The command does not infer renames. It treats Data Sketch map keys for stores and fields as stable logical IDs, and generates table or column renames only when the same logical ID has a different physical name.

To request a data-preserving physical rename in a diff migration, keep the Data Sketch map key unchanged and change only the relevant `name` value.

- If the before and after snapshots contain the same table `id` with different `name` values, the command generates a table rename.
- If the same table `id` contains the same column `id` with different `name` values, the command generates a column rename.
- If the logical ID changes, the command does not treat the change as a rename, even when physical names or structure look similar.
- Constraints and indexes have no logical IDs, so name changes are treated as deletions plus additions.
- A snapshot with the supported `data-sketch/db-projection-snapshot` identifier but missing table or column `id` values is rejected as diff input.

Potentially destructive diffs, including deletions, column type changes, nullable changes, and default changes, are generated without an additional opt-in flag. `up` moves from the before snapshot to the after snapshot. `down` moves from the after snapshot back to the before snapshot.

The diff migration metadata block embeds the after snapshot.

Diff migration operation order is fixed:

1. Drop indexes, foreign keys, unique constraints, and primary keys that are removed or changed.
2. Rename tables and columns.
3. Drop removed tables and columns.
4. Alter existing column type, nullable, and default definitions.
5. Add new tables and columns.
6. Add new or changed primary keys, unique constraints, and foreign keys.
7. Add new or changed indexes.

`down` renders the same diff in the opposite direction, returning from the after snapshot to the before snapshot.

Enum-derived check constraints are not rendered, matching initial migration behavior. Diff migration ignores check constraint diffs in generated migration files and emits warnings for the relevant check constraint intent.

### Snapshot JSON Structure

```ts
type DbProjectionSnapshot = {
  'data-sketch/db-projection-snapshot': '1.0.0-draft.0'
  tables: SnapshotTable[]
}

type SnapshotTable = {
  id: string
  name: string
  columns: SnapshotColumn[]
  primaryKey?: SnapshotNamedColumns
  uniqueConstraints: SnapshotNamedColumns[]
  foreignKeys: SnapshotForeignKey[]
  indexes: SnapshotIndex[]
  checkConstraints: SnapshotCheckConstraint[]
}

type SnapshotColumn = {
  id: string
  name: string
  type: SnapshotColumnType
  nullable: boolean
  default: { kind: 'omitted' } | { kind: 'literal'; value: string | number | boolean | null }
}

type SnapshotColumnType = {
  name: 'integer' | 'smallint' | 'boolean' | 'char' | 'varchar' | 'decimal' | 'numeric' | 'date' | 'time' | 'timestamp'
  length?: number
  precision?: number
  scale?: number
}

type SnapshotNamedColumns = {
  name: string
  columns: string[]
}

type SnapshotForeignKey = {
  name: string
  columns: string[]
  references: {
    table: string
    columns: string[]
  }
  onDelete?: 'restrict' | 'cascade' | 'setNull' | 'setDefault' | 'noAction'
  onUpdate?: 'restrict' | 'cascade' | 'setNull' | 'setDefault' | 'noAction'
}

type SnapshotIndex = {
  name: string
  columns: SnapshotIndexColumn[]
}

type SnapshotIndexColumn = {
  name: string
  order?: 'asc' | 'desc'
}

type SnapshotCheckConstraint = {
  name: string
  kind: 'enum'
  column: string
  values: string[]
}
```

Rules:

- `version` is the snapshot format version, not the Valuable Data Specification version.
- Definition order is preserved.
- Table and column `id` values use logical Data Sketch map keys. Keeping those IDs stable across physical name changes is what makes diff rendering produce data-preserving table and column renames.
- Table and column references use resolved physical names.
- Empty collections are represented as empty arrays.
- Optional single objects, such as `primaryKey`, are omitted when absent.
- `default.kind` distinguishes omitted defaults from explicit `default: null`.
- Enum check constraint names are generated as `ck_<table>_<column>_enum`.

## Embedded Snapshot

Generated migration files and generated type files contain the same embedded `DB Projection Snapshot` metadata block.

The embedded representation is:

1. JSON serialize the snapshot.
2. gzip the JSON bytes.
3. base64 encode the gzip bytes.
4. write the base64 text as a wrapped `payload` value in a line-commented YAML-style front matter block.

```ts
// ---
// data-sketch/embedded-db-projection-snapshot: 1.0.0-draft.0
// generated_at: 2026-06-06T12:34:56.789Z
// payload: |
//   <base64 chunk>
//   <base64 chunk>
// ---
```

`payload` lines should be wrapped at 76 base64 characters. `generated_at` is a UTC ISO 8601 timestamp. `data-sketch/embedded-db-projection-snapshot` is the fixed embedded snapshot metadata identifier. Version `1.0.0-draft.0` uses gzip+base64 as its fixed payload encoding.

`data-sketch/embedded-db-projection-snapshot` and `generated_at` are metadata block fields and are not included in the snapshot JSON.

Snapshot readers used by diff generation must not depend on the metadata block being at the beginning of the file or on metadata keys appearing in the generated order. They scan the full source for line-commented YAML front matter blocks delimited by `// ---`, strip the leading `// ` comment marker, and parse each candidate block as YAML. The first block with `data-sketch/embedded-db-projection-snapshot: 1.0.0-draft.0` and a string `payload` value is the embedded DB projection snapshot. Other comments or unrelated comment front matter blocks before or after the metadata block are ignored.

## Output

The generated migration file imports Kysely as a type, defines a local non-exported `MigrationDatabase`, and exports `up` and `down`.

```ts
import type { Kysely } from 'kysely'

interface MigrationDatabase {
  'customers': {
    'id': number
  }
}

export async function up(db: Kysely<MigrationDatabase>): Promise<void> {
  await db.schema
    .createTable('customers')
    .addColumn('id', 'integer', column => column.notNull())
    .execute()
}

export async function down(db: Kysely<MigrationDatabase>): Promise<void> {
  await db.schema.dropTable('customers').execute()
}
```

The generated `--types-output` declaration file exports an application-facing type for `new Kysely<Database>()`.

```ts
export interface Database {
  'customers': {
    'id': number
  }
}
```

Type mapping:

- `integer`, `smallint`, `decimal`, `numeric` -> `number`
- `boolean` -> `boolean`
- `char`, `varchar`, `date`, `time`, `timestamp` -> `string`
- nullable columns add `| null`
- defaults do not make properties optional

## Warnings

Warnings are written with progress output and do not change the exit code.

- `Tentative store excluded from migration: <table>`
- `Enum check constraint ignored by migration renderer: <table>.<column>`

## Progress Output

The command is non-interactive and does not prompt for input.

Successful file generation reports:

```text
Data Sketch read
Validating Data Sketch
Creating DB projection snapshot
Rendering migration
Migration written
Type definitions written
Migration generated
```

`Type definitions written` is emitted only when `--types-output` is used.

Successful diff migration generation also reports these steps after reading the file passed to `--previous-migration` or `-p`:

```text
Previous migration read
Previous DB projection snapshot parsed
```

Successful dry-run reports:

```text
Data Sketch read
Validating Data Sketch
Creating DB projection snapshot
Rendering migration
Dry run completed
```

Argument errors write `Error: <reason>`, a blank line, and usage text to standard error.

## SQL and Kysely Compatibility

Generated migrations target SQL92-compatible DDL through Kysely schema builder APIs.

The command does not use Kysely's `sql` template tag and does not support database-specific dialect syntax. Ordered index fields are rejected because portable Kysely schema builder output cannot express them without raw SQL or dialect-specific behavior.

The DB Projection Snapshot and generated type definitions may contain every Valuable Data Specification v1 type, including the practical SQL92 exception `boolean`, but generated migration files are limited to Kysely `ColumnDataType` values that can be passed to `db.schema.createTable().addColumn(...)` without raw SQL. Unsupported Kysely column types are rejected during rendering. In this version, precision-only `numeric(<precision>)` is rejected by the kysely-migration command.

Diff migrations also generate only DDL that can be represented through Kysely schema builder APIs. Diffs that cannot be expressed portably through Kysely schema builder are rejected during rendering.

Production usage assumes migration execution through `kysely-ctl`. Project tests execute generated migrations directly through the `kysely` package's `Migrator`.
