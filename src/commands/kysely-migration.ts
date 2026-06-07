import { writeSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { parseArgs } from 'node:util'
import { gunzipSync, gzipSync } from 'node:zlib'
import { intro, log, outro } from '@clack/prompts'
import { load } from 'js-yaml'
import pc from 'picocolors'
import { parseSpecificationText } from '../parser.ts'
import type { IndexField, Specification, Store } from '../schema.ts'
import { validateSpecification } from '../validator.ts'

const colors = pc.createColors(true)
const embeddedSnapshotIdentifier = 'data-sketch/embedded-db-projection-snapshot'
const dbProjectionSnapshotIdentifier = 'data-sketch/db-projection-snapshot'
const dataSketchVersion = '1.0.0-draft.0'
const snapshotLineLength = 76

type ForeignKey = NonNullable<NonNullable<Store['keys']>['foreign']>[number]

export type DbProjectionSnapshot = {
  'data-sketch/db-projection-snapshot': '1.0.0-draft.0'
  tables: SnapshotTable[]
}

export type SnapshotTable = {
  id: string
  name: string
  columns: SnapshotColumn[]
  primaryKey?: SnapshotNamedColumns
  uniqueConstraints: SnapshotNamedColumns[]
  foreignKeys: SnapshotForeignKey[]
  indexes: SnapshotIndex[]
  checkConstraints: SnapshotCheckConstraint[]
}

export type SnapshotColumn = {
  id: string
  name: string
  type: SnapshotColumnType
  nullable: boolean
  default:
    | { kind: 'omitted' }
    | { kind: 'literal'; value: string | number | boolean | null }
}

export type SnapshotColumnType = {
  name:
    | 'integer'
    | 'smallint'
    | 'boolean'
    | 'char'
    | 'varchar'
    | 'decimal'
    | 'numeric'
    | 'date'
    | 'time'
    | 'timestamp'
  length?: number
  precision?: number
  scale?: number
}

export type SnapshotNamedColumns = {
  name: string
  columns: string[]
}

export type SnapshotForeignKey = {
  name: string
  columns: string[]
  references: {
    table: string
    columns: string[]
  }
  onDelete?: 'restrict' | 'cascade' | 'setNull' | 'setDefault' | 'noAction'
  onUpdate?: 'restrict' | 'cascade' | 'setNull' | 'setDefault' | 'noAction'
}

export type SnapshotIndex = {
  name: string
  columns: SnapshotIndexColumn[]
}

export type SnapshotIndexColumn = {
  name: string
  order?: 'asc' | 'desc'
}

export type SnapshotCheckConstraint = {
  name: string
  kind: 'enum'
  column: string
  values: string[]
}

export type DbProjectionSnapshotOptions = {
  includeTentative?: boolean
}

export type MigrationWarning = {
  message: string
}

export type MigrationRenderOptions = {
  generatedAt?: string
}

export const usage = [
  'Usage:',
  '  shot kysely-migration <file> --output <file>',
  '  shot kysely-migration <file> -o <file>',
  '  shot kysely-migration <file> --output <file> --iso-prefix',
  '  shot kysely-migration <file> --output <file> --types-output <file.d.ts>',
  '  shot kysely-migration <file> --output <file> --include-tentative',
  '  shot kysely-migration <file> --output <file> --dry-run',
  '  shot kysely-migration <file> --previous-migration <file> --output <file>',
  '  shot kysely-migration <file> -p <file> --output <file>',
  '',
  'Generate a Kysely TypeScript initial or diff migration.',
  '',
  'Options:',
  '  -o, --output <file>      Write the migration to a file',
  '  -p, --previous-migration <file> Read the previous DB projection snapshot',
  '      --types-output <file.d.ts> Write Database type definitions to a file',
  '      --iso-prefix         Prefix the migration file basename with ISO 8601 time',
  '      --include-tentative  Include tentative stores',
  '      --dry-run            Validate and render without writing files',
  '  -h, --help               Show this help'
].join('\n')

export async function runKyselyMigrationCommand(args: string[]) {
  let filePath: string
  let outputPath: string
  let previousMigrationPath: string | undefined
  let typesOutputPath: string | undefined
  let isoPrefix: boolean
  let includeTentative: boolean
  let dryRun: boolean

  try {
    const parsed = parseArgs({
      args,
      allowPositionals: true,
      strict: true,
      options: {
        output: { type: 'string', short: 'o' },
        'previous-migration': { type: 'string', short: 'p' },
        'types-output': { type: 'string' },
        'iso-prefix': { type: 'boolean' },
        'include-tentative': { type: 'boolean' },
        'dry-run': { type: 'boolean' },
        help: { type: 'boolean', short: 'h' }
      }
    })
    if (parsed.values.help === true) {
      writeSync(1, `${usage}\n`)
      return 0
    }
    if (parsed.positionals.length !== 1 || parsed.values.output === undefined) {
      writeOptionError('expected one input file and --output <file>')
      return 1
    }
    filePath = parsed.positionals[0]
    outputPath = parsed.values.output
    previousMigrationPath = parsed.values['previous-migration']
    typesOutputPath = parsed.values['types-output']
    if (typesOutputPath !== undefined && !typesOutputPath.endsWith('.d.ts')) {
      writeOptionError('--types-output must end with .d.ts')
      return 1
    }
    isoPrefix = parsed.values['iso-prefix'] === true
    includeTentative = parsed.values['include-tentative'] === true
    dryRun = parsed.values['dry-run'] === true
  } catch (error) {
    writeOptionError((error as Error).message)
    return 1
  }

  intro('Migration generation')

  let source: Buffer
  try {
    source = await readFile(filePath)
    log.success('Data Sketch read')
  } catch (error) {
    return reportMigrationError('Reading Data Sketch', error)
  }

  let input: unknown
  try {
    input = parseSpecificationText(source.toString('utf8'), filePath)
  } catch (error) {
    return reportMigrationError('Parsing Data Sketch', error)
  }

  const validation = await validateSpecification(input, {
    sourcePath: filePath
  })
  if (!validation.success) {
    log.error('Validating Data Sketch failed')
    writeReason(validation.issues.map(issue => issue.message).join('\n'))
    outro(colors.red('Failed'))
    await flushStdout()
    return 1
  }
  log.success('Validating Data Sketch')

  const snapshot = createDbProjectionSnapshot(validation.data, {
    includeTentative
  })
  log.success('Creating DB projection snapshot')

  let previousSnapshot: DbProjectionSnapshot | undefined
  if (previousMigrationPath !== undefined) {
    let previousSource: Buffer
    try {
      previousSource = await readFile(previousMigrationPath)
      log.success('Previous migration read')
    } catch (error) {
      return reportMigrationError('Reading previous migration', error)
    }

    try {
      previousSnapshot = parseEmbeddedSnapshot(previousSource.toString('utf8'))
      log.success('Previous DB projection snapshot parsed')
    } catch (error) {
      return reportMigrationError(
        'Parsing previous DB projection snapshot',
        error
      )
    }
  }

  const warnings = [
    ...collectTentativeWarnings(validation.data, includeTentative),
    ...collectCheckConstraintWarnings(snapshot)
  ]
  for (const warning of warnings) log.warn(warning.message)

  let migrationSource: string
  let typesSource: string | undefined
  try {
    const generatedAt = new Date().toISOString()
    migrationSource =
      previousSnapshot === undefined
        ? renderMigrationSource(snapshot, { generatedAt })
        : renderDiffMigrationSource(previousSnapshot, snapshot, { generatedAt })
    if (typesOutputPath !== undefined) {
      typesSource = renderDatabaseTypeSource(snapshot, { generatedAt })
    }
    log.success('Rendering migration')
  } catch (error) {
    return reportMigrationError('Rendering migration', error)
  }

  if (dryRun) {
    log.success('Dry run completed')
    outro(colors.green('Succeeded'))
    await flushStdout()
    return 0
  }

  const finalOutputPath = resolveMigrationOutputPath(
    outputPath,
    isoPrefix,
    new Date()
  )

  try {
    await writeFile(finalOutputPath, migrationSource)
    log.success('Migration written')
    if (typesOutputPath !== undefined && typesSource !== undefined) {
      await writeFile(typesOutputPath, typesSource)
      log.success('Type definitions written')
    }
  } catch (error) {
    return reportMigrationError('Writing migration', error)
  }

  log.success('Migration generated')
  outro(colors.green('Succeeded'))
  await flushStdout()
  return 0
}

export function createDbProjectionSnapshot(
  dsl: Specification,
  options: DbProjectionSnapshotOptions = {}
): DbProjectionSnapshot {
  const includeTentative = options.includeTentative === true

  return {
    [dbProjectionSnapshotIdentifier]: dataSketchVersion,
    tables: Object.entries(dsl.stores)
      .filter(([, store]) => includeTentative || store.tentative !== true)
      .map(([storeId, store]) => createSnapshotTable(storeId, store, dsl))
  }
}

export function renderMigrationSource(
  snapshot: DbProjectionSnapshot,
  options: MigrationRenderOptions = {}
): string {
  rejectOrderedIndexes(snapshot)
  rejectUnsupportedKyselyColumnTypes(snapshot)

  return [
    renderEmbeddedSnapshot(
      snapshot,
      options.generatedAt ?? new Date().toISOString()
    ),
    '',
    "import type { Kysely } from 'kysely'",
    '',
    renderDatabaseInterface('MigrationDatabase', snapshot, false),
    '',
    'export async function up(db: Kysely<MigrationDatabase>): Promise<void> {',
    ...renderUpStatements(snapshot),
    '}',
    '',
    'export async function down(db: Kysely<MigrationDatabase>): Promise<void> {',
    ...renderDownStatements(snapshot),
    '}',
    ''
  ].join('\n')
}

export function renderDiffMigrationSource(
  before: DbProjectionSnapshot,
  after: DbProjectionSnapshot,
  options: MigrationRenderOptions = {}
): string {
  validateDbProjectionSnapshot(before)
  validateDbProjectionSnapshot(after)
  rejectOrderedIndexes(before)
  rejectOrderedIndexes(after)
  rejectUnsupportedKyselyColumnTypes(before)
  rejectUnsupportedKyselyColumnTypes(after)

  return [
    renderEmbeddedSnapshot(
      after,
      options.generatedAt ?? new Date().toISOString()
    ),
    '',
    "import type { Kysely } from 'kysely'",
    '',
    renderDatabaseInterface('MigrationDatabase', after, false),
    '',
    'export async function up(db: Kysely<MigrationDatabase>): Promise<void> {',
    ...renderDiffStatements(before, after),
    '}',
    '',
    'export async function down(db: Kysely<MigrationDatabase>): Promise<void> {',
    ...renderDiffStatements(after, before),
    '}',
    ''
  ].join('\n')
}

export function renderDatabaseTypeSource(
  snapshot: DbProjectionSnapshot,
  options: MigrationRenderOptions = {}
): string {
  return [
    renderEmbeddedSnapshot(
      snapshot,
      options.generatedAt ?? new Date().toISOString()
    ),
    '',
    renderDatabaseInterface('Database', snapshot, true),
    ''
  ].join('\n')
}

export function renderEmbeddedSnapshot(
  snapshot: DbProjectionSnapshot,
  generatedAt: string
): string {
  const payload = gzipSync(JSON.stringify(snapshot)).toString('base64')
  const lines = [
    '// ---',
    `// ${embeddedSnapshotIdentifier}: ${dataSketchVersion}`,
    `// generated_at: ${generatedAt}`,
    '// payload: |'
  ]

  for (let index = 0; index < payload.length; index += snapshotLineLength) {
    lines.push(`//   ${payload.slice(index, index + snapshotLineLength)}`)
  }

  lines.push('// ---')

  return lines.join('\n')
}

export function parseEmbeddedSnapshot(source: string): DbProjectionSnapshot {
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

    if (!isMigrationMetadata(metadata)) {
      index = endIndex
      continue
    }

    if (typeof metadata.payload !== 'string') {
      throw new Error('DB Projection Snapshot payload is missing')
    }

    const snapshot = JSON.parse(
      gunzipSync(Buffer.from(metadata.payload, 'base64')).toString('utf8')
    ) as unknown
    validateDbProjectionSnapshot(snapshot)
    return snapshot
  }

  throw new Error('DB Projection Snapshot comment is missing')
}

function isMigrationMetadata(
  metadata: unknown
): metadata is { payload?: unknown } {
  if (metadata === null || typeof metadata !== 'object') return false
  const candidate = metadata as Record<string, unknown>
  return candidate[embeddedSnapshotIdentifier] === dataSketchVersion
}

function validateDbProjectionSnapshot(
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

export function resolveMigrationOutputPath(
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

export function collectTentativeWarnings(
  dsl: Specification,
  includeTentative: boolean
): MigrationWarning[] {
  if (includeTentative) return []

  return Object.values(dsl.stores)
    .filter(store => store.tentative === true)
    .map(store => ({
      message: `Tentative store excluded from migration: ${store.name}`
    }))
}

export function collectCheckConstraintWarnings(
  snapshot: DbProjectionSnapshot
): MigrationWarning[] {
  return snapshot.tables.flatMap(table =>
    table.checkConstraints.map(checkConstraint => ({
      message: `Enum check constraint ignored by migration renderer: ${table.name}.${checkConstraint.column}`
    }))
  )
}

function createSnapshotTable(
  storeId: string,
  store: Store,
  dsl: Specification
): SnapshotTable {
  const table: SnapshotTable = {
    id: storeId,
    name: store.name,
    columns: Object.entries(store.fields).map(([fieldId, field]) =>
      createSnapshotColumn(fieldId, field)
    ),
    uniqueConstraints: (store.keys?.unique ?? []).map(unique =>
      createNamedColumns(unique, store)
    ),
    foreignKeys: (store.keys?.foreign ?? []).map(foreign =>
      createForeignKey(foreign, store, dsl)
    ),
    indexes: (store.indexes ?? []).map(index => ({
      name: index.name,
      columns: index.fields.map(field => createIndexColumn(field, store))
    })),
    checkConstraints: createCheckConstraints(store)
  }

  if (store.keys?.primary !== undefined) {
    table.primaryKey = createNamedColumns(store.keys.primary, store)
  }

  return table
}

function createSnapshotColumn(
  fieldId: string,
  field: Store['fields'][string]
): SnapshotColumn {
  return {
    id: fieldId,
    name: field.name,
    type: createColumnType(field.type),
    nullable: field.nullable,
    default: Object.hasOwn(field, 'default')
      ? { kind: 'literal', value: field.default ?? null }
      : { kind: 'omitted' }
  }
}

function createColumnType(
  fieldType: Store['fields'][string]['type']
): SnapshotColumnType {
  const columnType: SnapshotColumnType = { name: fieldType.name }

  if (fieldType.length !== undefined) columnType.length = fieldType.length
  if (fieldType.precision !== undefined) {
    columnType.precision = fieldType.precision
  }
  if (fieldType.scale !== undefined) columnType.scale = fieldType.scale

  return columnType
}

function createNamedColumns(
  namedFields: { name: string; fields: string[] },
  store: Store
): SnapshotNamedColumns {
  return {
    name: namedFields.name,
    columns: namedFields.fields.map(fieldId => store.fields[fieldId].name)
  }
}

function createForeignKey(
  foreign: ForeignKey,
  store: Store,
  dsl: Specification
): SnapshotForeignKey {
  const referencedStore = dsl.stores[foreign.references.store]
  const snapshotForeignKey: SnapshotForeignKey = {
    name: foreign.name,
    columns: foreign.fields.map(fieldId => store.fields[fieldId].name),
    references: {
      table: referencedStore.name,
      columns: foreign.references.fields.map(
        fieldId => referencedStore.fields[fieldId].name
      )
    }
  }

  if (foreign.onDelete !== undefined) {
    snapshotForeignKey.onDelete = foreign.onDelete
  }
  if (foreign.onUpdate !== undefined) {
    snapshotForeignKey.onUpdate = foreign.onUpdate
  }

  return snapshotForeignKey
}

function createIndexColumn(
  indexField: IndexField,
  store: Store
): SnapshotIndexColumn {
  if (typeof indexField === 'string') {
    return { name: store.fields[indexField].name }
  }

  const column: SnapshotIndexColumn = {
    name: store.fields[indexField.field].name
  }
  if (indexField.order !== undefined) column.order = indexField.order

  return column
}

function createCheckConstraints(store: Store): SnapshotCheckConstraint[] {
  return Object.values(store.fields)
    .filter(field => field.enum !== undefined)
    .map(field => ({
      name: `ck_${store.name}_${field.name}_enum`,
      kind: 'enum',
      column: field.name,
      values: field.enum as string[]
    }))
}

function renderDatabaseInterface(
  name: 'MigrationDatabase' | 'Database',
  snapshot: DbProjectionSnapshot,
  exported: boolean
) {
  const lines = [`${exported ? 'export ' : ''}interface ${name} {`]

  for (const table of snapshot.tables) {
    lines.push(`  ${quoteProperty(table.name)}: {`)
    for (const column of table.columns) {
      lines.push(`    ${quoteProperty(column.name)}: ${renderTsType(column)}`)
    }
    lines.push('  }')
  }

  lines.push('}')
  return lines.join('\n')
}

function renderTsType(column: SnapshotColumn) {
  const type = tsType(column.type.name)
  return column.nullable ? `${type} | null` : type
}

function tsType(typeName: SnapshotColumnType['name']) {
  switch (typeName) {
    case 'integer':
    case 'smallint':
    case 'decimal':
    case 'numeric':
      return 'number'
    case 'boolean':
      return 'boolean'
    case 'char':
    case 'varchar':
    case 'date':
    case 'time':
    case 'timestamp':
      return 'string'
  }
}

function renderUpStatements(snapshot: DbProjectionSnapshot): string[] {
  const lines: string[] = []

  for (const table of snapshot.tables) {
    lines.push(...indent(renderCreateTable(table), 2), '')
  }

  for (const table of snapshot.tables) {
    for (const index of table.indexes) {
      lines.push(...indent(renderCreateIndex(table.name, index), 2), '')
    }
  }

  lines.pop()
  return lines
}

function renderDownStatements(snapshot: DbProjectionSnapshot): string[] {
  const lines: string[] = []

  for (const table of snapshot.tables.toReversed()) {
    for (const index of table.indexes.toReversed()) {
      lines.push(
        `  await db.schema.dropIndex(${literal(index.name)}).execute()`
      )
    }
  }

  for (const table of snapshot.tables.toReversed()) {
    for (const foreignKey of table.foreignKeys.toReversed()) {
      lines.push(
        `  await db.schema.alterTable(${literal(table.name)}).dropConstraint(${literal(foreignKey.name)}).execute()`
      )
    }
  }

  for (const table of snapshot.tables.toReversed()) {
    lines.push(`  await db.schema.dropTable(${literal(table.name)}).execute()`)
  }

  return lines
}

function renderDiffStatements(
  before: DbProjectionSnapshot,
  after: DbProjectionSnapshot
): string[] {
  const lines: string[] = []
  const beforeTables = mapById(before.tables)
  const afterTables = mapById(after.tables)

  for (const beforeTable of before.tables) {
    const afterTable = afterTables.get(beforeTable.id)

    for (const index of beforeTable.indexes.toReversed()) {
      if (afterTable === undefined || !hasSameIndex(afterTable, index)) {
        lines.push(
          `  await db.schema.dropIndex(${literal(index.name)}).execute()`
        )
      }
    }
  }

  for (const beforeTable of before.tables) {
    const afterTable = afterTables.get(beforeTable.id)
    for (const foreignKey of beforeTable.foreignKeys.toReversed()) {
      if (
        afterTable === undefined ||
        !hasSameForeignKey(afterTable, foreignKey)
      ) {
        lines.push(renderDropConstraint(beforeTable.name, foreignKey.name))
      }
    }
  }

  for (const beforeTable of before.tables) {
    const afterTable = afterTables.get(beforeTable.id)
    for (const unique of beforeTable.uniqueConstraints.toReversed()) {
      if (
        afterTable === undefined ||
        !hasSameNamedColumns(afterTable, unique)
      ) {
        lines.push(renderDropConstraint(beforeTable.name, unique.name))
      }
    }
  }

  for (const beforeTable of before.tables) {
    const afterTable = afterTables.get(beforeTable.id)
    if (
      beforeTable.primaryKey !== undefined &&
      (afterTable === undefined ||
        !sameValue(beforeTable.primaryKey, afterTable.primaryKey))
    ) {
      lines.push(
        renderDropConstraint(beforeTable.name, beforeTable.primaryKey.name)
      )
    }
  }

  for (const beforeTable of before.tables) {
    const afterTable = afterTables.get(beforeTable.id)
    if (afterTable !== undefined && beforeTable.name !== afterTable.name) {
      lines.push(
        `  await db.schema.alterTable(${literal(beforeTable.name)}).renameTo(${literal(afterTable.name)}).execute()`
      )
    }
  }

  for (const beforeTable of before.tables) {
    const afterTable = afterTables.get(beforeTable.id)
    if (afterTable === undefined) continue

    const afterColumns = mapById(afterTable.columns)
    for (const beforeColumn of beforeTable.columns) {
      const afterColumn = afterColumns.get(beforeColumn.id)
      if (afterColumn !== undefined && beforeColumn.name !== afterColumn.name) {
        lines.push(
          `  await db.schema.alterTable(${literal(afterTable.name)}).renameColumn(${literal(beforeColumn.name)}, ${literal(afterColumn.name)}).execute()`
        )
      }
    }
  }

  for (const beforeTable of before.tables.toReversed()) {
    const afterTable = afterTables.get(beforeTable.id)
    if (afterTable === undefined) {
      lines.push(
        `  await db.schema.dropTable(${literal(beforeTable.name)}).execute()`
      )
      continue
    }

    const afterColumns = mapById(afterTable.columns)
    for (const beforeColumn of beforeTable.columns.toReversed()) {
      if (!afterColumns.has(beforeColumn.id)) {
        lines.push(
          `  await db.schema.alterTable(${literal(afterTable.name)}).dropColumn(${literal(beforeColumn.name)}).execute()`
        )
      }
    }
  }

  for (const beforeTable of before.tables) {
    const afterTable = afterTables.get(beforeTable.id)
    if (afterTable === undefined) continue

    const beforeColumns = mapById(beforeTable.columns)
    for (const afterColumn of afterTable.columns) {
      const beforeColumn = beforeColumns.get(afterColumn.id)
      if (beforeColumn === undefined) continue

      lines.push(
        ...renderAlterColumnStatements(
          afterTable.name,
          beforeColumn,
          afterColumn
        )
      )
    }
  }

  for (const afterTable of after.tables) {
    const beforeTable = beforeTables.get(afterTable.id)
    if (beforeTable === undefined) {
      lines.push(...indent(renderCreateTable(afterTable), 2))
      continue
    }

    const beforeColumns = mapById(beforeTable.columns)
    for (const afterColumn of afterTable.columns) {
      if (!beforeColumns.has(afterColumn.id)) {
        lines.push(
          `  await db.schema.alterTable(${literal(afterTable.name)}).addColumn(${renderColumnArguments(afterColumn)}).execute()`
        )
      }
    }
  }

  for (const afterTable of after.tables) {
    const beforeTable = beforeTables.get(afterTable.id)
    if (beforeTable === undefined) continue

    if (
      afterTable.primaryKey !== undefined &&
      !sameValue(beforeTable.primaryKey, afterTable.primaryKey)
    ) {
      lines.push(renderAddPrimaryKey(afterTable.name, afterTable.primaryKey))
    }

    for (const unique of afterTable.uniqueConstraints) {
      if (!hasSameNamedColumns(beforeTable, unique)) {
        lines.push(renderAddUniqueConstraint(afterTable.name, unique))
      }
    }

    for (const foreignKey of afterTable.foreignKeys) {
      if (!hasSameForeignKey(beforeTable, foreignKey)) {
        lines.push(...renderAddForeignKey(afterTable.name, foreignKey))
      }
    }
  }

  for (const afterTable of after.tables) {
    const beforeTable = beforeTables.get(afterTable.id)
    for (const index of afterTable.indexes) {
      if (beforeTable === undefined || !hasSameIndex(beforeTable, index)) {
        lines.push(...indent(renderCreateIndex(afterTable.name, index), 2))
      }
    }
  }

  return lines
}

function renderAlterColumnStatements(
  tableName: string,
  before: SnapshotColumn,
  after: SnapshotColumn
) {
  const lines: string[] = []
  if (!sameValue(before.type, after.type)) {
    lines.push(
      `  await db.schema.alterTable(${literal(tableName)}).alterColumn(${literal(after.name)}, column => column.setDataType(${literal(renderSqlType(after.type))})).execute()`
    )
  }
  if (before.nullable !== after.nullable) {
    const method = after.nullable ? 'dropNotNull' : 'setNotNull'
    lines.push(
      `  await db.schema.alterTable(${literal(tableName)}).alterColumn(${literal(after.name)}, column => column.${method}()).execute()`
    )
  }
  if (!sameValue(before.default, after.default)) {
    if (after.default.kind === 'omitted') {
      lines.push(
        `  await db.schema.alterTable(${literal(tableName)}).alterColumn(${literal(after.name)}, column => column.dropDefault()).execute()`
      )
    } else {
      lines.push(
        `  await db.schema.alterTable(${literal(tableName)}).alterColumn(${literal(after.name)}, column => column.setDefault(${literal(after.default.value)})).execute()`
      )
    }
  }
  return lines
}

function renderDropConstraint(tableName: string, constraintName: string) {
  return `  await db.schema.alterTable(${literal(tableName)}).dropConstraint(${literal(constraintName)}).execute()`
}

function renderAddPrimaryKey(
  tableName: string,
  primaryKey: SnapshotNamedColumns
) {
  return `  await db.schema.alterTable(${literal(tableName)}).addPrimaryKeyConstraint(${literal(primaryKey.name)}, ${literalArray(primaryKey.columns)}).execute()`
}

function renderAddUniqueConstraint(
  tableName: string,
  unique: SnapshotNamedColumns
) {
  return `  await db.schema.alterTable(${literal(tableName)}).addUniqueConstraint(${literal(unique.name)}, ${literalArray(unique.columns)}).execute()`
}

function renderAddForeignKey(
  tableName: string,
  foreignKey: SnapshotForeignKey
) {
  const lines = [
    `  await db.schema`,
    `    .alterTable(${literal(tableName)})`,
    `    .addForeignKeyConstraint(`,
    `      ${literal(foreignKey.name)},`,
    `      ${literalArray(foreignKey.columns)},`,
    `      ${literal(foreignKey.references.table)},`,
    `      ${literalArray(foreignKey.references.columns)}`
  ]
  const actions = renderForeignKeyActions(foreignKey)

  if (actions.length > 0) {
    lines[lines.length - 1] = `${lines[lines.length - 1]},`
    lines.push(`      constraint => constraint.${actions.join('.')}`)
  }

  lines.push(`    )`)
  lines.push(`    .execute()`)
  return lines
}

function mapById<T extends { id: string }>(values: T[]) {
  return new Map(values.map(value => [value.id, value]))
}

function hasSameNamedColumns(
  table: SnapshotTable,
  named: SnapshotNamedColumns
) {
  return table.uniqueConstraints.some(candidate => sameValue(candidate, named))
}

function hasSameForeignKey(
  table: SnapshotTable,
  foreignKey: SnapshotForeignKey
) {
  return table.foreignKeys.some(candidate => sameValue(candidate, foreignKey))
}

function hasSameIndex(table: SnapshotTable, index: SnapshotIndex) {
  return table.indexes.some(candidate => sameValue(candidate, index))
}

function sameValue(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right)
}

function renderCreateTable(table: SnapshotTable): string[] {
  const lines = [`await db.schema`, `  .createTable(${literal(table.name)})`]

  for (const column of table.columns) {
    lines.push(`  .addColumn(${renderColumnArguments(column)})`)
  }

  if (table.primaryKey !== undefined) {
    lines.push(
      `  .addPrimaryKeyConstraint(${literal(table.primaryKey.name)}, ${literalArray(table.primaryKey.columns)})`
    )
  }

  for (const unique of table.uniqueConstraints) {
    lines.push(
      `  .addUniqueConstraint(${literal(unique.name)}, ${literalArray(unique.columns)})`
    )
  }

  for (const foreignKey of table.foreignKeys) {
    lines.push(...renderForeignKey(foreignKey))
  }

  lines.push(`  .execute()`)
  return lines
}

function renderColumnArguments(column: SnapshotColumn) {
  const argumentsText = [
    literal(column.name),
    literal(renderSqlType(column.type))
  ]
  const builderCalls: string[] = []

  if (!column.nullable) builderCalls.push('notNull()')
  if (column.default.kind === 'literal') {
    builderCalls.push(`defaultTo(${literal(column.default.value)})`)
  }

  if (builderCalls.length === 0) return argumentsText.join(', ')

  return [...argumentsText, `column => column.${builderCalls.join('.')}`].join(
    ', '
  )
}

function renderSqlType(type: SnapshotColumnType) {
  if (type.length !== undefined) return `${type.name}(${type.length})`
  if (type.precision !== undefined && type.scale !== undefined) {
    return `${type.name}(${type.precision}, ${type.scale})`
  }
  if (type.precision !== undefined) return `${type.name}(${type.precision})`
  return type.name
}

function renderForeignKey(foreignKey: SnapshotForeignKey): string[] {
  const lines = [
    `  .addForeignKeyConstraint(`,
    `    ${literal(foreignKey.name)},`,
    `    ${literalArray(foreignKey.columns)},`,
    `    ${literal(foreignKey.references.table)},`,
    `    ${literalArray(foreignKey.references.columns)}`
  ]
  const actions = renderForeignKeyActions(foreignKey)

  if (actions.length > 0) {
    lines[lines.length - 1] = `${lines[lines.length - 1]},`
    lines.push(`    constraint => constraint.${actions.join('.')}`)
  }

  lines.push(`  )`)
  return lines
}

function renderForeignKeyActions(foreignKey: SnapshotForeignKey) {
  const actions: string[] = []
  if (foreignKey.onDelete !== undefined) {
    actions.push(
      `onDelete(${literal(renderReferentialAction(foreignKey.onDelete))})`
    )
  }
  if (foreignKey.onUpdate !== undefined) {
    actions.push(
      `onUpdate(${literal(renderReferentialAction(foreignKey.onUpdate))})`
    )
  }
  return actions
}

function renderReferentialAction(
  action: NonNullable<SnapshotForeignKey['onDelete']>
) {
  switch (action) {
    case 'setNull':
      return 'set null'
    case 'setDefault':
      return 'set default'
    case 'noAction':
      return 'no action'
    case 'restrict':
    case 'cascade':
      return action
  }
}

function renderCreateIndex(tableName: string, index: SnapshotIndex): string[] {
  const lines = [
    `await db.schema`,
    `  .createIndex(${literal(index.name)})`,
    `  .on(${literal(tableName)})`
  ]

  if (index.columns.length === 1) {
    lines.push(`  .column(${literal(index.columns[0].name)})`)
  } else {
    lines.push(
      `  .columns(${literalArray(index.columns.map(column => column.name))})`
    )
  }
  lines.push(`  .execute()`)

  return lines
}

function rejectOrderedIndexes(snapshot: DbProjectionSnapshot) {
  for (const table of snapshot.tables) {
    for (const index of table.indexes) {
      for (const column of index.columns) {
        if (column.order !== undefined) {
          throw new Error(
            `Ordered index fields are not supported by the kysely-migration command: ${table.name}.${column.name}`
          )
        }
      }
    }
  }
}

function rejectUnsupportedKyselyColumnTypes(snapshot: DbProjectionSnapshot) {
  for (const table of snapshot.tables) {
    for (const column of table.columns) {
      const sqlType = renderSqlType(column.type)
      if (!isSupportedKyselyColumnType(column.type)) {
        throw new Error(
          `Column type is not supported by the kysely-migration command: ${table.name}.${column.name} ${sqlType}`
        )
      }
    }
  }
}

function isSupportedKyselyColumnType(type: SnapshotColumnType) {
  if (type.name === 'numeric' && type.scale === undefined) return false
  return true
}

function indent(lines: string[], spaces: number) {
  const prefix = ' '.repeat(spaces)
  return lines.map(line => `${prefix}${line}`)
}

function quoteProperty(value: string) {
  return `${JSON.stringify(value)}`
}

function literal(value: string | number | boolean | null) {
  return JSON.stringify(value)
}

function literalArray(values: string[]) {
  return `[${values.map(literal).join(', ')}]`
}

function flushStdout() {
  return new Promise<void>(resolve => process.stdout.write('', () => resolve()))
}

function writeOptionError(reason: string) {
  writeSync(2, `Error: ${reason}\n\n${usage}\n`)
}

async function reportMigrationError(step: string, error: unknown) {
  log.error(`${step} failed`)
  writeReason((error as Error).message)
  outro(colors.red('Failed'))
  await flushStdout()
  return 1
}

function writeReason(reason: string) {
  process.stdout.write(`${reason}\n`)
}
