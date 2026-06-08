import type { IndexField, Specification, Store } from './spec.ts'

export const dbProjectionSnapshotIdentifier =
  'data-sketch/db-projection-snapshot'
export const dataSketchVersion = '1.0.0-draft.0'

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
