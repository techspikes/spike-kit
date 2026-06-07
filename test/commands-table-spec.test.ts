import assert from 'node:assert/strict'
import { readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, it } from 'node:test'
import {
  renderTableSpecDocument,
  type TableSpecDocumentMetadata
} from '../src/commands/table-spec.ts'
import { parseSpecificationFile } from '../src/parser.ts'
import { validateSpecification } from '../src/validator.ts'
import {
  createTemporaryDirectory,
  fixturePath,
  runCli
} from './helper/helper.ts'

const fixedMetadata: TableSpecDocumentMetadata = {
  source: 'online-shop-minimal.valid.yaml',
  sourceSha256:
    '33057655ad2687f583a20b9e15e4023d96871ad240ed45eb5b1a91268986fb0f',
  generatedAt: '2026-06-06T12:34:56.789Z'
}

const greenSucceeded = `${String.fromCharCode(27)}[32mSucceeded${String.fromCharCode(27)}[39m`
const redFailed = `${String.fromCharCode(27)}[31mFailed${String.fromCharCode(27)}[39m`
const temporaryDirectories: string[] = []

afterEach(async () => {
  const directories = temporaryDirectories.splice(0)
  await Promise.all(
    directories.map(directory =>
      rm(directory, { recursive: true, force: true })
    )
  )
})

describe('table-spec', () => {
  describe('cli behavior', () => {
    it('prints table-spec usage for --help', async () => {
      const result = await runCli(process.execPath, [
        'src/cli.ts',
        'table-spec',
        '--help'
      ])

      assert.match(result.stdout, /--output/)
      assert.doesNotMatch(result.stdout, /--stdout/)
      assert.doesNotMatch(result.stdout, /--stdin/)
      assert.equal(result.stderr, '')
    })

    it('prints table-spec usage for -h', async () => {
      const result = await runCli(process.execPath, [
        'src/cli.ts',
        'table-spec',
        '-h'
      ])

      assert.match(result.stdout, /--output/)
      assert.doesNotMatch(result.stdout, /--stdout/)
      assert.doesNotMatch(result.stdout, /--stdin/)
      assert.equal(result.stderr, '')
    })

    it('overwrites a document through the short output option', async () => {
      const directory = await createTemporaryDirectory(
        'shot-table-spec-',
        temporaryDirectories
      )
      const outputPath = join(directory, 'online-shop.md')
      await writeFile(outputPath, 'outdated document\n')

      await runCli(process.execPath, [
        'src/cli.ts',
        'table-spec',
        fixturePath('table-spec', 'online-shop-minimal.valid.yaml'),
        '-o',
        outputPath
      ])

      const output = await readFile(outputPath, 'utf8')
      assert.match(output, /# online-shop/)
      assert.doesNotMatch(output, /outdated document/)
    })

    it('requires an output mode', async () => {
      await assert.rejects(
        runCli(process.execPath, [
          'src/cli.ts',
          'table-spec',
          fixturePath('table-spec', 'online-shop-minimal.valid.yaml')
        ]),
        error => {
          assert.equal((error as { stdout: string }).stdout, '')
          assert.match((error as { stderr: string }).stderr, /Error:/)
          assert.match((error as { stderr: string }).stderr, /Usage:/)
          assert.doesNotMatch((error as { stderr: string }).stderr, /Reason/)
          return true
        }
      )
    })

    it('requires an input mode', async () => {
      await assert.rejects(
        runCli(process.execPath, [
          'src/cli.ts',
          'table-spec',
          '--output',
          'online-shop.md'
        ]),
        error => {
          assert.equal((error as { stdout: string }).stdout, '')
          assert.match((error as { stderr: string }).stderr, /Error:/)
          assert.match((error as { stderr: string }).stderr, /input file/)
          assert.match((error as { stderr: string }).stderr, /Usage:/)
          assert.doesNotMatch((error as { stderr: string }).stderr, /Reason/)
          return true
        }
      )
    })

    it('rejects an output option without a file name', async () => {
      await assert.rejects(
        runCli(process.execPath, [
          'src/cli.ts',
          'table-spec',
          fixturePath('table-spec', 'online-shop-minimal.valid.yaml'),
          '--output'
        ]),
        error => {
          assert.equal((error as { stdout: string }).stdout, '')
          assert.match((error as { stderr: string }).stderr, /Error:/)
          assert.match((error as { stderr: string }).stderr, /Usage:/)
          assert.doesNotMatch((error as { stderr: string }).stderr, /Reason/)
          return true
        }
      )
    })

    it('rejects an unknown option', async () => {
      await assert.rejects(
        runCli(process.execPath, [
          'src/cli.ts',
          'table-spec',
          fixturePath('table-spec', 'online-shop-minimal.valid.yaml'),
          '--unknown'
        ]),
        error => {
          assert.equal((error as { stdout: string }).stdout, '')
          assert.match((error as { stderr: string }).stderr, /Error:/)
          assert.match((error as { stderr: string }).stderr, /Usage:/)
          assert.doesNotMatch((error as { stderr: string }).stderr, /Reason/)
          return true
        }
      )
    })
  })

  describe('document rendering', () => {
    it('renders the Valuable Data Specification v1 customer and order example as the expected table specification', async () => {
      const input = await parseSpecificationFile(
        fixturePath('table-spec', 'online-shop-minimal.valid.yaml')
      )
      const result = await validateSpecification(input, {
        sourcePath: fixturePath('table-spec', 'online-shop-minimal.valid.yaml')
      })
      assert.equal(result.success, true)
      if (!result.success) return

      const expected = await readFile(
        fixturePath('table-spec', 'expected/online-shop-minimal.md'),
        'utf8'
      )

      const output = renderTableSpecDocument(result.data, fixedMetadata)

      assert.equal(output, expected)
      assert.ok(
        output.startsWith(
          [
            '---',
            'source: online-shop-minimal.valid.yaml',
            'source_sha256: 33057655ad2687f583a20b9e15e4023d96871ad240ed45eb5b1a91268986fb0f',
            'generated_at: 2026-06-06T12:34:56.789Z',
            '---',
            '',
            '# online-shop'
          ].join('\n')
        )
      )
      assert.match(
        output,
        /\| Column\s+\| Data Type\s+\| Nullable\s+\| Default\s+\| Format\s+\| Check Values\s+\| Description\s+\|/
      )
    })

    it('renders field types, defaults, nullable values, and escaped table cells', async () => {
      const input = await parseSpecificationFile(
        fixturePath('table-spec', 'online-shop-field-rendering.valid.yaml')
      )
      const result = await validateSpecification(input, {
        sourcePath: fixturePath(
          'table-spec',
          'online-shop-field-rendering.valid.yaml'
        )
      })
      assert.equal(result.success, true)
      if (!result.success) return

      const output = renderTableSpecDocument(result.data, {
        ...fixedMetadata,
        source: 'shop: tables.yaml'
      })

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
      const input = await parseSpecificationFile(
        fixturePath('table-spec', 'online-shop-tentative-store.valid.yaml')
      )
      const result = await validateSpecification(input, {
        sourcePath: fixturePath(
          'table-spec',
          'online-shop-tentative-store.valid.yaml'
        )
      })
      assert.equal(result.success, true)
      if (!result.success) return

      const output = renderTableSpecDocument(result.data, fixedMetadata)

      assert.match(
        output,
        /\*\*This table is tentative and requires human review\.\*\*/
      )
      assert.doesNotMatch(output, /### Primary Key|### Indexes/)
    })

    it('renders an explicitly ordered index field', async () => {
      const input = await parseSpecificationFile(
        fixturePath('table-spec', 'online-shop-index-sort-order.valid.yaml')
      )
      const result = await validateSpecification(input, {
        sourcePath: fixturePath(
          'table-spec',
          'online-shop-index-sort-order.valid.yaml'
        )
      })
      assert.equal(result.success, true)
      if (!result.success) return

      const output = renderTableSpecDocument(result.data, fixedMetadata)

      assert.match(
        output,
        /\| ix\\_orders\\_created\\_at \| created\\_at desc \|/
      )
    })

    it('renders omitted foreign key actions, index reasons, and index sort orders as empty table cells', async () => {
      const input = await parseSpecificationFile(
        fixturePath('table-spec', 'online-shop-optional-rendering.valid.yaml')
      )
      const result = await validateSpecification(input, {
        sourcePath: fixturePath(
          'table-spec',
          'online-shop-optional-rendering.valid.yaml'
        )
      })
      assert.equal(result.success, true)
      if (!result.success) return

      const output = renderTableSpecDocument(result.data, fixedMetadata)

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
    it('writes a document to the long output option with progress logs', async () => {
      const directory = await createTemporaryDirectory(
        'shot-table-spec-',
        temporaryDirectories
      )
      const outputPath = join(directory, 'online-shop.md')
      const { stdout, stderr } = await runCli(process.execPath, [
        'src/cli.ts',
        'table-spec',
        fixturePath('table-spec', 'online-shop-minimal.valid.yaml'),
        '--output',
        outputPath
      ])

      const output = await readFile(outputPath, 'utf8')
      assert.equal(stderr, '')
      assert.match(
        output,
        /source_sha256: 33057655ad2687f583a20b9e15e4023d96871ad240ed45eb5b1a91268986fb0f/
      )
      assert.doesNotMatch(output, new RegExp('generated' + '_by:'))
      assert.match(output, /# online-shop/)
      assert.match(stdout, /Table specification generation/)
      assert.match(stdout, /Data Sketch read/)
      assert.match(stdout, /Validating Data Sketch/)
      assert.match(stdout, /Rendering table specification/)
      assert.match(stdout, /Table specification written/)
      assert.match(stdout, /Table specification generated/)
      assert.ok(stdout.includes(greenSucceeded))
    })

    it('shows the failed validation step and reason in file-output mode', async () => {
      const directory = await createTemporaryDirectory(
        'shot-table-spec-',
        temporaryDirectories
      )
      const outputPath = join(directory, 'online-shop.md')
      await assert.rejects(
        runCli(process.execPath, [
          'src/cli.ts',
          'table-spec',
          fixturePath('table-spec', 'online-shop-empty-stores.invalid.yaml'),
          '--output',
          outputPath
        ]),
        error => {
          const stdout = (error as { stdout: string }).stdout
          assert.match(stdout, /Validating Data Sketch failed/)
          assert.match(stdout, /stores/)
          assert.ok(stdout.includes(redFailed))
          assert.doesNotMatch(stdout, /Table specification generation failed/)
          assert.doesNotMatch(stdout, /Reason/)
          assert.equal((error as { stderr: string }).stderr, '')
          return true
        }
      )

      await assert.rejects(readFile(outputPath, 'utf8'), /ENOENT/)
    })

    it('shows the failed parsing step and reason in file-output mode', async () => {
      const directory = await createTemporaryDirectory(
        'shot-table-spec-',
        temporaryDirectories
      )
      const outputPath = join(directory, 'online-shop.md')
      await assert.rejects(
        runCli(process.execPath, [
          'src/cli.ts',
          'table-spec',
          fixturePath('table-spec', 'online-shop-invalid-syntax.invalid.yaml'),
          '--output',
          outputPath
        ]),
        error => {
          const stdout = (error as { stdout: string }).stdout
          assert.match(stdout, /Parsing Data Sketch failed/)
          assert.match(stdout, /Failed to parse/)
          assert.ok(stdout.includes(redFailed))
          assert.doesNotMatch(stdout, /Table specification generation failed/)
          assert.doesNotMatch(stdout, /Reason/)
          assert.equal((error as { stderr: string }).stderr, '')
          return true
        }
      )

      await assert.rejects(readFile(outputPath, 'utf8'), /ENOENT/)
    })

    it('shows the failed reading step and reason in file-output mode', async () => {
      const directory = await createTemporaryDirectory(
        'shot-table-spec-',
        temporaryDirectories
      )
      await assert.rejects(
        runCli(process.execPath, [
          'src/cli.ts',
          'table-spec',
          fixturePath('table-spec', 'online-shop-missing.yaml'),
          '--output',
          join(directory, 'online-shop.md')
        ]),
        error => {
          const stdout = (error as { stdout: string }).stdout
          assert.match(stdout, /Reading Data Sketch failed/)
          assert.match(stdout, /ENOENT/)
          assert.ok(stdout.includes(redFailed))
          assert.doesNotMatch(stdout, /Table specification generation failed/)
          assert.doesNotMatch(stdout, /Reason/)
          assert.equal((error as { stderr: string }).stderr, '')
          return true
        }
      )
    })

    it('keeps an existing output document unchanged when validation fails in file-output mode', async () => {
      const directory = await createTemporaryDirectory(
        'shot-table-spec-',
        temporaryDirectories
      )
      const outputPath = join(directory, 'online-shop.md')
      await writeFile(outputPath, 'approved table specification\n')

      await assert.rejects(
        runCli(process.execPath, [
          'src/cli.ts',
          'table-spec',
          fixturePath('table-spec', 'online-shop-empty-stores.invalid.yaml'),
          '--output',
          outputPath
        ])
      )

      assert.equal(
        await readFile(outputPath, 'utf8'),
        'approved table specification\n'
      )
    })

    it('reports an output file write error as plain text', async () => {
      const outputPath = join(
        tmpdir(),
        'shot-missing-directory',
        'online-shop.md'
      )
      await assert.rejects(
        runCli(process.execPath, [
          'src/cli.ts',
          'table-spec',
          fixturePath('table-spec', 'online-shop-minimal.valid.yaml'),
          '--output',
          outputPath
        ]),
        error => {
          const stdout = (error as { stdout: string }).stdout
          assert.match(stdout, /Writing table specification failed/)
          assert.match(stdout, /ENOENT/)
          assert.ok(stdout.includes(redFailed))
          assert.doesNotMatch(stdout, /Table specification generation failed/)
          assert.doesNotMatch(stdout, /Reason/)
          assert.equal((error as { stderr: string }).stderr, '')
          return true
        }
      )
    })

    it('writes multiple validation issues without a reason box in file-output mode', async () => {
      const directory = await createTemporaryDirectory(
        'shot-table-spec-',
        temporaryDirectories
      )
      await assert.rejects(
        runCli(process.execPath, [
          'src/cli.ts',
          'table-spec',
          fixturePath(
            'table-spec',
            'online-shop-multiple-validation-issues.invalid.yaml'
          ),
          '--output',
          join(directory, 'online-shop.md')
        ]),
        error => {
          const stdout = (error as { stdout: string }).stdout
          assert.match(stdout, /Validating Data Sketch failed/)
          assert.match(stdout, /data-sketch/)
          assert.match(stdout, /info\.name/)
          assert.match(stdout, /stores/)
          assert.ok(stdout.includes(redFailed))
          assert.doesNotMatch(stdout, /Table specification generation failed/)
          assert.doesNotMatch(stdout, /Reason/)
          assert.equal((error as { stderr: string }).stderr, '')
          return true
        }
      )
    })
  })
})
