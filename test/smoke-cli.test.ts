import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { fixturePath, runCli } from './helper/helper.ts'

const require = createRequire(import.meta.url)
const packageJson = require('../package.json') as { version: string }
const cliPath = join(process.cwd(), 'dist', 'cli.js')

describe('smoke-cli', () => {
  it('smoke: prints the package version for --version', async () => {
    const result = await runCli(process.execPath, [cliPath, '--version'])

    assert.equal(result.stdout, `${packageJson.version}\n`)
    assert.equal(result.stderr, '')
  })

  it('smoke: prints the package version for -v', async () => {
    const result = await runCli(process.execPath, [cliPath, '-v'])

    assert.equal(result.stdout, `${packageJson.version}\n`)
    assert.equal(result.stderr, '')
  })

  it('smoke: prints root usage from the bundled CLI', async () => {
    const result = await runCli(process.execPath, [cliPath, '--help'])

    assert.match(result.stdout, /Usage:/)
    assert.match(result.stdout, /check/)
    assert.match(result.stdout, /kysely-migration/)
    assert.match(result.stdout, /table-spec/)
    assert.match(result.stdout, /--version/)
    assert.equal(result.stderr, '')
  })

  it('smoke: validates an online shopping fixture from the bundled CLI', async () => {
    const result = await runCli(process.execPath, [
      cliPath,
      'check',
      fixturePath('check-command', 'online-shop-minimal.valid.yaml')
    ])

    assert.equal(result.stderr, '')
  })
})
