import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { describe, it } from 'node:test'
import { runCli } from './helper/helper.ts'

const require = createRequire(import.meta.url)
const packageJson = require('../package.json') as { version: string }

describe('cli', () => {
  it('prints root usage for --help', async () => {
    const result = await runCli(process.execPath, ['src/cli.ts', '--help'])

    assert.match(result.stdout, /Usage:/)
    assert.match(result.stdout, /check/)
    assert.match(result.stdout, /kysely-migration/)
    assert.match(result.stdout, /table-spec/)
    assert.match(result.stdout, /--version/)
    assert.equal(result.stderr, '')
  })

  it('prints root usage for -h', async () => {
    const result = await runCli(process.execPath, ['src/cli.ts', '-h'])

    assert.match(result.stdout, /Usage:/)
    assert.match(result.stdout, /check/)
    assert.match(result.stdout, /kysely-migration/)
    assert.match(result.stdout, /table-spec/)
    assert.match(result.stdout, /--version/)
    assert.equal(result.stderr, '')
  })

  it('prints the package version for --version', async () => {
    const result = await runCli(process.execPath, ['src/cli.ts', '--version'])

    assert.equal(result.stdout, `${packageJson.version}\n`)
    assert.equal(result.stderr, '')
  })

  it('prints the package version for -v', async () => {
    const result = await runCli(process.execPath, ['src/cli.ts', '-v'])

    assert.equal(result.stdout, `${packageJson.version}\n`)
    assert.equal(result.stderr, '')
  })

  it('exits non-zero when subcommand is missing', async () => {
    await assert.rejects(runCli(process.execPath, ['src/cli.ts']), error => {
      assert.match(String(error), /Command failed/)
      assert.equal((error as { stdout: string }).stdout, '')
      assert.match(
        (error as { stderr: string }).stderr,
        /Error: missing subcommand/
      )
      assert.match((error as { stderr: string }).stderr, /check/)
      assert.match((error as { stderr: string }).stderr, /kysely-migration/)
      assert.match((error as { stderr: string }).stderr, /table-spec/)
      return true
    })
  })

  it('exits non-zero for the unsupported validate subcommand', async () => {
    await assert.rejects(
      runCli(process.execPath, ['src/cli.ts', 'validate']),
      error => {
        assert.equal((error as { stdout: string }).stdout, '')
        assert.match(
          (error as { stderr: string }).stderr,
          /Error: unknown subcommand "validate"/
        )
        assert.match((error as { stderr: string }).stderr, /Usage:/)
        return true
      }
    )
  })

  it('exits non-zero when table-spec file argument is missing', async () => {
    await assert.rejects(
      runCli(process.execPath, ['src/cli.ts', 'table-spec']),
      error => {
        assert.equal((error as { stdout: string }).stdout, '')
        assert.match((error as { stderr: string }).stderr, /Error:/)
        assert.match((error as { stderr: string }).stderr, /Usage:/)
        return true
      }
    )
  })

  it('exits non-zero when kysely-migration output argument is missing', async () => {
    await assert.rejects(
      runCli(process.execPath, ['src/cli.ts', 'kysely-migration']),
      error => {
        assert.equal((error as { stdout: string }).stdout, '')
        assert.match((error as { stderr: string }).stderr, /Error:/)
        assert.match((error as { stderr: string }).stderr, /Usage:/)
        return true
      }
    )
  })
})
