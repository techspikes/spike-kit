import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { closeSync, openSync } from 'node:fs'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'

const require = createRequire(import.meta.url)
const packageJson = require('../package.json') as { version: string }
const cliPath = join(process.cwd(), 'dist', 'cli.js')
const checkFixturePath = join(
  process.cwd(),
  'test',
  'commands',
  'check',
  'fixtures',
  'online-shop-minimal.valid.yaml'
)

export function runCli(
  file: string,
  args: string[],
  options: { cwd?: string } = {}
) {
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    void (async () => {
      const directory = await mkdtemp(join(tmpdir(), 'shot-cli-'))
      const stdoutPath = join(directory, 'stdout')
      const stderrPath = join(directory, 'stderr')
      const stdoutFd = openSync(stdoutPath, 'w')
      const stderrFd = openSync(stderrPath, 'w')
      let closed = false
      const closeResources = () => {
        if (closed) return
        closed = true
        closeSync(stdoutFd)
        closeSync(stderrFd)
      }
      const child = spawn(file, args, {
        cwd: options.cwd,
        stdio: ['ignore', stdoutFd, stderrFd]
      })

      child.on('error', error => {
        closeResources()
        reject(error)
      })
      child.on('close', code => {
        void (async () => {
          closeResources()
          const stdout = await readFile(stdoutPath, 'utf8')
          const stderr = await readFile(stderrPath, 'utf8')
          await rm(directory, { recursive: true, force: true })
          if (code === 0) {
            resolve({ stdout, stderr })
          } else {
            reject(
              Object.assign(
                new Error(`Command failed with exit code ${code}`),
                {
                  exitCode: code,
                  stdout,
                  stderr
                }
              )
            )
          }
        })().catch(reject)
      })
    })().catch(reject)
  })
}

describe('smoke-cli', () => {
  it('smoke: prints the package version for --version', async () => {
    const result = await runCli(process.execPath, [cliPath, '--version'])

    assert.match(result.stdout, new RegExp(packageJson.version))
    assert.ok(result.stdout.includes(`${String.fromCharCode(27)}[`))
    assert.equal(result.stderr, '')
  })

  it('smoke: prints the package version for -v', async () => {
    const result = await runCli(process.execPath, [cliPath, '-v'])

    assert.match(result.stdout, new RegExp(packageJson.version))
    assert.ok(result.stdout.includes(`${String.fromCharCode(27)}[`))
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
      checkFixturePath
    ])

    assert.equal(result.stderr, '')
  })
})
