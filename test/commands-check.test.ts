import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { fixturePath, runCli } from './helper/helper.ts'

const greenSucceeded = `${String.fromCharCode(27)}[32mSucceeded${String.fromCharCode(27)}[39m`
const redFailed = `${String.fromCharCode(27)}[31mFailed${String.fromCharCode(27)}[39m`

describe('check', () => {
  it('exits successfully for the customer and order fixture from the Data Sketch example', async () => {
    const result = await runCli(process.execPath, [
      'src/cli.ts',
      'check',
      fixturePath('check-command', 'online-shop-minimal.valid.yaml')
    ])

    assert.match(result.stdout, /Data Sketch read/)
    assert.match(result.stdout, /Validating Data Sketch/)
    assert.match(result.stdout, /Data Sketch is valid/)
    assert.match(result.stdout, /Data Sketch validation/)
    assert.ok(result.stdout.includes(greenSucceeded))
    assert.equal(result.stderr, '')
  })

  it('exits non-zero for an online shopping fixture with no stores', async () => {
    await assert.rejects(
      runCli(process.execPath, [
        'src/cli.ts',
        'check',
        fixturePath('check-command', 'online-shop-empty-stores.invalid.yaml')
      ]),
      error => {
        assert.match(
          (error as { stdout: string }).stdout,
          /Validating Data Sketch failed/
        )
        assert.match((error as { stdout: string }).stdout, /stores/)
        assert.ok((error as { stdout: string }).stdout.includes(redFailed))
        assert.doesNotMatch(
          (error as { stdout: string }).stdout,
          /Validation failed/
        )
        assert.doesNotMatch((error as { stdout: string }).stdout, /Reason/)
        assert.equal((error as { stderr: string }).stderr, '')
        return true
      }
    )
  })

  it('writes multiple validation issues without a reason box', async () => {
    await assert.rejects(
      runCli(process.execPath, [
        'src/cli.ts',
        'check',
        fixturePath(
          'check-command',
          'online-shop-multiple-validation-issues.invalid.yaml'
        )
      ]),
      error => {
        assert.match(
          (error as { stdout: string }).stdout,
          /Validating Data Sketch failed/
        )
        assert.match((error as { stdout: string }).stdout, /data-sketch/)
        assert.match((error as { stdout: string }).stdout, /info\.name/)
        assert.match((error as { stdout: string }).stdout, /stores/)
        assert.ok((error as { stdout: string }).stdout.includes(redFailed))
        assert.doesNotMatch(
          (error as { stdout: string }).stdout,
          /Validation failed/
        )
        assert.doesNotMatch((error as { stdout: string }).stdout, /Reason/)
        assert.equal((error as { stderr: string }).stderr, '')
        return true
      }
    )
  })

  it('shows the failed reading step and reason for a missing file', async () => {
    await assert.rejects(
      runCli(process.execPath, [
        'src/cli.ts',
        'check',
        fixturePath('check-command', 'online-shop-missing.yaml')
      ]),
      error => {
        assert.match(
          (error as { stdout: string }).stdout,
          /Reading Data Sketch failed/
        )
        assert.match((error as { stdout: string }).stdout, /ENOENT/)
        assert.ok((error as { stdout: string }).stdout.includes(redFailed))
        assert.doesNotMatch(
          (error as { stdout: string }).stdout,
          /Validation failed/
        )
        assert.doesNotMatch((error as { stdout: string }).stdout, /Reason/)
        assert.equal((error as { stderr: string }).stderr, '')
        return true
      }
    )
  })

  it('prints check usage for --help', async () => {
    const result = await runCli(process.execPath, [
      'src/cli.ts',
      'check',
      '--help'
    ])

    assert.match(result.stdout, /shot check <file>/)
    assert.equal(result.stderr, '')
  })

  it('prints check usage for -h', async () => {
    const result = await runCli(process.execPath, ['src/cli.ts', 'check', '-h'])

    assert.match(result.stdout, /shot check <file>/)
    assert.equal(result.stderr, '')
  })

  it('writes option errors and usage to stderr without clack formatting', async () => {
    await assert.rejects(
      runCli(process.execPath, ['src/cli.ts', 'check']),
      error => {
        assert.equal((error as { stdout: string }).stdout, '')
        assert.match(
          (error as { stderr: string }).stderr,
          /Error: missing file argument/
        )
        assert.match((error as { stderr: string }).stderr, /Usage:/)
        assert.doesNotMatch((error as { stderr: string }).stderr, /Reason/)
        return true
      }
    )
  })

  it('rejects an unknown option before clack formatting starts', async () => {
    await assert.rejects(
      runCli(process.execPath, ['src/cli.ts', 'check', '--unknown']),
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
