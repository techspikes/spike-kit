import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { main } from '../src/cli.ts'
import { runCommand } from './helper.ts'

describe('cli', () => {
  it('prints root usage for --help', async () => {
    const result = await runCommand(() => main(['--help']))
    assert.equal(result.exitCode, 0)
  })

  it('prints root usage for -h', async () => {
    const result = await runCommand(() => main(['-h']))
    assert.equal(result.exitCode, 0)
  })

  it('dispatches check usage for --help', async () => {
    const result = await runCommand(() => main(['check', '--help']))
    assert.equal(result.exitCode, 0)
  })

  it('prints the package version for --version', async () => {
    const result = await runCommand(() => main(['--version']))
    assert.equal(result.exitCode, 0)
  })

  it('prints the package version for -v', async () => {
    const result = await runCommand(() => main(['-v']))
    assert.equal(result.exitCode, 0)
  })

  it('exits non-zero when subcommand is missing', async () => {
    const result = await runCommand(() => main([]))
    assert.equal(result.exitCode, 1)
  })

  it('exits non-zero for the unsupported validate subcommand', async () => {
    const result = await runCommand(() => main(['validate']))
    assert.equal(result.exitCode, 1)
  })

  it('exits non-zero when table-spec file argument is missing', async () => {
    const result = await runCommand(() => main(['table-spec']))
    assert.equal(result.exitCode, 1)
  })

  it('exits non-zero when kysely-migration output argument is missing', async () => {
    const result = await runCommand(() => main(['kysely-migration']))
    assert.equal(result.exitCode, 1)
  })

  it('dispatches a supported subcommand successfully', async () => {
    const result = await runCommand(() =>
      main([
        'check',
        'test/commands/check/fixtures/online-shop-minimal.valid.yaml'
      ])
    )
    assert.equal(result.exitCode, 0)
  })
})
