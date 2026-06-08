import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve } from 'node:path'
import { afterEach, describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { runSteps } from '../../../src/commands/table-spec/index.ts'
import { shot } from '../../../src/commands/table-spec/lib.ts'
import {
  createTemporaryDirectory,
  readTemporaryFile,
  removeTemporaryDirectories,
  runCommand,
  writeTemporaryFile
} from '../../helper.ts'

const fixedMetadata: TableSpecDocumentMetadata = {
  source: 'online-shop-minimal.valid.yaml',
  sourceSha256:
    '33057655ad2687f583a20b9e15e4023d96871ad240ed45eb5b1a91268986fb0f',
  generatedAt: '2026-06-06T12:34:56.789Z'
}

const temporaryDirectories: string[] = []
const basePath = fileURLToPath(import.meta.url)
const baseDirectory = dirname(basePath)

type TableSpecDocumentMetadata = {
  source: string
  sourceSha256: string
  generatedAt: string
}

afterEach(async () => {
  await removeTemporaryDirectories(temporaryDirectories)
})

async function renderTableSpecFixture(
  relativePath: string,
  metadata: TableSpecDocumentMetadata = fixedMetadata
) {
  const source = await readFixtureFile(relativePath)
  const result = await shot({
    spec: source,
    metadata
  })
  return result.tableSpec
}

async function readFixtureFile(relativePath: string) {
  return readFile(resolveFixtureFilePath(relativePath), 'utf8')
}

function resolveFixtureFilePath(relativePath: string) {
  if (!relativePath.startsWith('fixtures/')) {
    throw new Error('fixture path must start with fixtures/')
  }

  const resolvedPath = resolve(baseDirectory, relativePath)
  const pathFromBase = relative(baseDirectory, resolvedPath)

  if (
    pathFromBase === '' ||
    pathFromBase.startsWith('..') ||
    isAbsolute(pathFromBase)
  ) {
    throw new Error('fixture path must stay under the test directory')
  }

  return resolvedPath
}

function normalizeGeneratedAt(output: string) {
  return output.replace(
    /^generated_at: .+$/m,
    'generated_at: 2026-06-06T12:34:56.789Z'
  )
}

describe('table-spec', () => {
  describe('cli behavior', () => {
    it('prints table-spec usage for --help', async () => {
      const result = await runCommand(() => runSteps(['--help']))

      assert.equal(result.isFailed, false)
      assert.match(result.stdout, /Usage:/)
      assert.match(result.stdout, /--output/)
      assert.doesNotMatch(result.stdout, /--stdout/)
      assert.doesNotMatch(result.stdout, /--stdin/)
    })

    it('prints table-spec usage for -h', async () => {
      const result = await runCommand(() => runSteps(['-h']))

      assert.equal(result.isFailed, false)
      assert.match(result.stdout, /Usage:/)
      assert.match(result.stdout, /--output/)
      assert.doesNotMatch(result.stdout, /--stdout/)
      assert.doesNotMatch(result.stdout, /--stdin/)
    })

    it('overwrites a document through the short output option', async () => {
      const directory = await createTemporaryDirectory(
        'shot-table-spec-',
        temporaryDirectories
      )
      const outputPath = resolve(directory, 'online-shop.md')
      await writeTemporaryFile(outputPath, 'outdated document\n')

      const result = await runCommand(() =>
        runSteps([
          resolveFixtureFilePath('fixtures/online-shop-minimal.valid.yaml'),
          '-o',
          outputPath
        ])
      )

      assert.equal(result.isFailed, false)
      assert.equal(result.stdout, '')
      const output = await readTemporaryFile(outputPath)
      assert.notEqual(output, 'outdated document\n')
    })

    it('requires an output mode', async () => {
      const result = await runCommand(() =>
        runSteps([
          resolveFixtureFilePath('fixtures/online-shop-minimal.valid.yaml')
        ])
      )

      assert.equal(result.isFailed, true)
      assert.match(result.error.message, /--output/)
      assert.match(result.stderr, /Usage:/)
    })

    it('requires an input mode', async () => {
      const result = await runCommand(() =>
        runSteps(['--output', 'online-shop.md'])
      )

      assert.equal(result.isFailed, true)
      assert.match(result.error.message, /input file/)
      assert.match(result.stderr, /Usage:/)
    })

    it('rejects an output option without a file name', async () => {
      const result = await runCommand(() =>
        runSteps([
          resolveFixtureFilePath('fixtures/online-shop-minimal.valid.yaml'),
          '--output'
        ])
      )

      assert.equal(result.isFailed, true)
      assert.match(result.error.message, /argument missing/)
      assert.match(result.stderr, /Usage:/)
    })

    it('rejects an unknown option', async () => {
      const result = await runCommand(() =>
        runSteps([
          resolveFixtureFilePath('fixtures/online-shop-minimal.valid.yaml'),
          '--unknown'
        ])
      )

      assert.equal(result.isFailed, true)
      assert.match(result.error.message, /Unknown option/)
      assert.match(result.stderr, /Usage:/)
    })
  })

  describe('document rendering', () => {
    it('generates a table specification document from source text', async () => {
      const source = await readFixtureFile(
        'fixtures/online-shop-minimal.valid.yaml'
      )
      const expected = await readFixtureFile(
        'fixtures/expected/online-shop-minimal.md'
      )
      const result = await shot({
        spec: source,
        metadata: fixedMetadata
      })

      assert.equal(result.tableSpec, expected)
    })

    it('renders the Valuable Data Specification v1 customer and order example as the expected table specification', async () => {
      const expected = await readFixtureFile(
        'fixtures/expected/online-shop-minimal.md'
      )

      const output = await renderTableSpecFixture(
        'fixtures/online-shop-minimal.valid.yaml'
      )

      assert.equal(output, expected)
    })

    it('renders field types, defaults, nullable values, and escaped table cells', async () => {
      const expected = await readFixtureFile(
        'fixtures/expected/online-shop-field-rendering.md'
      )
      const output = await renderTableSpecFixture(
        'fixtures/online-shop-field-rendering.valid.yaml',
        {
          ...fixedMetadata,
          sourceSha256: 'test-sha256',
          source: 'shop: tables.yaml'
        }
      )

      assert.equal(output, expected)
    })

    it('marks a tentative store for human review', async () => {
      const expected = await readFixtureFile(
        'fixtures/expected/online-shop-tentative-store.md'
      )
      const output = await renderTableSpecFixture(
        'fixtures/online-shop-tentative-store.valid.yaml',
        {
          ...fixedMetadata,
          source: 'online-shop-tentative-store.valid.yaml',
          sourceSha256: 'test-sha256'
        }
      )

      assert.equal(output, expected)
    })

    it('renders an explicitly ordered index field', async () => {
      const expected = await readFixtureFile(
        'fixtures/expected/online-shop-index-sort-order.md'
      )
      const output = await renderTableSpecFixture(
        'fixtures/online-shop-index-sort-order.valid.yaml',
        {
          ...fixedMetadata,
          source: 'online-shop-index-sort-order.valid.yaml',
          sourceSha256: 'test-sha256'
        }
      )

      assert.equal(output, expected)
    })

    it('renders omitted foreign key actions, index reasons, and index sort orders as empty table cells', async () => {
      const expected = await readFixtureFile(
        'fixtures/expected/online-shop-optional-rendering.md'
      )
      const output = await renderTableSpecFixture(
        'fixtures/online-shop-optional-rendering.valid.yaml',
        {
          ...fixedMetadata,
          source: 'online-shop-optional-rendering.valid.yaml',
          sourceSha256: 'test-sha256'
        }
      )

      assert.equal(output, expected)
    })
  })

  describe('file output behavior', () => {
    it('writes a document to the long output option', async () => {
      const directory = await createTemporaryDirectory(
        'shot-table-spec-',
        temporaryDirectories
      )
      const outputPath = resolve(directory, 'online-shop.md')
      const result = await runCommand(() =>
        runSteps([
          resolveFixtureFilePath('fixtures/online-shop-minimal.valid.yaml'),
          '--output',
          outputPath
        ])
      )

      const output = await readTemporaryFile(outputPath)
      const expected = await readFixtureFile(
        'fixtures/expected/online-shop-minimal.md'
      )
      assert.equal(result.isFailed, false)
      assert.equal(result.stdout, '')
      assert.equal(normalizeGeneratedAt(output), expected)
    })

    it('validates OpenAPI traces through the CLI source loader', async () => {
      const directory = await createTemporaryDirectory(
        'shot-table-spec-',
        temporaryDirectories
      )
      const outputPath = resolve(directory, 'openapi-trace.md')
      const result = await runCommand(() =>
        runSteps([
          resolveFixtureFilePath(
            'fixtures/online-shop-sources-openapi-ignored-members.valid.yaml'
          ),
          '--output',
          outputPath
        ])
      )

      const output = await readTemporaryFile(outputPath)
      const expected = await readFixtureFile(
        'fixtures/expected/online-shop-sources-openapi-ignored-members.md'
      )
      assert.equal(result.isFailed, false)
      assert.equal(result.stdout, '')
      assert.equal(normalizeGeneratedAt(output), expected)
    })

    it('shows the failed validation step and reason in file-output mode', async () => {
      const directory = await createTemporaryDirectory(
        'shot-table-spec-',
        temporaryDirectories
      )
      const outputPath = resolve(directory, 'online-shop.md')
      const result = await runCommand(() =>
        runSteps([
          resolveFixtureFilePath(
            'fixtures/online-shop-empty-stores.invalid.yaml'
          ),
          '--output',
          outputPath
        ])
      )

      assert.equal(result.isFailed, true)
      assert.match(result.error.message, /stores/)
      assert.match(result.stderr, /Validating Data Sketch failed/)
      assert.match(result.stderr, /stores/)

      await assert.rejects(readTemporaryFile(outputPath), /ENOENT/)
    })

    it('shows the failed parsing step and reason in file-output mode', async () => {
      const directory = await createTemporaryDirectory(
        'shot-table-spec-',
        temporaryDirectories
      )
      const outputPath = resolve(directory, 'online-shop.md')
      const result = await runCommand(() =>
        runSteps([
          resolveFixtureFilePath(
            'fixtures/online-shop-invalid-syntax.invalid.yaml'
          ),
          '--output',
          outputPath
        ])
      )

      assert.equal(result.isFailed, true)
      assert.match(result.error.message, /Failed to parse/)
      assert.match(result.stderr, /Validating Data Sketch failed/)
      assert.match(result.stderr, /Failed to parse/)

      await assert.rejects(readTemporaryFile(outputPath), /ENOENT/)
    })

    it('shows the failed reading step and reason in file-output mode', async () => {
      const directory = await createTemporaryDirectory(
        'shot-table-spec-',
        temporaryDirectories
      )
      const result = await runCommand(() =>
        runSteps([
          resolveFixtureFilePath('fixtures/online-shop-missing.yaml'),
          '--output',
          resolve(directory, 'online-shop.md')
        ])
      )

      assert.equal(result.isFailed, true)
      assert.match(result.error.message, /ENOENT/)
      assert.match(result.stderr, /Reading Data Sketch failed/)
      assert.match(result.stderr, /ENOENT/)
    })

    it('keeps an existing output document unchanged when validation fails in file-output mode', async () => {
      const directory = await createTemporaryDirectory(
        'shot-table-spec-',
        temporaryDirectories
      )
      const outputPath = resolve(directory, 'online-shop.md')
      await writeTemporaryFile(outputPath, 'approved table specification\n')

      const result = await runCommand(() =>
        runSteps([
          resolveFixtureFilePath(
            'fixtures/online-shop-empty-stores.invalid.yaml'
          ),
          '--output',
          outputPath
        ])
      )

      assert.equal(result.isFailed, true)
      assert.match(result.stderr, /Validating Data Sketch failed/)
      assert.equal(
        await readTemporaryFile(outputPath),
        'approved table specification\n'
      )
    })

    it('reports an output file write error as plain text', async () => {
      const directory = await createTemporaryDirectory(
        'shot-table-spec-',
        temporaryDirectories
      )
      const outputPath = resolve(directory, 'missing', 'online-shop.md')
      const result = await runCommand(() =>
        runSteps([
          resolveFixtureFilePath('fixtures/online-shop-minimal.valid.yaml'),
          '--output',
          outputPath
        ])
      )

      assert.equal(result.isFailed, true)
      assert.match(result.error.message, /ENOENT/)
      assert.match(result.stderr, /Writing table specification failed/)
      assert.match(result.stderr, /ENOENT/)
    })

    it('writes multiple validation issues without a reason box in file-output mode', async () => {
      const directory = await createTemporaryDirectory(
        'shot-table-spec-',
        temporaryDirectories
      )
      const result = await runCommand(() =>
        runSteps([
          resolveFixtureFilePath(
            'fixtures/online-shop-multiple-validation-issues.invalid.yaml'
          ),
          '--output',
          resolve(directory, 'online-shop.md')
        ])
      )

      assert.equal(result.isFailed, true)
      assert.match(result.error.message, /data-sketch/)
      assert.match(result.error.message, /info\.name/)
      assert.match(result.error.message, /stores/)
      assert.match(result.stderr, /Validating Data Sketch failed/)
      assert.match(result.stderr, /data-sketch/)
      assert.match(result.stderr, /info\.name/)
      assert.match(result.stderr, /stores/)
    })
  })
})
