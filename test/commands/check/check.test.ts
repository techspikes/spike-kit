import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { runSteps } from '../../../src/commands/check/index.ts'
import { shot } from '../../../src/commands/check/lib.ts'
import { fixturePath, readTextFile, runCommand } from '../../helper.ts'

describe('check', () => {
  it('validates Data Sketch source text without a source path', async () => {
    const spec = await readTextFile(
      fixturePath(import.meta.url, 'online-shop-minimal.valid.yaml')
    )

    const result = await shot({
      spec
    })

    assert.deepEqual(result, { isValid: true })
  })

  it('validates OpenAPI traces through a source loader callback', async () => {
    const spec = await readTextFile(
      fixturePath(
        import.meta.url,
        'online-shop-sources-openapi-ignored-members.valid.yaml'
      )
    )

    const openApiSources: string[] = []
    const result = await shot({
      spec,
      sources: {
        openapi: async openApiSource => {
          openApiSources.push(openApiSource)
          return readTextFile(fixturePath(import.meta.url, openApiSource))
        }
      }
    })

    assert.deepEqual(result, { isValid: true })
    assert.deepEqual(openApiSources, ['openapi/openapi-ignored-members.yaml'])
  })

  it('exits successfully for the customer and order fixture from the Data Sketch example', async () => {
    const result = await runCommand(() =>
      runSteps([fixturePath(import.meta.url, 'online-shop-minimal.valid.yaml')])
    )

    assert.equal(result.exitCode, 0)
  })

  it('exits successfully for a fixture with OpenAPI trace validation', async () => {
    const result = await runCommand(() =>
      runSteps([
        fixturePath(
          import.meta.url,
          'online-shop-sources-openapi-ignored-members.valid.yaml'
        )
      ])
    )

    assert.equal(result.exitCode, 0)
  })

  it('exits non-zero for an online shopping fixture with no stores', async () => {
    const result = await runCommand(() =>
      runSteps([
        fixturePath(import.meta.url, 'online-shop-empty-stores.invalid.yaml')
      ])
    )

    assert.equal(result.exitCode, 1)
    assert.match((result.error as Error).message, /stores/)
  })

  it('writes multiple validation issues without a reason box', async () => {
    const result = await runCommand(() =>
      runSteps([
        fixturePath(
          import.meta.url,
          'online-shop-multiple-validation-issues.invalid.yaml'
        )
      ])
    )

    assert.equal(result.exitCode, 1)
    assert.match((result.error as Error).message, /data-sketch/)
    assert.match((result.error as Error).message, /info\.name/)
    assert.match((result.error as Error).message, /stores/)
  })

  it('shows the failed reading step and reason for a missing file', async () => {
    const result = await runCommand(() =>
      runSteps([fixturePath(import.meta.url, 'online-shop-missing.yaml')])
    )

    assert.equal(result.exitCode, 1)
    assert.match((result.error as Error).message, /ENOENT/)
  })

  it('prints check usage for --help', async () => {
    const result = await runCommand(() => runSteps(['--help']))

    assert.equal(result.exitCode, 0)
  })

  it('prints check usage for -h', async () => {
    const result = await runCommand(() => runSteps(['-h']))

    assert.equal(result.exitCode, 0)
  })

  it('logs option errors and usage with plain messages', async () => {
    const result = await runCommand(() => runSteps([]))

    assert.equal(result.exitCode, 1)
    assert.match((result.error as Error).message, /missing file argument/)
  })

  it('rejects an unknown option with plain messages', async () => {
    const result = await runCommand(() => runSteps(['--unknown']))

    assert.equal(result.exitCode, 1)
    assert.match((result.error as Error).message, /Unknown option/)
  })
})
