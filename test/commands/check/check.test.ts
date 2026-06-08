import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { runSteps } from '../../../src/commands/check/index.ts'
import { shot } from '../../../src/commands/check/lib.ts'
import { runCommand } from '../../helper.ts'

const basePath = fileURLToPath(import.meta.url)
const baseDirectory = dirname(basePath)

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

function issueMessages(result: Awaited<ReturnType<typeof shot>>) {
  if (result.isValid) throw new Error('fixture must be invalid')
  return result.issues.map(issue => issue.message).join('\n')
}

describe('check', () => {
  it('validates Data Sketch source text without a source path', async () => {
    const spec = await readFixtureFile(
      'fixtures/online-shop-minimal.valid.yaml'
    )

    const result = await shot({
      spec
    })

    assert.deepEqual(result, { isValid: true })
  })

  it('validates OpenAPI traces through a source loader callback', async () => {
    const spec = await readFixtureFile(
      'fixtures/online-shop-sources-openapi-ignored-members.valid.yaml'
    )

    const openApiSources: string[] = []
    const result = await shot({
      spec,
      sources: {
        openapi: async openApiSource => {
          openApiSources.push(openApiSource)
          return readFixtureFile(`fixtures/${openApiSource}`)
        }
      }
    })

    assert.deepEqual(result, { isValid: true })
    assert.deepEqual(openApiSources, ['openapi/openapi-ignored-members.yaml'])
  })

  it('validates a fixture with OpenAPI trace validation', async () => {
    const result = await shot({
      spec: await readFixtureFile(
        'fixtures/online-shop-sources-openapi-ignored-members.valid.yaml'
      ),
      sources: {
        openapi: source => readFixtureFile(`fixtures/${source}`)
      }
    })

    assert.deepEqual(result, { isValid: true })
  })

  it('loads an OpenAPI source relative to the CLI input file path', async () => {
    const result = await runCommand(() =>
      runSteps([
        resolveFixtureFilePath(
          'fixtures/online-shop-sources-openapi-ignored-members.valid.yaml'
        )
      ])
    )

    assert.equal(result.isFailed, false)
    assert.match(result.stdout, /shot check completed/)
  })

  it('rejects an online shopping fixture with no stores', async () => {
    const result = await shot({
      spec: await readFixtureFile(
        'fixtures/online-shop-empty-stores.invalid.yaml'
      )
    })

    assert.match(issueMessages(result), /stores/)
  })

  it('writes multiple validation issues without a reason box', async () => {
    const result = await shot({
      spec: await readFixtureFile(
        'fixtures/online-shop-multiple-validation-issues.invalid.yaml'
      )
    })

    const messages = issueMessages(result)
    assert.match(messages, /data-sketch/)
    assert.match(messages, /info\.name/)
    assert.match(messages, /stores/)
  })

  it('reports validation issues in CLI mode', async () => {
    const result = await runCommand(() =>
      runSteps([
        resolveFixtureFilePath(
          'fixtures/online-shop-multiple-validation-issues.invalid.yaml'
        )
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

  it('reports parse failures in CLI mode', async () => {
    const result = await runCommand(() =>
      runSteps([
        resolveFixtureFilePath(
          'fixtures/online-shop-invalid-syntax.invalid.yaml'
        )
      ])
    )

    assert.equal(result.isFailed, true)
    assert.match(result.error.message, /Failed to parse/)
    assert.match(result.stderr, /Validating Data Sketch failed/)
    assert.match(result.stderr, /Failed to parse/)
  })

  it('shows the failed reading step and reason for a missing file', async () => {
    const result = await runCommand(() =>
      runSteps([resolveFixtureFilePath('fixtures/online-shop-missing.yaml')])
    )

    assert.equal(result.isFailed, true)
    assert.match(result.error.message, /ENOENT/)
    assert.match(result.stderr, /Reading Data Sketch failed/)
    assert.match(result.stderr, /ENOENT/)
  })

  it('prints check usage for --help', async () => {
    const result = await runCommand(() => runSteps(['--help']))

    assert.equal(result.isFailed, false)
    assert.match(result.stdout, /Usage:/)
  })

  it('prints check usage for -h', async () => {
    const result = await runCommand(() => runSteps(['-h']))

    assert.equal(result.isFailed, false)
    assert.match(result.stdout, /Usage:/)
  })

  it('logs option errors and usage with plain messages', async () => {
    const result = await runCommand(() => runSteps([]))

    assert.equal(result.isFailed, true)
    assert.match(result.error.message, /missing file argument/)
    assert.match(result.stderr, /Error: missing file argument/)
    assert.match(result.stderr, /Usage:/)
  })

  it('rejects an unknown option with plain messages', async () => {
    const result = await runCommand(() => runSteps(['--unknown']))

    assert.equal(result.isFailed, true)
    assert.match(result.error.message, /Unknown option/)
    assert.match(result.stderr, /Error: Unknown option/)
    assert.match(result.stderr, /Usage:/)
  })
})
