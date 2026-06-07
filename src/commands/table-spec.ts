import { createHash } from 'node:crypto'
import { writeSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { basename } from 'node:path'
import { parseArgs } from 'node:util'
import { intro, log, outro } from '@clack/prompts'
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
import pc from 'picocolors'
import { parseSpecificationText } from '../parser.ts'
import type { IndexField, Specification, Store } from '../schema.ts'
import { validateSpecification } from '../validator.ts'

const colors = pc.createColors(true)

export type TableSpecDocumentMetadata = {
  source: string
  sourceSha256: string
  generatedAt: string
}

export const usage = [
  'Usage:',
  '  shot table-spec <file> --output <file>',
  '  shot table-spec <file> -o <file>',
  '',
  'Generate a Markdown table specification document.',
  '',
  'Options:',
  '  -o, --output <file>  Write the document to a file',
  '  -h, --help           Show this help'
].join('\n')

export async function runTableSpecCommand(args: string[]) {
  let filePath: string
  let outputPath: string

  try {
    const parsed = parseArgs({
      args,
      allowPositionals: true,
      strict: true,
      options: {
        output: { type: 'string', short: 'o' },
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
  } catch (error) {
    writeOptionError((error as Error).message)
    return 1
  }

  intro('Table specification generation')

  let source: Buffer
  try {
    source = await readFile(filePath)
    log.success('Data Sketch read')
  } catch (error) {
    log.error('Reading Data Sketch failed')
    writeReason((error as Error).message)
    outro(colors.red('Failed'))
    await flushStdout()
    return 1
  }

  const sourceSha256 = createHash('sha256').update(source).digest('hex')
  let input: unknown
  try {
    input = parseSpecificationText(source.toString('utf8'), filePath)
  } catch (error) {
    return reportTableSpecError('Parsing Data Sketch', error)
  }

  const result = await validateSpecification(input, { sourcePath: filePath })

  if (!result.success) {
    return reportTableSpecValidationIssues(
      'Validating Data Sketch',
      result.issues.map(issue => issue.message)
    )
  }
  log.success('Validating Data Sketch')

  const output = renderTableSpecDocument(result.data, {
    source: basename(filePath),
    sourceSha256,
    generatedAt: new Date().toISOString()
  })
  log.success('Rendering table specification')

  try {
    await writeFile(outputPath, output)
    log.success('Table specification written')
  } catch (error) {
    log.error('Writing table specification failed')
    writeReason((error as Error).message)
    outro(colors.red('Failed'))
    await flushStdout()
    return 1
  }

  log.success('Table specification generated')
  outro(colors.green('Succeeded'))
  await flushStdout()
  return 0
}

function flushStdout() {
  return new Promise<void>(resolve => process.stdout.write('', () => resolve()))
}

function writeOptionError(reason: string) {
  writeSync(2, `Error: ${reason}\n\n${usage}\n`)
}

async function reportTableSpecError(step: string, error: unknown) {
  log.error(`${step} failed`)
  writeReason((error as Error).message)
  outro(colors.red('Failed'))
  await flushStdout()
  return 1
}

async function reportTableSpecValidationIssues(
  step: string,
  messages: string[]
) {
  log.error(`${step} failed`)
  writeValidationIssues(messages)
  outro(colors.red('Failed'))
  await flushStdout()
  return 1
}

function writeValidationIssues(messages: string[]) {
  process.stdout.write(`${messages.join('\n')}\n`)
}

function writeReason(reason: string) {
  process.stdout.write(`${reason}\n`)
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
