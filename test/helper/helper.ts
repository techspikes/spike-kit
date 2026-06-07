import { spawn } from 'node:child_process'
import { closeSync, openSync } from 'node:fs'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export const fixturePath = (...segments: string[]) =>
  join(process.cwd(), 'test', 'fixtures', ...segments)

export async function createTemporaryDirectory(
  prefix: string,
  temporaryDirectories: string[]
) {
  const directory = await mkdtemp(join(tmpdir(), prefix))
  temporaryDirectories.push(directory)
  return directory
}

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
