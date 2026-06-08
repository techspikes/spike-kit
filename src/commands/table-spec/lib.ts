import { dump } from 'js-yaml'
import type {
  Heading,
  Paragraph,
  PhrasingContent,
  Root,
  RootContent,
  Strong,
  Table,
  TableCell,
  TableRow,
  Text,
  Yaml
} from 'mdast'
import { frontmatterToMarkdown } from 'mdast-util-frontmatter'
import { gfmTableToMarkdown } from 'mdast-util-gfm-table'
import { toMarkdown } from 'mdast-util-to-markdown'
import { parseSpecificationText } from '../../core/parser.ts'
import type { IndexField, Specification, Store } from '../../core/spec.ts'
import {
  type ValidationIssue,
  validateSpecification
} from '../../core/validator.ts'

export type TableSpecDocumentMetadata = {
  source: string
  sourceSha256: string
  generatedAt: string
}

type TableSpecEvent =
  | { type: 'parsed' }
  | { type: 'validated' }
  | { type: 'rendered' }

type GenerateTableSpecDocumentOptions = {
  metadata: TableSpecDocumentMetadata
  sourceName?: string
  loadOpenApiSource?: (source: string) => Promise<string>
  onEvent?: (event: TableSpecEvent) => void
}

export class TableSpecValidationError extends Error {
  readonly issues: ValidationIssue[]

  constructor(issues: ValidationIssue[]) {
    super(issues.map(issue => issue.message).join('\n'))
    this.name = 'TableSpecValidationError'
    this.issues = issues
  }
}

export async function generateTableSpecDocument(
  source: string,
  options: GenerateTableSpecDocumentOptions
): Promise<string> {
  const input = parseSpecificationText(source, options.sourceName ?? '<input>')
  options.onEvent?.({ type: 'parsed' })

  const result = await validateSpecification(input, {
    loadOpenApiSource: options.loadOpenApiSource
  })

  if (!result.success) {
    throw new TableSpecValidationError(result.issues)
  }
  options.onEvent?.({ type: 'validated' })

  const document = renderTableSpecDocument(result.data, options.metadata)
  options.onEvent?.({ type: 'rendered' })

  return document
}

export function renderTableSpecDocument(
  dsl: Specification,
  metadata: TableSpecDocumentMetadata
) {
  return toMarkdown(createTableSpecDocumentTree(dsl, metadata), {
    extensions: [
      frontmatterToMarkdown(['yaml']),
      gfmTableToMarkdown({ tablePipeAlign: true })
    ]
  })
}

function createTableSpecDocumentTree(
  dsl: Specification,
  metadata: TableSpecDocumentMetadata
): Root {
  const children: RootContent[] = [
    createFrontMatter(metadata),
    heading(1, dsl.info.name)
  ]

  for (const store of Object.values(dsl.stores)) {
    children.push(...createStoreNodes(store, dsl))
  }

  return { type: 'root', children }
}

function createFrontMatter(metadata: TableSpecDocumentMetadata): Yaml {
  const source = dump(
    { source: metadata.source },
    { lineWidth: -1, noRefs: true }
  ).trimEnd()

  return {
    type: 'yaml',
    value: [
      source,
      `source_sha256: ${metadata.sourceSha256}`,
      `generated_at: ${metadata.generatedAt}`
    ].join('\n')
  }
}

function createStoreNodes(store: Store, dsl: Specification): RootContent[] {
  const nodes: RootContent[] = [heading(2, store.name)]
  const uniqueKeys = store.keys?.unique ?? []
  const foreignKeys = store.keys?.foreign ?? []
  const indexes = store.indexes ?? []

  if (store.tentative === true) {
    nodes.push(
      paragraph([strong('This table is tentative and requires human review.')])
    )
  }

  nodes.push(paragraph([text(store.reason)]), createFieldsTable(store))

  if (store.keys?.primary !== undefined) {
    nodes.push(
      heading(3, 'Primary Key'),
      createTable(
        ['Constraint Name', 'Columns'],
        [
          [
            store.keys.primary.name,
            renderFieldNames(store, store.keys.primary.fields)
          ]
        ]
      )
    )
  }

  if (uniqueKeys.length > 0) {
    nodes.push(
      heading(3, 'Unique Constraints'),
      createTable(
        ['Constraint Name', 'Columns'],
        uniqueKeys.map(unique => [
          unique.name,
          renderFieldNames(store, unique.fields)
        ])
      )
    )
  }

  if (foreignKeys.length > 0) {
    nodes.push(
      heading(3, 'Foreign Keys'),
      createTable(
        [
          'Constraint Name',
          'Columns',
          'Referenced Table',
          'Referenced Columns',
          'On Delete',
          'On Update'
        ],
        foreignKeys.map(foreign => {
          const referencedStore = dsl.stores[foreign.references.store]
          return [
            foreign.name,
            renderFieldNames(store, foreign.fields),
            referencedStore.name,
            renderFieldNames(referencedStore, foreign.references.fields),
            foreign.onDelete ?? '',
            foreign.onUpdate ?? ''
          ]
        })
      )
    )
  }

  if (indexes.length > 0) {
    nodes.push(
      heading(3, 'Indexes'),
      createTable(
        ['Index Name', 'Indexed Columns', 'Description'],
        indexes.map(index => [
          index.name,
          index.fields.map(field => renderIndexField(store, field)).join(', '),
          index.reason ?? ''
        ])
      )
    )
  }

  return nodes
}

function createFieldsTable(store: Store) {
  return createTable(
    [
      'Column',
      'Data Type',
      'Nullable',
      'Default',
      'Format',
      'Check Values',
      'Description'
    ],
    Object.values(store.fields).map(field => [
      field.name,
      renderType(field.type),
      field.nullable ? 'yes' : 'no',
      Object.hasOwn(field, 'default') ? String(field.default) : '',
      field.format ?? '',
      field.enum?.join(', ') ?? '',
      field.aliases?.join(', ') ?? ''
    ])
  )
}

function renderType(fieldType: Store['fields'][string]['type']) {
  if (fieldType.length !== undefined) {
    return `${fieldType.name}(${fieldType.length})`
  }
  if (fieldType.precision !== undefined && fieldType.scale !== undefined) {
    return `${fieldType.name}(${fieldType.precision}, ${fieldType.scale})`
  }
  if (fieldType.precision !== undefined) {
    return `${fieldType.name}(${fieldType.precision})`
  }
  return fieldType.name
}

function renderFieldNames(store: Store, fieldIds: string[]) {
  return fieldIds.map(fieldId => store.fields[fieldId].name).join(', ')
}

function renderIndexField(store: Store, indexField: IndexField) {
  if (typeof indexField === 'string') {
    return store.fields[indexField].name
  }

  const fieldName = store.fields[indexField.field].name
  return indexField.order === undefined
    ? fieldName
    : `${fieldName} ${indexField.order}`
}

function createTable(headers: string[], rows: string[][]): Table {
  return {
    type: 'table',
    align: headers.map(() => null),
    children: [createTableRow(headers), ...rows.map(row => createTableRow(row))]
  }
}

function createTableRow(values: string[]): TableRow {
  return {
    type: 'tableRow',
    children: values.map(value => createTableCell(value))
  }
}

function createTableCell(value: string): TableCell {
  return {
    type: 'tableCell',
    children: [text(normalizeTableCellText(value))]
  }
}

function heading(depth: Heading['depth'], value: string): Heading {
  return {
    type: 'heading',
    depth,
    children: [text(value)]
  }
}

function paragraph(children: PhrasingContent[]): Paragraph {
  return {
    type: 'paragraph',
    children
  }
}

function strong(value: string): Strong {
  return {
    type: 'strong',
    children: [text(value)]
  }
}

function text(value: string): Text {
  return { type: 'text', value }
}

function normalizeTableCellText(value: string) {
  return value.replace(/\s*\r?\n\s*/g, ' ')
}
