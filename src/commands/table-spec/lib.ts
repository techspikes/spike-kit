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
import { parseSpecification } from '../../core/parser.ts'
import type { IndexField, Specification, Store } from '../../core/spec.ts'
import {
  type ValidationIssue,
  validateSpecification
} from '../../core/validator.ts'

export type ShotInput = {
  spec: string
  sources?: {
    openapi: (source: string) => Promise<string>
  }
  metadata: TableSpecMetadata
}

export type ShotOutput = {
  tableSpec: string
}

type TableSpecMetadata = {
  source: string
  sourceSha256: string
  generatedAt: string
}

class TableSpecValidationError extends Error {
  readonly issues: ValidationIssue[]

  constructor(issues: ValidationIssue[]) {
    super(issues.map(issue => issue.message).join('\n'))
    this.name = 'TableSpecValidationError'
    this.issues = issues
  }
}

export async function shot(input: ShotInput): Promise<ShotOutput> {
  const result = await validateSpecification(parseSpecification(input.spec), {
    loadOpenApiSource: input.sources?.openapi
  })

  if (!result.isValid) {
    throw new TableSpecValidationError(result.issues)
  }

  return {
    tableSpec: renderTableSpec(result.data, input.metadata)
  }
}

function renderTableSpec(spec: Specification, metadata: TableSpecMetadata) {
  return toMarkdown(createTableSpecDocumentTree(spec, metadata), {
    extensions: [
      frontmatterToMarkdown(['yaml']),
      gfmTableToMarkdown({ tablePipeAlign: true })
    ]
  })
}

function createTableSpecDocumentTree(
  spec: Specification,
  metadata: TableSpecMetadata
): Root {
  const children: RootContent[] = [
    createFrontMatter(metadata),
    heading(1, spec.info.name)
  ]

  for (const store of Object.values(spec.stores)) {
    children.push(...createStoreNodes(store, spec))
  }

  return { type: 'root', children }
}

function createFrontMatter(metadata: TableSpecMetadata): Yaml {
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

  nodes.push(
    paragraph([text(store.reason)]),
    createTable(
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
  )

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
