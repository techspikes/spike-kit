import assert from 'node:assert/strict'
import {
  access,
  mkdir,
  readdir,
  readFile,
  rm,
  writeFile
} from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { afterEach, describe, it } from 'node:test'
import { pathToFileURL } from 'node:url'
import { gunzipSync, gzipSync } from 'node:zlib'
import { PGlite } from '@electric-sql/pglite'
import { load } from 'js-yaml'
import { Kysely, PGliteDialect } from 'kysely'
import {
  type MigrationProvider,
  Migrator,
  NO_MIGRATIONS
} from 'kysely/migration'
import { runSteps } from '../../../src/commands/kysely-migration/index.ts'
import { shot } from '../../../src/commands/kysely-migration/lib.ts'
import { parseSpecification } from '../../../src/core/parser.ts'
import {
  createDbProjectionSnapshot,
  type DbProjectionSnapshot,
  dataSketchVersion,
  dbProjectionSnapshotIdentifier
} from '../../../src/core/projector.ts'
import { validateSpecification } from '../../../src/core/validator.ts'
import {
  createTemporaryDirectory,
  fixturePath,
  runCommand
} from '../../helper.ts'

const fixedGeneratedAt = '2026-06-06T12:34:56.789Z'
const temporaryDirectories: string[] = []

async function parseSpecificationFile(path: string): Promise<unknown> {
  const source = await readFile(path, 'utf8')

  return parseSpecification(source)
}

async function runKyselyMigrationCli(args: string[]) {
  return runCommand(() => runSteps(args))
}

async function runMigrationShot(
  fixtureName: string,
  options: {
    includeTentative?: boolean
    previousMigrationSource?: string
    renderMode?: 'migration' | 'databaseTypes' | 'migrationAndDatabaseTypes'
  } = {}
) {
  const source = await readText(fixtureName)

  return shot({
    source,
    sourceName: fixturePath(import.meta.url, fixtureName),
    previousMigrationSource: options.previousMigrationSource,
    includeTentative: options.includeTentative === true,
    generatedAt: fixedGeneratedAt,
    renderMode: options.renderMode
  })
}

function requiredOutput(output: string | undefined, name: string) {
  if (output === undefined) throw new Error(`${name} is missing`)
  return output
}

afterEach(async () => {
  const directories = temporaryDirectories.splice(0)
  await Promise.all(
    directories.map(directory =>
      rm(directory, { recursive: true, force: true })
    )
  )
})

describe('kysely-migration', () => {
  describe('argument handling', () => {
    it('prints kysely-migration usage for --help', async () => {
      const result = await runKyselyMigrationCli(['--help'])

      assert.equal(result.isFailed, false)
      assert.match(result.stdout, /--output/)
      assert.match(result.stdout, /--previous-migration/)
      assert.match(result.stdout, /-p/)
      assert.match(result.stdout, /--types-output/)
      assert.match(result.stdout, /--dry-run/)
      assert.equal(result.stderr, '')
    })

    it('prints kysely-migration usage for -h', async () => {
      const result = await runKyselyMigrationCli(['-h'])

      assert.equal(result.isFailed, false)
      assert.match(result.stdout, /--output/)
      assert.match(result.stdout, /--previous-migration/)
      assert.match(result.stdout, /-p/)
      assert.match(result.stdout, /--types-output/)
      assert.match(result.stdout, /--dry-run/)
      assert.equal(result.stderr, '')
    })

    it('logs option errors without progress output', async () => {
      const result = await runKyselyMigrationCli([])

      assert.equal(result.isFailed, true)
      assert.match(result.error.message, /--output/)
      assert.match(result.stderr, /--output/)
    })

    it('reports a type definition output path without the d.ts extension', async () => {
      const result = await runKyselyMigrationCli([
        fixturePath(import.meta.url, 'online-shop-initial.valid.yaml'),
        '--output',
        'initial.ts',
        '--types-output',
        'database.ts'
      ])

      assert.equal(result.isFailed, true)
      assert.match(result.error.message, /--types-output must end with \.d\.ts/)
    })

    it('reports migration argument parse errors for unknown options', async () => {
      const result = await runKyselyMigrationCli([
        fixturePath(import.meta.url, 'online-shop-initial.valid.yaml'),
        '--output',
        'initial.ts',
        '--unknown'
      ])

      assert.equal(result.isFailed, true)
      assert.match(result.error.message, /Unknown option/)
      assert.match(result.stderr, /Usage:/)
    })
  })

  describe('rendering and snapshot metadata', () => {
    it('renders a TypeScript migration with a non-exported migration database type and embedded snapshot', async () => {
      const { snapshot, migrationSource: output } = await runMigrationShot(
        'online-shop-initial.valid.yaml'
      )
      const migration = requiredOutput(output, 'migration source')
      const embedded = parseEmbeddedSnapshot(migration)
      const expected = await readText(
        'expected/online-shop-initial.migration.ts'
      )

      assert.deepEqual(embedded, snapshot)
      assert.equal(migration, expected)
    })

    it('renders exported Database type definitions for application Kysely usage', async () => {
      const { snapshot, databaseTypesSource: output } = await runMigrationShot(
        'online-shop-initial.valid.yaml',
        { renderMode: 'databaseTypes' }
      )
      const types = requiredOutput(output, 'database types source')
      const embedded = parseEmbeddedSnapshot(types)
      const expected = await readText(
        'expected/online-shop-initial.database.d.ts'
      )

      assert.deepEqual(embedded, snapshot)
      assert.equal(types, expected)
    })

    it('generates database type definitions from source text', async () => {
      const source = await readText('online-shop-initial.valid.yaml')

      const result = await shot({
        source,
        includeTentative: false,
        generatedAt: fixedGeneratedAt,
        renderMode: 'databaseTypes'
      })

      assert.match(
        result.databaseTypesSource ?? '',
        /export interface Database/
      )
      assert.equal(result.spec.info.name, 'online-shop')
      assert.deepEqual(result.previousSnapshot, undefined)
    })

    it('renders type definitions for defaults and nullable columns but rejects unsupported Kysely column types in migration output', async () => {
      const { databaseTypesSource: types } = await runMigrationShot(
        'online-shop-rendering-branches.valid.yaml',
        { renderMode: 'databaseTypes' }
      )
      const databaseTypes = requiredOutput(types, 'database types source')

      await assert.rejects(
        runMigrationShot('online-shop-rendering-branches.valid.yaml'),
        /Column type is not supported by the kysely-migration command: products\.rating numeric\(3\)/
      )
      assert.match(databaseTypes, /"active": boolean/)
      assert.match(databaseTypes, /"rating": number \| null/)
      assert.match(databaseTypes, /"notes": string \| null/)
    })

    it('renders defaults, nullable columns, SQL type arguments, and referential actions for Kysely-supported column types', async () => {
      const { migrationSource: migration } = await runMigrationShot(
        'online-shop-kysely-supported-rendering-branches.valid.yaml'
      )
      const output = requiredOutput(migration, 'migration source')

      assert.match(output, /defaultTo\(0\)/)
      assert.match(output, /defaultTo\(0\.5\)/)
      assert.match(output, /defaultTo\(null\)/)
      assert.match(output, /defaultTo\("available"\)/)
      assert.match(output, /defaultTo\(true\)/)
      assert.match(output, /"decimal\(18, 2\)"/)
      assert.match(output, /"numeric\(3, 0\)"/)
      assert.match(output, /"boolean"/)
      assert.match(output, /onDelete\("set null"\)/)
      assert.match(output, /onUpdate\("set default"\)/)
      assert.match(output, /onDelete\("no action"\)/)
    })

    it('returns rendered output when warnings are present', async () => {
      const source = await readText('online-shop-enum-warning.valid.yaml')

      const result = await shot({
        source,
        sourceName: fixturePath(
          import.meta.url,
          'online-shop-enum-warning.valid.yaml'
        ),
        includeTentative: false,
        generatedAt: fixedGeneratedAt
      })

      assert.match(result.migrationSource ?? '', /export async function up/)
      assert.equal(result.warnings.length, 1)
    })

    it('returns warnings for enum check constraints', async () => {
      const source = await readText('online-shop-enum-warning.valid.yaml')

      const result = await shot({
        source,
        sourceName: fixturePath(
          import.meta.url,
          'online-shop-enum-warning.valid.yaml'
        ),
        includeTentative: false,
        generatedAt: fixedGeneratedAt
      })

      assert.deepEqual(
        result.warnings.map(warning => warning.message),
        ['Enum check constraint ignored by migration renderer: orders.status']
      )
    })

    it('reports invalid embedded DB projection snapshot comments', () => {
      assert.throws(
        () => parseEmbeddedSnapshot('// not a snapshot\n'),
        /DB Projection Snapshot comment is missing/
      )
      assert.throws(
        () =>
          parseEmbeddedSnapshot(
            '// ---\n// data-sketch/embedded-db-projection-snapshot: 1.0.0-draft.0'
          ),
        /DB Projection Snapshot comment is missing/
      )
      assert.throws(
        () =>
          parseEmbeddedSnapshot(
            [
              '// ---',
              '// data-sketch/embedded-db-projection-snapshot: 1.0.0-draft.0',
              `// generated_at: ${fixedGeneratedAt}`,
              '// ---'
            ].join('\n')
          ),
        /DB Projection Snapshot payload is missing/
      )
      assert.throws(
        () =>
          parseEmbeddedSnapshot(
            renderEmbeddedSnapshot(
              {
                'data-sketch/db-projection-snapshot': '2.0.0',
                tables: []
              } as never,
              fixedGeneratedAt
            )
          ),
        /DB Projection Snapshot identifier is not supported: expected data-sketch\/db-projection-snapshot: 1.0.0-draft.0/
      )
      assert.throws(
        () =>
          parseEmbeddedSnapshot(
            renderEmbeddedSnapshot(
              {
                'data-sketch/db-projection-snapshot': '1.0.0-draft.0',
                tables: [{ name: 'customers', columns: [] }]
              } as never,
              fixedGeneratedAt
            )
          ),
        /DB Projection Snapshot table id is missing: 0/
      )
      assert.throws(
        () =>
          parseEmbeddedSnapshot(
            renderEmbeddedSnapshot(null as never, fixedGeneratedAt)
          ),
        /DB Projection Snapshot must be an object/
      )
      assert.throws(
        () =>
          parseEmbeddedSnapshot(
            renderEmbeddedSnapshot(
              {
                'data-sketch/db-projection-snapshot': '1.0.0-draft.0',
                tables: 'customers'
              } as never,
              fixedGeneratedAt
            )
          ),
        /DB Projection Snapshot table-spec must be an array/
      )
      assert.throws(
        () =>
          parseEmbeddedSnapshot(
            renderEmbeddedSnapshot(
              {
                'data-sketch/db-projection-snapshot': '1.0.0-draft.0',
                tables: [null]
              } as never,
              fixedGeneratedAt
            )
          ),
        /DB Projection Snapshot table must be an object: 0/
      )
      assert.throws(
        () =>
          parseEmbeddedSnapshot(
            renderEmbeddedSnapshot(
              {
                'data-sketch/db-projection-snapshot': '1.0.0-draft.0',
                tables: [{ id: 'customer', columns: [] }]
              } as never,
              fixedGeneratedAt
            )
          ),
        /DB Projection Snapshot table name is missing: customer/
      )
      assert.throws(
        () =>
          parseEmbeddedSnapshot(
            renderEmbeddedSnapshot(
              {
                'data-sketch/db-projection-snapshot': '1.0.0-draft.0',
                tables: [{ id: 'customer', name: 'customers', columns: 'id' }]
              } as never,
              fixedGeneratedAt
            )
          ),
        /DB Projection Snapshot table columns must be an array: customer/
      )
      assert.throws(
        () =>
          parseEmbeddedSnapshot(
            renderEmbeddedSnapshot(
              {
                'data-sketch/db-projection-snapshot': '1.0.0-draft.0',
                tables: [{ id: 'customer', name: 'customers', columns: [null] }]
              } as never,
              fixedGeneratedAt
            )
          ),
        /DB Projection Snapshot column must be an object: customer\.0/
      )
      assert.throws(
        () =>
          parseEmbeddedSnapshot(
            renderEmbeddedSnapshot(
              {
                'data-sketch/db-projection-snapshot': '1.0.0-draft.0',
                tables: [
                  {
                    id: 'customer',
                    name: 'customers',
                    columns: [{ name: 'id' }]
                  }
                ]
              } as never,
              fixedGeneratedAt
            )
          ),
        /DB Projection Snapshot column id is missing: customer\.0/
      )
      assert.throws(
        () =>
          parseEmbeddedSnapshot(
            renderEmbeddedSnapshot(
              {
                'data-sketch/db-projection-snapshot': '1.0.0-draft.0',
                tables: [
                  {
                    id: 'customer',
                    name: 'customers',
                    columns: [{ id: 'id' }]
                  }
                ]
              } as never,
              fixedGeneratedAt
            )
          ),
        /DB Projection Snapshot column name is missing: customer\.id/
      )
    })

    it('rejects invalid previous migration snapshots through shot', async () => {
      const source = await readText('online-shop-initial.valid.yaml')
      const invalidSources = [
        ['// not a snapshot\n', /DB Projection Snapshot comment is missing/],
        [
          '// ---\n// data-sketch/embedded-db-projection-snapshot: 1.0.0-draft.0',
          /DB Projection Snapshot comment is missing/
        ],
        [
          [
            '// ---',
            '// data-sketch/embedded-db-projection-snapshot: 1.0.0-draft.0',
            `// generated_at: ${fixedGeneratedAt}`,
            '// ---'
          ].join('\n'),
          /DB Projection Snapshot payload is missing/
        ],
        [
          renderEmbeddedSnapshot(
            {
              'data-sketch/db-projection-snapshot': '2.0.0',
              tables: []
            } as never,
            fixedGeneratedAt
          ),
          /DB Projection Snapshot identifier is not supported: expected data-sketch\/db-projection-snapshot: 1.0.0-draft.0/
        ],
        [
          renderEmbeddedSnapshot(null as never, fixedGeneratedAt),
          /DB Projection Snapshot must be an object/
        ],
        [
          renderEmbeddedSnapshot(
            {
              'data-sketch/db-projection-snapshot': '1.0.0-draft.0',
              tables: 'customers'
            } as never,
            fixedGeneratedAt
          ),
          /DB Projection Snapshot table-spec must be an array/
        ],
        [
          renderEmbeddedSnapshot(
            {
              'data-sketch/db-projection-snapshot': '1.0.0-draft.0',
              tables: [null]
            } as never,
            fixedGeneratedAt
          ),
          /DB Projection Snapshot table must be an object: 0/
        ],
        [
          renderEmbeddedSnapshot(
            {
              'data-sketch/db-projection-snapshot': '1.0.0-draft.0',
              tables: [{ name: 'customers', columns: [] }]
            } as never,
            fixedGeneratedAt
          ),
          /DB Projection Snapshot table id is missing: 0/
        ],
        [
          renderEmbeddedSnapshot(
            {
              'data-sketch/db-projection-snapshot': '1.0.0-draft.0',
              tables: [{ id: 'customer', columns: [] }]
            } as never,
            fixedGeneratedAt
          ),
          /DB Projection Snapshot table name is missing: customer/
        ],
        [
          renderEmbeddedSnapshot(
            {
              'data-sketch/db-projection-snapshot': '1.0.0-draft.0',
              tables: [{ id: 'customer', name: 'customers', columns: 'id' }]
            } as never,
            fixedGeneratedAt
          ),
          /DB Projection Snapshot table columns must be an array: customer/
        ],
        [
          renderEmbeddedSnapshot(
            {
              'data-sketch/db-projection-snapshot': '1.0.0-draft.0',
              tables: [{ id: 'customer', name: 'customers', columns: [null] }]
            } as never,
            fixedGeneratedAt
          ),
          /DB Projection Snapshot column must be an object: customer\.0/
        ],
        [
          renderEmbeddedSnapshot(
            {
              'data-sketch/db-projection-snapshot': '1.0.0-draft.0',
              tables: [
                {
                  id: 'customer',
                  name: 'customers',
                  columns: [{ name: 'id' }]
                }
              ]
            } as never,
            fixedGeneratedAt
          ),
          /DB Projection Snapshot column id is missing: customer\.0/
        ],
        [
          renderEmbeddedSnapshot(
            {
              'data-sketch/db-projection-snapshot': '1.0.0-draft.0',
              tables: [
                {
                  id: 'customer',
                  name: 'customers',
                  columns: [{ id: 'id' }]
                }
              ]
            } as never,
            fixedGeneratedAt
          ),
          /DB Projection Snapshot column name is missing: customer\.id/
        ]
      ] as const

      for (const [previousMigrationSource, expected] of invalidSources) {
        await assert.rejects(
          shot({
            source,
            sourceName: fixturePath(
              import.meta.url,
              'online-shop-initial.valid.yaml'
            ),
            previousMigrationSource,
            includeTentative: false,
            generatedAt: fixedGeneratedAt
          }),
          expected
        )
      }
    })

    it('renders a diff migration with logical ID based table and column renames', async () => {
      const after = await createSnapshot(
        'online-shop-diff-customer-rename.valid.yaml'
      )
      const { migrationSource: previousMigrationSource } =
        await runMigrationShot('online-shop-initial.valid.yaml')
      if (previousMigrationSource === undefined) {
        throw new Error('previous migration source is missing')
      }
      const { migrationSource: output } = await runMigrationShot(
        'online-shop-diff-customer-rename.valid.yaml',
        { previousMigrationSource }
      )
      if (output === undefined) {
        throw new Error('migration source is missing')
      }

      assert.deepEqual(parseEmbeddedSnapshot(output), after)
      assert.match(output, /renameTo\("shop_customers"\)/)
      assert.match(output, /renameColumn\("public_id", "customer_public_id"\)/)
      assert.match(output, /renameColumn\("name", "display_name"\)/)
      assert.match(output, /setDataType\("varchar\(120\)"\)/)
      assert.match(output, /dropNotNull\(\)/)
      assert.match(output, /setDefault\(null\)/)
      assert.doesNotMatch(output, /dropTable\("customers"\)/)

      assert.match(output, /generated_at:/)
    })

    it('renders table and column additions and deletions in diff migration up and down paths', async () => {
      const { migrationSource: previousMigrationSource } =
        await runMigrationShot('online-shop-initial.valid.yaml')
      if (previousMigrationSource === undefined) {
        throw new Error('previous migration source is missing')
      }
      const { migrationSource: output } = await runMigrationShot(
        'online-shop-tentative-store.valid.yaml',
        { previousMigrationSource, includeTentative: true }
      )
      if (output === undefined) throw new Error('migration source is missing')

      assert.match(output, /dropIndex\("ix_orders_customer_created_at"\)/)
      assert.match(output, /dropConstraint\("fk_orders_customer"\)/)
      assert.match(output, /dropConstraint\("ux_customers_public_id"\)/)
      assert.match(output, /dropColumn\("name"\)/)
      assert.match(output, /dropTable\("orders"\)/)
      assert.match(output, /createTable\("orders"\)/)
      assert.match(output, /addColumn\("public_id", "char\(26\)"/)
      assert.match(output, /addPrimaryKeyConstraint\("pk_customers"/)
      assert.match(output, /addUniqueConstraint\("ux_customers_public_id"/)
      assert.match(output, /addForeignKeyConstraint\(/)
      assert.match(output, /createIndex\("ix_orders_status"\)/)
    })

    it('parses embedded DB projection snapshot metadata with unrelated comments before the block', async () => {
      const { snapshot, migrationSource } = await runMigrationShot(
        'online-shop-initial.valid.yaml'
      )
      if (migrationSource === undefined) {
        throw new Error('migration source is missing')
      }
      const output = ['// unrelated leading comment', migrationSource].join(
        '\n'
      )

      assert.deepEqual(parseEmbeddedSnapshot(output), snapshot)
    })

    it('parses embedded DB projection snapshot metadata with unrelated comments after the block', async () => {
      const { snapshot, migrationSource } = await runMigrationShot(
        'online-shop-initial.valid.yaml'
      )
      if (migrationSource === undefined) {
        throw new Error('migration source is missing')
      }
      const output = [migrationSource, '// unrelated trailing comment'].join(
        '\n'
      )

      assert.deepEqual(parseEmbeddedSnapshot(output), snapshot)
    })

    it('skips unrelated line-commented front matter blocks when parsing embedded DB projection snapshots', async () => {
      const { snapshot, migrationSource } = await runMigrationShot(
        'online-shop-initial.valid.yaml'
      )
      if (migrationSource === undefined) {
        throw new Error('migration source is missing')
      }
      const output = [
        '// ---',
        '// title: unrelated front matter',
        '// ---',
        '',
        migrationSource
      ].join('\n')

      assert.deepEqual(parseEmbeddedSnapshot(output), snapshot)
    })

    it('skips malformed line-commented front matter blocks when parsing embedded DB projection snapshots', async () => {
      const { snapshot, migrationSource } = await runMigrationShot(
        'online-shop-initial.valid.yaml'
      )
      if (migrationSource === undefined) {
        throw new Error('migration source is missing')
      }
      const output = [
        '// ---',
        '// malformed: [',
        '// ---',
        '',
        '// ---',
        '// null',
        '// ---',
        '',
        '// ---',
        '//data-sketch/embedded-db-projection-snapshot: unrelated',
        'not-commented: true',
        '// ---',
        '',
        migrationSource
      ].join('\n')

      assert.deepEqual(parseEmbeddedSnapshot(output), snapshot)
    })

    it('skips unrelated and malformed previous migration metadata blocks during shot', async () => {
      const { migrationSource: previousMigrationSource } =
        await runMigrationShot('online-shop-initial.valid.yaml')
      if (previousMigrationSource === undefined) {
        throw new Error('previous migration source is missing')
      }
      const previousWithUnrelatedBlocks = [
        '// ---',
        '// malformed: [',
        '// ---',
        '',
        '// ---',
        '// null',
        '// ---',
        '',
        '// ---',
        '//data-sketch/embedded-db-projection-snapshot: unrelated',
        'not-commented: true',
        '// ---',
        '',
        previousMigrationSource
      ].join('\n')

      const { migrationSource } = await runMigrationShot(
        'online-shop-diff-customer-rename.valid.yaml',
        { previousMigrationSource: previousWithUnrelatedBlocks }
      )

      assert.match(
        requiredOutput(migrationSource, 'migration source'),
        /renameTo\("shop_customers"\)/
      )
    })

    it('parses embedded DB projection snapshot metadata when keys are not in render order', async () => {
      const { snapshot, migrationSource: rendered } = await runMigrationShot(
        'online-shop-initial.valid.yaml'
      )
      if (rendered === undefined) throw new Error('migration source is missing')
      const snapshotPayloadLines = rendered
        .split(/\r?\n/)
        .filter(line => line.startsWith('//   '))
      const output = [
        '// ---',
        '// payload: |',
        ...snapshotPayloadLines,
        `// generated_at: ${fixedGeneratedAt}`,
        '// data-sketch/embedded-db-projection-snapshot: 1.0.0-draft.0',
        '// ---'
      ].join('\n')

      assert.deepEqual(parseEmbeddedSnapshot(output), snapshot)
    })

    it('resolves ISO prefixed output paths by prefixing only the basename', () => {
      const result = resolveMigrationOutputPath(
        '/tmp/persist/initial.ts',
        true,
        new Date('2026-06-06T12:34:56.789Z')
      )

      assert.equal(result, '/tmp/persist/2026-06-06T12:34:56.789Z_initial.ts')
      assert.equal(
        resolveMigrationOutputPath(
          '/tmp/persist/initial.ts',
          false,
          new Date()
        ),
        '/tmp/persist/initial.ts'
      )
    })

    it('renders foreign keys without referential actions', async () => {
      const { migrationSource: output } = await runMigrationShot(
        'online-shop-foreign-key-without-actions.valid.yaml'
      )
      if (output === undefined) throw new Error('migration source is missing')

      assert.match(output, /addForeignKeyConstraint\(/)
      assert.doesNotMatch(output, /constraint => constraint/)
    })
  })

  describe('migration file generation', () => {
    it('writes a migration file and type definitions', async () => {
      const directory = await createTemporaryDirectory(
        'shot-kysely-migration-',
        temporaryDirectories
      )
      const migrationPath = join(directory, 'initial.ts')
      const typesPath = join(directory, 'database.d.ts')
      const expectedSnapshot = await readJson(
        'snapshots/online-shop-initial.expected.json'
      )
      const result = await runKyselyMigrationCli([
        fixturePath(import.meta.url, 'online-shop-initial.valid.yaml'),
        '--output',
        migrationPath,
        '--types-output',
        typesPath
      ])

      const migration = await readFile(migrationPath, 'utf8')
      const types = await readFile(typesPath, 'utf8')
      const migrationGeneratedAt = readEmbeddedGeneratedAt(migration)
      const typesGeneratedAt = readEmbeddedGeneratedAt(types)

      assert.equal(result.isFailed, false)
      assert.match(result.stdout, /shot kysely-migration completed/)
      assert.equal(result.stderr, '')
      assert.deepEqual(parseEmbeddedSnapshot(migration), expectedSnapshot)
      assert.deepEqual(parseEmbeddedSnapshot(types), expectedSnapshot)
      assert.equal(migrationGeneratedAt, typesGeneratedAt)
      assert.match(migrationGeneratedAt, /^\d{4}-\d{2}-\d{2}T/)
      assert.match(migration, /export async function up/)
      assert.match(types, /export interface Database/)
    })

    it('validates OpenAPI traces through the CLI source loader', async () => {
      const directory = await createTemporaryDirectory(
        'shot-kysely-migration-',
        temporaryDirectories
      )
      const migrationPath = join(directory, 'openapi-trace.ts')
      const { isFailed } = await runKyselyMigrationCli([
        fixturePath(
          import.meta.url,
          'online-shop-sources-openapi-ignored-members.valid.yaml'
        ),
        '--output',
        migrationPath
      ])

      assert.equal(isFailed, false)
      assert.match(await readFile(migrationPath, 'utf8'), /createTable/)
    })

    it('writes a diff migration from a previous DB projection snapshot with shorthand input', async () => {
      const directory = await createTemporaryDirectory(
        'shot-kysely-migration-',
        temporaryDirectories
      )
      const previousMigrationPath = join(directory, '001_initial.ts')
      const diffMigrationPath = join(directory, '002_rename.ts')
      const typesPath = join(directory, 'database.d.ts')
      const expectedSnapshot = await createSnapshot(
        'online-shop-diff-customer-rename.valid.yaml'
      )
      const { migrationSource: previousMigrationSource } =
        await runMigrationShot('online-shop-initial.valid.yaml')
      if (previousMigrationSource === undefined) {
        throw new Error('previous migration source is missing')
      }
      await writeFile(previousMigrationPath, previousMigrationSource)

      const { isFailed } = await runKyselyMigrationCli([
        fixturePath(
          import.meta.url,
          'online-shop-diff-customer-rename.valid.yaml'
        ),
        '-p',
        previousMigrationPath,
        '--output',
        diffMigrationPath,
        '--types-output',
        typesPath
      ])
      const migration = await readFile(diffMigrationPath, 'utf8')
      const types = await readFile(typesPath, 'utf8')

      assert.equal(isFailed, false)
      assert.deepEqual(parseEmbeddedSnapshot(migration), expectedSnapshot)
      assert.deepEqual(parseEmbeddedSnapshot(types), expectedSnapshot)
      assert.match(migration, /renameTo\("shop_customers"\)/)
      assert.match(
        migration,
        /renameColumn\("public_id", "customer_public_id"\)/
      )
      assert.match(types, /"shop_customers"/)
    })

    it('writes a diff migration from a previous type definition snapshot', async () => {
      const directory = await createTemporaryDirectory(
        'shot-kysely-migration-',
        temporaryDirectories
      )
      const initialMigrationPath = join(directory, '001_initial.ts')
      const previousTypesPath = join(directory, 'database.d.ts')
      const diffMigrationPath = join(directory, '002_rename.ts')
      const expectedSnapshot = await createSnapshot(
        'online-shop-diff-customer-rename.valid.yaml'
      )
      await runKyselyMigrationCli([
        fixturePath(import.meta.url, 'online-shop-initial.valid.yaml'),
        '--output',
        initialMigrationPath,
        '--types-output',
        previousTypesPath
      ])

      const { isFailed } = await runKyselyMigrationCli([
        fixturePath(
          import.meta.url,
          'online-shop-diff-customer-rename.valid.yaml'
        ),
        '-p',
        previousTypesPath,
        '--output',
        diffMigrationPath
      ])
      const migration = await readFile(diffMigrationPath, 'utf8')

      assert.equal(isFailed, false)
      assert.deepEqual(parseEmbeddedSnapshot(migration), expectedSnapshot)
      assert.match(migration, /renameTo\("shop_customers"\)/)
      assert.match(
        migration,
        /renameColumn\("public_id", "customer_public_id"\)/
      )
    })

    it('prefixes the migration output basename when ISO prefixing is enabled', async () => {
      const directory = await createTemporaryDirectory(
        'shot-kysely-migration-',
        temporaryDirectories
      )
      const migrationPath = join(directory, 'initial.ts')

      const { isFailed } = await runKyselyMigrationCli([
        fixturePath(import.meta.url, 'online-shop-initial.valid.yaml'),
        '--output',
        migrationPath,
        '--iso-prefix'
      ])
      const files = await readdir(directory)

      assert.equal(isFailed, false)
      assert.equal(files.length, 1)
      assert.match(files[0], /^\d{4}-\d{2}-\d{2}T.*_initial\.ts$/)
    })

    it('validates and renders without writing files during dry run', async () => {
      const directory = await createTemporaryDirectory(
        'shot-kysely-migration-',
        temporaryDirectories
      )
      const migrationPath = join(directory, 'initial.ts')
      const typesPath = join(directory, 'database.d.ts')

      const result = await runKyselyMigrationCli([
        fixturePath(import.meta.url, 'online-shop-initial.valid.yaml'),
        '--output',
        migrationPath,
        '--types-output',
        typesPath,
        '--dry-run'
      ])

      assert.equal(result.isFailed, false)
      assert.match(result.stdout, /shot kysely-migration dry run completed/)
      assert.equal(result.stderr, '')
      await assert.rejects(access(migrationPath))
      await assert.rejects(access(typesPath))
    })

    it('warns when tentative stores are excluded from migration output', async () => {
      const directory = await createTemporaryDirectory(
        'shot-kysely-migration-',
        temporaryDirectories
      )
      const migrationPath = join(directory, 'initial.ts')

      const result = await runKyselyMigrationCli([
        fixturePath(import.meta.url, 'online-shop-tentative-store.valid.yaml'),
        '--output',
        migrationPath
      ])
      const migration = await readFile(migrationPath, 'utf8')

      assert.equal(result.isFailed, false)
      assert.match(result.stdout, /shot kysely-migration completed/)
      assert.match(result.stderr, /Tentative store excluded from migration/)
      assert.doesNotMatch(migration, /order_drafts/)
    })

    it('includes tentative stores when the kysely-migration command explicitly opts in', async () => {
      const directory = await createTemporaryDirectory(
        'shot-kysely-migration-',
        temporaryDirectories
      )
      const migrationPath = join(directory, 'initial.ts')

      const { isFailed } = await runKyselyMigrationCli([
        fixturePath(import.meta.url, 'online-shop-tentative-store.valid.yaml'),
        '--output',
        migrationPath,
        '--include-tentative'
      ])
      const migration = await readFile(migrationPath, 'utf8')

      assert.equal(isFailed, false)
      assert.match(migration, /order_drafts/)
    })

    it('warns and ignores enum check constraints in generated migration output', async () => {
      const directory = await createTemporaryDirectory(
        'shot-kysely-migration-',
        temporaryDirectories
      )
      const migrationPath = join(directory, 'initial.ts')

      const result = await runKyselyMigrationCli([
        fixturePath(import.meta.url, 'online-shop-enum-warning.valid.yaml'),
        '--output',
        migrationPath
      ])
      const migration = await readFile(migrationPath, 'utf8')

      assert.equal(result.isFailed, false)
      assert.match(result.stdout, /shot kysely-migration completed/)
      assert.match(result.stderr, /Enum check constraint ignored/)
      assert.doesNotMatch(migration, /addCheckConstraint|ck_orders_status_enum/)
    })

    it('fails before writing when the Data Sketch contains an ordered index field', async () => {
      const directory = await createTemporaryDirectory(
        'shot-kysely-migration-',
        temporaryDirectories
      )
      const migrationPath = join(directory, 'initial.ts')

      const result = await runKyselyMigrationCli([
        fixturePath(
          import.meta.url,
          'online-shop-field-defaults-and-checks.valid.yaml'
        ),
        '--output',
        migrationPath
      ])

      assert.equal(result.isFailed, true)
      assert.match(
        result.error.message,
        /Ordered index fields are not supported/
      )
      await assert.rejects(access(migrationPath))
    })

    it('fails before writing when the Data Sketch contains a Kysely-unsupported precision-only numeric column type', async () => {
      const directory = await createTemporaryDirectory(
        'shot-kysely-migration-',
        temporaryDirectories
      )
      const migrationPath = join(directory, 'initial.ts')

      const result = await runKyselyMigrationCli([
        fixturePath(
          import.meta.url,
          'online-shop-rendering-branches.valid.yaml'
        ),
        '--output',
        migrationPath
      ])

      assert.equal(result.isFailed, true)
      assert.match(
        result.error.message,
        /Column type is not supported by the kysely-migration command: products\.rating numeric\(3\)/
      )
      await assert.rejects(access(migrationPath))
    })

    it('reports missing input files without writing a migration', async () => {
      const directory = await createTemporaryDirectory(
        'shot-kysely-migration-',
        temporaryDirectories
      )
      const migrationPath = join(directory, 'initial.ts')

      const result = await runKyselyMigrationCli([
        fixturePath(import.meta.url, 'online-shop-missing.yaml'),
        '--output',
        migrationPath
      ])

      assert.equal(result.isFailed, true)
      assert.match(result.error.message, /ENOENT/)
      await assert.rejects(access(migrationPath))
    })

    it('reports previous migration read and snapshot parse failures before writing a diff migration', async () => {
      const directory = await createTemporaryDirectory(
        'shot-kysely-migration-',
        temporaryDirectories
      )
      const missingPreviousPath = join(directory, 'missing-previous.ts')
      const invalidPreviousPath = join(directory, 'invalid-previous.ts')
      const migrationPath = join(directory, 'diff.ts')
      await writeFile(invalidPreviousPath, '// not a DB projection snapshot\n')

      const missingResult = await runKyselyMigrationCli([
        fixturePath(
          import.meta.url,
          'online-shop-diff-customer-rename.valid.yaml'
        ),
        '--previous-migration',
        missingPreviousPath,
        '--output',
        migrationPath
      ])
      const invalidResult = await runKyselyMigrationCli([
        fixturePath(
          import.meta.url,
          'online-shop-diff-customer-rename.valid.yaml'
        ),
        '--previous-migration',
        invalidPreviousPath,
        '--output',
        migrationPath
      ])

      assert.equal(missingResult.isFailed, true)
      assert.match(missingResult.error.message, /ENOENT/)
      assert.equal(invalidResult.isFailed, true)
      assert.match(invalidResult.error.message, /DB Projection Snapshot/)
      await assert.rejects(access(migrationPath))
    })

    it('reports parse and validation errors before writing a migration', async () => {
      const directory = await createTemporaryDirectory(
        'shot-kysely-migration-',
        temporaryDirectories
      )
      const invalidSyntax = join(directory, 'invalid.yaml')
      const invalidSpecification = join(directory, 'invalid-specification.yaml')
      const migrationPath = join(directory, 'initial.ts')
      await writeFile(invalidSyntax, 'version: [\n')
      await writeFile(
        invalidSpecification,
        'data-sketch: 1.0.0-draft.0\ninfo:\n  name: online-shop\nstores: {}\n'
      )

      const parseResult = await runKyselyMigrationCli([
        invalidSyntax,
        '--output',
        migrationPath
      ])
      const validationResult = await runKyselyMigrationCli([
        invalidSpecification,
        '--output',
        migrationPath
      ])

      assert.equal(parseResult.isFailed, true)
      assert.match(parseResult.error.message, /Failed to parse/)
      assert.equal(validationResult.isFailed, true)
      assert.match(validationResult.error.message, /stores/)
      await assert.rejects(access(migrationPath))
    })

    it('reports write failures after rendering succeeds', async () => {
      const directory = await createTemporaryDirectory(
        'shot-kysely-migration-',
        temporaryDirectories
      )
      const missingDirectoryPath = join(directory, 'missing', 'initial.ts')

      const result = await runKyselyMigrationCli([
        fixturePath(import.meta.url, 'online-shop-initial.valid.yaml'),
        '--output',
        missingDirectoryPath
      ])

      assert.equal(result.isFailed, true)
      assert.match(result.error.message, /ENOENT/)
    })

    it('creates output directories explicitly in tests without relying on command directory creation', async () => {
      const directory = await createTemporaryDirectory(
        'shot-kysely-migration-',
        temporaryDirectories
      )
      const nested = join(directory, 'nested')
      await mkdir(nested)

      const migrationPath = join(nested, 'initial.ts')
      const { isFailed } = await runKyselyMigrationCli([
        fixturePath(import.meta.url, 'online-shop-initial.valid.yaml'),
        '-o',
        migrationPath
      ])

      assert.equal(isFailed, false)
      assert.match(await readFile(migrationPath, 'utf8'), /createTable/)
    })
  })

  describe('generated migrations in PGlite', () => {
    it('runs the generated up migration and creates representative database objects', async () => {
      const directory = await createTemporaryDirectory(
        'shot-kysely-migration-',
        temporaryDirectories
      )
      const migrationPath = join(directory, '001_up_testing.ts')
      await runKyselyMigrationCli([
        fixturePath(import.meta.url, 'online-shop-up-down-testing.valid.yaml'),
        '--output',
        migrationPath
      ])

      const pglite = new PGlite()
      const db = new Kysely<unknown>({
        dialect: new PGliteDialect({ pglite })
      })
      const migration = await import(pathToFileURL(migrationPath).href)
      const provider: MigrationProvider = {
        async getMigrations() {
          return { '001_up_testing': migration }
        }
      }
      const migrator = new Migrator({ db, provider })

      const result = await migrator.migrateToLatest()

      assert.equal(result.error, undefined)
      assert.deepEqual(await readTableNames(db), ['customers', 'orders'])
      assert.deepEqual(await readColumnNames(db), [
        'customers.id',
        'customers.public_id',
        'customers.name',
        'orders.id',
        'orders.public_id',
        'orders.customer_id',
        'orders.status',
        'orders.created_at',
        'orders.updated_at'
      ])
      assert.deepEqual(await readConstraintNames(db), [
        'fk_orders_customer',
        'pk_customers',
        'pk_orders',
        'ux_customers_public_id',
        'ux_orders_public_id'
      ])
      assert.deepEqual(await readIndexNames(db), [
        'ix_orders_customer_created_at',
        'ix_orders_status'
      ])

      await db.destroy()
    })

    it('runs the generated down migration and removes tables', async () => {
      const directory = await createTemporaryDirectory(
        'shot-kysely-migration-',
        temporaryDirectories
      )
      const migrationPath = join(directory, '001_down_testing.ts')
      await runKyselyMigrationCli([
        fixturePath(import.meta.url, 'online-shop-up-down-testing.valid.yaml'),
        '--output',
        migrationPath
      ])

      const pglite = new PGlite()
      const db = new Kysely<unknown>({
        dialect: new PGliteDialect({ pglite })
      })
      const migration = await import(pathToFileURL(migrationPath).href)
      const provider: MigrationProvider = {
        async getMigrations() {
          return { '001_down_testing': migration }
        }
      }
      const migrator = new Migrator({ db, provider })

      const upResult = await migrator.migrateToLatest()
      assert.equal(upResult.error, undefined)
      assert.deepEqual(await readTableNames(db), ['customers', 'orders'])

      const downResult = await migrator.migrateTo(NO_MIGRATIONS)
      assert.equal(downResult.error, undefined)
      assert.deepEqual(await readTableNames(db), [])

      await db.destroy()
    })

    it('runs initial migration followed by customer rename and order fulfillment diff migrations', async () => {
      const directory = await createTemporaryDirectory(
        'shot-kysely-migration-',
        temporaryDirectories
      )
      const initialMigrationPath = join(directory, '001_initial.ts')
      const customerRenameMigrationPath = join(
        directory,
        '002_customer_rename.ts'
      )
      const orderFulfillmentMigrationPath = join(
        directory,
        '003_order_fulfillment.ts'
      )
      await runKyselyMigrationCli([
        fixturePath(import.meta.url, 'online-shop-initial.valid.yaml'),
        '--output',
        initialMigrationPath
      ])
      await runKyselyMigrationCli([
        fixturePath(
          import.meta.url,
          'online-shop-diff-customer-rename.valid.yaml'
        ),
        '--previous-migration',
        initialMigrationPath,
        '--output',
        customerRenameMigrationPath
      ])
      await runKyselyMigrationCli([
        fixturePath(
          import.meta.url,
          'online-shop-diff-order-fulfillment.valid.yaml'
        ),
        '-p',
        customerRenameMigrationPath,
        '--output',
        orderFulfillmentMigrationPath
      ])

      const expectedSnapshot = await createSnapshot(
        'online-shop-diff-order-fulfillment.valid.yaml'
      )
      assert.deepEqual(
        parseEmbeddedSnapshot(
          await readFile(orderFulfillmentMigrationPath, 'utf8')
        ),
        expectedSnapshot
      )

      const pglite = new PGlite()
      const db = new Kysely<unknown>({
        dialect: new PGliteDialect({ pglite })
      })
      const initialMigration = await import(
        pathToFileURL(initialMigrationPath).href
      )
      const customerRenameMigration = await import(
        pathToFileURL(customerRenameMigrationPath).href
      )
      const orderFulfillmentMigration = await import(
        pathToFileURL(orderFulfillmentMigrationPath).href
      )
      const provider: MigrationProvider = {
        async getMigrations() {
          return {
            '001_initial': initialMigration,
            '002_customer_rename': customerRenameMigration,
            '003_order_fulfillment': orderFulfillmentMigration
          }
        }
      }
      const migrator = new Migrator({ db, provider })

      const upResult = await migrator.migrateToLatest()
      assert.equal(upResult.error, undefined)
      await assertDatabaseState(
        db,
        'expected/online-shop-diff-final-db-state.expected.json'
      )

      const downToCustomerRenameResult = await migrator.migrateTo(
        '002_customer_rename'
      )
      assert.equal(downToCustomerRenameResult.error, undefined)
      await assertDatabaseState(
        db,
        'expected/online-shop-diff-customer-rename-db-state.expected.json'
      )

      const downToInitialResult = await migrator.migrateTo('001_initial')
      assert.equal(downToInitialResult.error, undefined)
      await assertDatabaseState(
        db,
        'expected/online-shop-initial-db-state.expected.json'
      )

      const downToEmptyResult = await migrator.migrateTo(NO_MIGRATIONS)
      assert.equal(downToEmptyResult.error, undefined)
      assert.deepEqual(await readTableNames(db), [])

      await db.destroy()
    })

    it('runs customer rename followed by order cleanup diff migrations', async () => {
      const directory = await createTemporaryDirectory(
        'shot-kysely-migration-',
        temporaryDirectories
      )
      const initialMigrationPath = join(directory, '001_initial.ts')
      const customerRenameMigrationPath = join(
        directory,
        '002_customer_rename.ts'
      )
      const orderCleanupMigrationPath = join(directory, '003_order_cleanup.ts')
      await runKyselyMigrationCli([
        fixturePath(import.meta.url, 'online-shop-initial.valid.yaml'),
        '--output',
        initialMigrationPath
      ])
      await runKyselyMigrationCli([
        fixturePath(
          import.meta.url,
          'online-shop-diff-customer-rename.valid.yaml'
        ),
        '--previous-migration',
        initialMigrationPath,
        '--output',
        customerRenameMigrationPath
      ])
      await runKyselyMigrationCli([
        fixturePath(
          import.meta.url,
          'online-shop-diff-order-cleanup.valid.yaml'
        ),
        '-p',
        customerRenameMigrationPath,
        '--output',
        orderCleanupMigrationPath
      ])

      const expectedSnapshot = await createSnapshot(
        'online-shop-diff-order-cleanup.valid.yaml'
      )
      const orderCleanupMigrationSource = await readFile(
        orderCleanupMigrationPath,
        'utf8'
      )
      assert.deepEqual(
        parseEmbeddedSnapshot(orderCleanupMigrationSource),
        expectedSnapshot
      )
      assert.match(
        orderCleanupMigrationSource,
        /dropIndex\("ix_orders_status"\)/
      )
      assert.match(orderCleanupMigrationSource, /dropColumn\("status"\)/)
      assert.match(
        orderCleanupMigrationSource,
        /dropConstraint\("fk_orders_customer"\)/
      )
      assert.match(
        orderCleanupMigrationSource,
        /dropConstraint\("ux_orders_public_id"\)/
      )
      assert.match(
        orderCleanupMigrationSource,
        /addUniqueConstraint\("ux_orders_public_identifier"/
      )
      assert.match(
        orderCleanupMigrationSource,
        /addForeignKeyConstraint\(\s*"fk_orders_shop_customer"/
      )

      const pglite = new PGlite()
      const db = new Kysely<unknown>({
        dialect: new PGliteDialect({ pglite })
      })
      const initialMigration = await import(
        pathToFileURL(initialMigrationPath).href
      )
      const customerRenameMigration = await import(
        pathToFileURL(customerRenameMigrationPath).href
      )
      const orderCleanupMigration = await import(
        pathToFileURL(orderCleanupMigrationPath).href
      )
      const provider: MigrationProvider = {
        async getMigrations() {
          return {
            '001_initial': initialMigration,
            '002_customer_rename': customerRenameMigration,
            '003_order_cleanup': orderCleanupMigration
          }
        }
      }
      const migrator = new Migrator({ db, provider })

      const upResult = await migrator.migrateToLatest()
      assert.equal(upResult.error, undefined)
      await assertDatabaseState(
        db,
        'expected/online-shop-diff-order-cleanup-db-state.expected.json'
      )

      const downResult = await migrator.migrateTo(NO_MIGRATIONS)
      assert.equal(downResult.error, undefined)
      assert.deepEqual(await readTableNames(db), [])

      await db.destroy()
    })
  })
})

type ExpectedDatabaseState = {
  tables: string[]
  columns: string[]
  constraints: string[]
  indexes: string[]
}

async function assertDatabaseState(db: Kysely<unknown>, fixtureName: string) {
  const expected = (await readJson(fixtureName)) as ExpectedDatabaseState

  assert.deepEqual(await readTableNames(db), expected.tables)
  assert.deepEqual(sortNames(await readColumnNames(db)), expected.columns)
  assert.deepEqual(await readConstraintNames(db), expected.constraints)
  assert.deepEqual(await readIndexNames(db), expected.indexes)
}

async function createSnapshot(
  fixtureName: string,
  options?: { includeTentative?: boolean }
) {
  const input = await parseSpecificationFile(
    fixturePath(import.meta.url, fixtureName)
  )
  const result = await validateSpecification(input, {
    loadOpenApiSource: source =>
      readFile(
        join(dirname(fixturePath(import.meta.url, fixtureName)), source),
        'utf8'
      )
  })
  assert.equal(result.isValid, true)
  if (!result.isValid) throw new Error('fixture must be valid')

  return createDbProjectionSnapshot(result.data, options)
}

async function readJson(fixtureName: string) {
  return JSON.parse(
    await readFile(fixturePath(import.meta.url, fixtureName), 'utf8')
  ) as unknown
}

async function readText(fixtureName: string) {
  return readFile(fixturePath(import.meta.url, fixtureName), 'utf8')
}

function sortNames(names: string[]) {
  return [...names].sort((left, right) => left.localeCompare(right))
}

function readEmbeddedGeneratedAt(source: string) {
  const match = /^\/\/ generated_at: (.+)$/m.exec(source)
  if (match === null) {
    throw new Error('generated_at metadata is missing')
  }
  return match[1]
}

function renderEmbeddedSnapshot(
  snapshot: DbProjectionSnapshot,
  generatedAt: string
) {
  const payload = gzipSync(JSON.stringify(snapshot)).toString('base64')
  const lines = [
    '// ---',
    `// data-sketch/embedded-db-projection-snapshot: ${dataSketchVersion}`,
    `// generated_at: ${generatedAt}`,
    '// payload: |'
  ]

  for (let index = 0; index < payload.length; index += 76) {
    lines.push(`//   ${payload.slice(index, index + 76)}`)
  }

  lines.push('// ---')
  return lines.join('\n')
}

function parseEmbeddedSnapshot(source: string): DbProjectionSnapshot {
  const lines = source.split(/\r?\n/)

  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index] !== '// ---') continue

    const endIndex = lines.indexOf('// ---', index + 1)
    if (endIndex === -1) break

    const yamlLines = lines.slice(index + 1, endIndex).map(line => {
      if (!line.startsWith('//')) return line
      return line.startsWith('// ') ? line.slice(3) : line.slice(2)
    })

    let metadata: unknown
    try {
      metadata = load(yamlLines.join('\n'))
    } catch {
      index = endIndex
      continue
    }

    if (!isEmbeddedSnapshotMetadata(metadata)) {
      index = endIndex
      continue
    }

    if (typeof metadata.payload !== 'string') {
      throw new Error('DB Projection Snapshot payload is missing')
    }

    const snapshot = JSON.parse(
      gunzipSync(Buffer.from(metadata.payload, 'base64')).toString('utf8')
    ) as unknown
    validateEmbeddedSnapshot(snapshot)
    return snapshot
  }

  throw new Error('DB Projection Snapshot comment is missing')
}

function isEmbeddedSnapshotMetadata(
  metadata: unknown
): metadata is { payload?: unknown } {
  if (metadata === null || typeof metadata !== 'object') return false
  const candidate = metadata as Record<string, unknown>
  return (
    candidate['data-sketch/embedded-db-projection-snapshot'] ===
    dataSketchVersion
  )
}

function validateEmbeddedSnapshot(
  snapshot: unknown
): asserts snapshot is DbProjectionSnapshot {
  if (snapshot === null || typeof snapshot !== 'object') {
    throw new Error('DB Projection Snapshot must be an object')
  }
  const candidate = snapshot as Record<string, unknown>
  if (candidate[dbProjectionSnapshotIdentifier] !== dataSketchVersion) {
    throw new Error(
      `DB Projection Snapshot identifier is not supported: expected ${dbProjectionSnapshotIdentifier}: ${dataSketchVersion}`
    )
  }
  if (!Array.isArray(candidate.tables)) {
    throw new Error('DB Projection Snapshot table-spec must be an array')
  }

  for (const [tableIndex, table] of candidate.tables.entries()) {
    if (table === null || typeof table !== 'object') {
      throw new Error(
        `DB Projection Snapshot table must be an object: ${tableIndex}`
      )
    }
    const tableCandidate = table as Record<string, unknown>
    if (typeof tableCandidate.id !== 'string') {
      throw new Error(
        `DB Projection Snapshot table id is missing: ${tableIndex}`
      )
    }
    if (typeof tableCandidate.name !== 'string') {
      throw new Error(
        `DB Projection Snapshot table name is missing: ${tableCandidate.id}`
      )
    }
    if (!Array.isArray(tableCandidate.columns)) {
      throw new Error(
        `DB Projection Snapshot table columns must be an array: ${tableCandidate.id}`
      )
    }
    for (const [columnIndex, column] of tableCandidate.columns.entries()) {
      if (column === null || typeof column !== 'object') {
        throw new Error(
          `DB Projection Snapshot column must be an object: ${tableCandidate.id}.${columnIndex}`
        )
      }
      const columnCandidate = column as Record<string, unknown>
      if (typeof columnCandidate.id !== 'string') {
        throw new Error(
          `DB Projection Snapshot column id is missing: ${tableCandidate.id}.${columnIndex}`
        )
      }
      if (typeof columnCandidate.name !== 'string') {
        throw new Error(
          `DB Projection Snapshot column name is missing: ${tableCandidate.id}.${columnCandidate.id}`
        )
      }
    }
  }
}

function resolveMigrationOutputPath(
  outputPath: string,
  isoPrefix: boolean,
  date: Date
) {
  if (!isoPrefix) return outputPath
  return join(
    dirname(outputPath),
    `${date.toISOString()}_${basename(outputPath)}`
  )
}

async function executeMetadataQuery<R>(db: Kysely<unknown>, sql: string) {
  const result = await db.executeQuery<R>({
    sql,
    parameters: [],
    query: undefined as never,
    queryId: undefined as never
  })

  return result.rows
}

async function readTableNames(db: Kysely<unknown>) {
  const rows = await executeMetadataQuery<{ table_name: string }>(
    db,
    `
      select table_name
      from information_schema.tables
      where table_schema = 'public'
        and table_name not in ('kysely_migration', 'kysely_migration_lock')
      order by table_name
    `
  )

  return rows.map(row => row.table_name)
}

async function readColumnNames(db: Kysely<unknown>) {
  const rows = await executeMetadataQuery<{
    table_name: string
    column_name: string
  }>(
    db,
    `
      select table_name, column_name
      from information_schema.columns
      where table_schema = 'public'
        and table_name not in ('kysely_migration', 'kysely_migration_lock')
      order by table_name, ordinal_position
    `
  )

  return rows.map(row => `${row.table_name}.${row.column_name}`)
}

async function readConstraintNames(db: Kysely<unknown>) {
  const rows = await executeMetadataQuery<{ constraint_name: string }>(
    db,
    `
      select constraint_name
      from information_schema.table_constraints
      where table_schema = 'public'
        and table_name not in ('kysely_migration', 'kysely_migration_lock')
        and constraint_type in ('PRIMARY KEY', 'UNIQUE', 'FOREIGN KEY')
      order by constraint_name
    `
  )

  return rows.map(row => row.constraint_name)
}

async function readIndexNames(db: Kysely<unknown>) {
  const rows = await executeMetadataQuery<{ index_name: string }>(
    db,
    `
      select index_class.relname as index_name
      from pg_index index_info
      join pg_class table_class
        on table_class.oid = index_info.indrelid
      join pg_namespace namespace
        on namespace.oid = table_class.relnamespace
      join pg_class index_class
        on index_class.oid = index_info.indexrelid
      where namespace.nspname = 'public'
        and table_class.relname not in ('kysely_migration', 'kysely_migration_lock')
        and index_info.indisprimary = false
        and index_info.indisunique = false
      order by index_class.relname
    `
  )

  return rows.map(row => row.index_name)
}
