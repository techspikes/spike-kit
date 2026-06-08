import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { closeSync, openSync } from 'node:fs'
import { createRequire } from 'node:module'
import {
  dirname,
  isAbsolute,
  relative,
  resolve as resolvePath
} from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  createTemporaryDirectory,
  readTemporaryFile,
  removeTemporaryDirectories
} from './helper.ts'

const require = createRequire(import.meta.url)
const packageJson = require('../package.json') as { version: string }
const basePath = fileURLToPath(import.meta.url)
const baseDirectory = dirname(basePath)
const cliPath = resolvePath(process.cwd(), 'dist', 'cli.js')
const checkFixturePath = resolveCommandFixtureFilePath(
  'check',
  'fixtures/online-shop-minimal.valid.yaml'
)

function resolveCommandFixtureFilePath(command: string, relativePath: string) {
  if (!relativePath.startsWith('fixtures/')) {
    throw new Error('fixture path must start with fixtures/')
  }

  const fixtureDirectory = resolvePath(baseDirectory, 'commands', command)
  const resolvedPath = resolvePath(fixtureDirectory, relativePath)
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

export function runCli(
  file: string,
  args: string[],
  options: { cwd?: string } = {}
) {
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    void (async () => {
      const temporaryDirectories: string[] = []
      const directory = await createTemporaryDirectory(
        'shot-cli-',
        temporaryDirectories
      )
      const stdoutPath = resolvePath(directory, 'stdout')
      const stderrPath = resolvePath(directory, 'stderr')
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
          const stdout = await readTemporaryFile(stdoutPath)
          const stderr = await readTemporaryFile(stderrPath)
          await removeTemporaryDirectories(temporaryDirectories)
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

    assert.match(result.stdout, /shot check completed/)
    assert.equal(result.stderr, '')
  })
})
