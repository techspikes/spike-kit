import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import { runSteps } from '../../../src/commands/table-spec/index.ts'
import { shot } from '../../../src/commands/table-spec/lib.ts'
import {
  createTemporaryDirectory,
  fixturePath,
  joinFilePath,
  joinTemporaryFilePath,
  readTextFile,
  removeTemporaryDirectories,
  runCommand,
  writeTextFile
} from '../../helper.ts'

const fixedMetadata: TableSpecDocumentMetadata = {
  source: 'online-shop-minimal.valid.yaml',
  sourceSha256:
    '33057655ad2687f583a20b9e15e4023d96871ad240ed45eb5b1a91268986fb0f',
  generatedAt: '2026-06-06T12:34:56.789Z'
}

const temporaryDirectories: string[] = []

type TableSpecDocumentMetadata = {
  source: string
  sourceSha256: string
  generatedAt: string
}

afterEach(async () => {
  await removeTemporaryDirectories(temporaryDirectories)
})

async function renderTableSpecFixture(
  fixtureName: string,
  metadata: TableSpecDocumentMetadata = fixedMetadata
) {
  const source = await readTextFile(fixturePath(import.meta.url, fixtureName))
  const result = await shot({
    spec: source,
    metadata
  })
  return result.tableSpec
}

describe('table-spec', () => {
  describe('cli behavior', () => {
    it('prints table-spec usage for --help', async () => {
      const result = await runCommand(() => runSteps(['--help']))

      assert.equal(result.exitCode, 0)
      assert.match(result.stdout, /Usage:/)
      assert.match(result.stdout, /--output/)
      assert.doesNotMatch(result.stdout, /--stdout/)
      assert.doesNotMatch(result.stdout, /--stdin/)
    })

    it('prints table-spec usage for -h', async () => {
      const result = await runCommand(() => runSteps(['-h']))

      assert.equal(result.exitCode, 0)
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
      const outputPath = joinFilePath(directory, 'online-shop.md')
      await writeTextFile(outputPath, 'outdated document\n')

      const result = await runCommand(() =>
        runSteps([
          fixturePath(import.meta.url, 'online-shop-minimal.valid.yaml'),
          '-o',
          outputPath
        ])
      )

      assert.equal(result.exitCode, 0)
      const output = await readTextFile(outputPath)
      assert.match(output, /# online-shop/)
      assert.doesNotMatch(output, /outdated document/)
    })

    it('requires an output mode', async () => {
      const result = await runCommand(() =>
        runSteps([
          fixturePath(import.meta.url, 'online-shop-minimal.valid.yaml')
        ])
      )

      assert.equal(result.exitCode, 1)
      assert.match((result.error as Error).message, /--output/)
      assert.match(result.stderr, /Usage:/)
    })

    it('requires an input mode', async () => {
      const result = await runCommand(() =>
        runSteps(['--output', 'online-shop.md'])
      )

      assert.equal(result.exitCode, 1)
      assert.match((result.error as Error).message, /input file/)
      assert.match(result.stderr, /Usage:/)
    })

    it('rejects an output option without a file name', async () => {
      const result = await runCommand(() =>
        runSteps([
          fixturePath(import.meta.url, 'online-shop-minimal.valid.yaml'),
          '--output'
        ])
      )

      assert.equal(result.exitCode, 1)
      assert.match((result.error as Error).message, /argument missing/)
      assert.match(result.stderr, /Usage:/)
    })

    it('rejects an unknown option', async () => {
      const result = await runCommand(() =>
        runSteps([
          fixturePath(import.meta.url, 'online-shop-minimal.valid.yaml'),
          '--unknown'
        ])
      )

      assert.equal(result.exitCode, 1)
      assert.match((result.error as Error).message, /Unknown option/)
      assert.match(result.stderr, /Usage:/)
    })
  })

  describe('document rendering', () => {
    it('generates a table specification document from source text', async () => {
      const source = await readTextFile(
        fixturePath(import.meta.url, 'online-shop-minimal.valid.yaml')
      )
      const expected = await readTextFile(
        fixturePath(import.meta.url, 'expected/online-shop-minimal.md')
      )
      const result = await shot({
        spec: source,
        metadata: fixedMetadata
      })

      assert.equal(result.tableSpec, expected)
    })

    it('renders the Valuable Data Specification v1 customer and order example as the expected table specification', async () => {
      const expected = await readTextFile(
        fixturePath(import.meta.url, 'expected/online-shop-minimal.md')
      )

      const output = await renderTableSpecFixture(
        'online-shop-minimal.valid.yaml'
      )

      assert.equal(output, expected)
      assert.ok(
        output.startsWith(
          `---
source: online-shop-minimal.valid.yaml
source_sha256: 33057655ad2687f583a20b9e15e4023d96871ad240ed45eb5b1a91268986fb0f
generated_at: 2026-06-06T12:34:56.789Z
---

# online-shop`
        )
      )
      assert.match(
        output,
        /\| Column\s+\| Data Type\s+\| Nullable\s+\| Default\s+\| Format\s+\| Check Values\s+\| Description\s+\|/
      )
    })

    it('renders field types, defaults, nullable values, and escaped table cells', async () => {
      const output = await renderTableSpecFixture(
        'online-shop-field-rendering.valid.yaml',
        {
          ...fixedMetadata,
          source: 'shop: tables.yaml'
        }
      )

      assert.match(output, /source: 'shop: tables.yaml'/)
      assert.match(output, /Store products \| prices\.\nKeep catalog values/)
      assert.match(
        output,
        /\| price\s+\| decimal\(18, 2\) \| no\s+\| 0\.5\s+\|\s+\|\s+\|\s+\|/
      )
      assert.match(
        output,
        /\| rating\s+\| numeric\(3\)\s+\| yes\s+\| null\s+\|\s+\|\s+\|\s+\|/
      )
      assert.match(
        output,
        /\| active\s+\| boolean\s+\| no\s+\| true\s+\|\s+\|\s+\|\s+\|/
      )
      assert.match(
        output,
        /\| contact.*email\s+\| varchar\(254\)\s+\| yes\s+\|\s+\| email\s+\|\s+\|\s+\|/
      )
      assert.match(
        output,
        /\| status\s+\| varchar\(20\)\s+\| no\s+\| available \|\s+\| available, discontinued \| catalog \\\| state, availability label \|/
      )
      assert.match(output, /\| pk.*products\s+\| id, status \|/)
      assert.match(
        output,
        /\| ux.*products.*price.*rating \| price, rating\s+\|/
      )
      assert.match(
        output,
        /Used for product \\\| catalog filtering\. Reviewed during catalog maintenance\./
      )
    })

    it('marks a tentative store for human review', async () => {
      const output = await renderTableSpecFixture(
        'online-shop-tentative-store.valid.yaml'
      )

      assert.match(
        output,
        /\*\*This table is tentative and requires human review\.\*\*/
      )
      assert.doesNotMatch(output, /### Primary Key|### Indexes/)
    })

    it('renders an explicitly ordered index field', async () => {
      const output = await renderTableSpecFixture(
        'online-shop-index-sort-order.valid.yaml'
      )

      assert.match(
        output,
        /\| ix\\_orders\\_created\\_at \| created\\_at desc \|/
      )
    })

    it('renders omitted foreign key actions, index reasons, and index sort orders as empty table cells', async () => {
      const output = await renderTableSpecFixture(
        'online-shop-optional-rendering.valid.yaml'
      )

      assert.match(
        output,
        /\| fk\\_orders\\_customer \| customer\\_id \| customers \s+\| id \s+\| \s+\| \s+\|/
      )
      assert.match(
        output,
        /\| ix.*orders.*created.*at\s+\| created.*at\s+\|\s+\|/
      )
    })
  })

  describe('file output behavior', () => {
    it('writes a document to the long output option', async () => {
      const directory = await createTemporaryDirectory(
        'shot-table-spec-',
        temporaryDirectories
      )
      const outputPath = joinFilePath(directory, 'online-shop.md')
      const result = await runCommand(() =>
        runSteps([
          fixturePath(import.meta.url, 'online-shop-minimal.valid.yaml'),
          '--output',
          outputPath
        ])
      )

      const output = await readTextFile(outputPath)
      assert.equal(result.exitCode, 0)
      assert.match(
        output,
        /source_sha256: 33057655ad2687f583a20b9e15e4023d96871ad240ed45eb5b1a91268986fb0f/
      )
      assert.doesNotMatch(output, new RegExp('generated' + '_by:'))
      assert.match(output, /# online-shop/)
    })

    it('validates OpenAPI traces through the CLI source loader', async () => {
      const directory = await createTemporaryDirectory(
        'shot-table-spec-',
        temporaryDirectories
      )
      const outputPath = joinFilePath(directory, 'openapi-trace.md')
      const result = await runCommand(() =>
        runSteps([
          fixturePath(
            import.meta.url,
            'online-shop-sources-openapi-ignored-members.valid.yaml'
          ),
          '--output',
          outputPath
        ])
      )

      assert.equal(result.exitCode, 0)
      assert.match(await readTextFile(outputPath), /# online-shop/)
    })

    it('shows the failed validation step and reason in file-output mode', async () => {
      const directory = await createTemporaryDirectory(
        'shot-table-spec-',
        temporaryDirectories
      )
      const outputPath = joinFilePath(directory, 'online-shop.md')
      const result = await runCommand(() =>
        runSteps([
          fixturePath(import.meta.url, 'online-shop-empty-stores.invalid.yaml'),
          '--output',
          outputPath
        ])
      )

      assert.equal(result.exitCode, 1)
      assert.match((result.error as Error).message, /stores/)

      await assert.rejects(readTextFile(outputPath), /ENOENT/)
    })

    it('shows the failed parsing step and reason in file-output mode', async () => {
      const directory = await createTemporaryDirectory(
        'shot-table-spec-',
        temporaryDirectories
      )
      const outputPath = joinFilePath(directory, 'online-shop.md')
      const result = await runCommand(() =>
        runSteps([
          fixturePath(
            import.meta.url,
            'online-shop-invalid-syntax.invalid.yaml'
          ),
          '--output',
          outputPath
        ])
      )

      assert.equal(result.exitCode, 1)
      assert.match((result.error as Error).message, /Failed to parse/)

      await assert.rejects(readTextFile(outputPath), /ENOENT/)
    })

    it('shows the failed reading step and reason in file-output mode', async () => {
      const directory = await createTemporaryDirectory(
        'shot-table-spec-',
        temporaryDirectories
      )
      const result = await runCommand(() =>
        runSteps([
          fixturePath(import.meta.url, 'online-shop-missing.yaml'),
          '--output',
          joinFilePath(directory, 'online-shop.md')
        ])
      )

      assert.equal(result.exitCode, 1)
      assert.match((result.error as Error).message, /ENOENT/)
    })

    it('keeps an existing output document unchanged when validation fails in file-output mode', async () => {
      const directory = await createTemporaryDirectory(
        'shot-table-spec-',
        temporaryDirectories
      )
      const outputPath = joinFilePath(directory, 'online-shop.md')
      await writeTextFile(outputPath, 'approved table specification\n')

      const result = await runCommand(() =>
        runSteps([
          fixturePath(import.meta.url, 'online-shop-empty-stores.invalid.yaml'),
          '--output',
          outputPath
        ])
      )

      assert.equal(result.exitCode, 1)
      assert.equal(
        await readTextFile(outputPath),
        'approved table specification\n'
      )
    })

    it('reports an output file write error as plain text', async () => {
      const outputPath = joinTemporaryFilePath(
        'shot-missing-directory',
        'online-shop.md'
      )
      const result = await runCommand(() =>
        runSteps([
          fixturePath(import.meta.url, 'online-shop-minimal.valid.yaml'),
          '--output',
          outputPath
        ])
      )

      assert.equal(result.exitCode, 1)
      assert.match((result.error as Error).message, /ENOENT/)
    })

    it('writes multiple validation issues without a reason box in file-output mode', async () => {
      const directory = await createTemporaryDirectory(
        'shot-table-spec-',
        temporaryDirectories
      )
      const result = await runCommand(() =>
        runSteps([
          fixturePath(
            import.meta.url,
            'online-shop-multiple-validation-issues.invalid.yaml'
          ),
          '--output',
          joinFilePath(directory, 'online-shop.md')
        ])
      )

      assert.equal(result.exitCode, 1)
      assert.match((result.error as Error).message, /data-sketch/)
      assert.match((result.error as Error).message, /info\.name/)
      assert.match((result.error as Error).message, /stores/)
    })
  })
})
