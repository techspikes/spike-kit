import assert from 'node:assert/strict'
import { dirname, isAbsolute, relative, resolve } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { main } from '../src/cli.ts'
import { runCommand } from './helper.ts'

const basePath = fileURLToPath(import.meta.url)
const baseDirectory = dirname(basePath)

function resolveCommandFixtureFilePath(command: string, relativePath: string) {
  if (!relativePath.startsWith('fixtures/')) {
    throw new Error('fixture path must start with fixtures/')
  }

  const fixtureDirectory = resolve(baseDirectory, 'commands', command)
  const resolvedPath = resolve(fixtureDirectory, relativePath)
  const pathFromFixtureDirectory = relative(fixtureDirectory, resolvedPath)

  if (
    pathFromFixtureDirectory === '' ||
    pathFromFixtureDirectory.startsWith('..') ||
    isAbsolute(pathFromFixtureDirectory)
  ) {
    throw new Error('fixture path must stay under the command test directory')
  }

  return resolvedPath
}

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
        resolveCommandFixtureFilePath(
          'check',
          'fixtures/online-shop-minimal.valid.yaml'
        )
      ])
    )
    assert.equal(result.exitCode, 0)
  })
})
