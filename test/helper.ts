import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { captureLoggerForTest } from '../src/core/logger.ts'

export const fixturePath = (testModuleUrl: string, ...segments: string[]) =>
  fileURLToPath(new URL(['fixtures', ...segments].join('/'), testModuleUrl))

export async function createTemporaryDirectory(
  prefix: string,
  temporaryDirectories: string[]
) {
  const directory = await mkdtemp(join(tmpdir(), prefix))
  temporaryDirectories.push(directory)
  return directory
}

export function joinFilePath(...segments: string[]) {
  return join(...segments)
}

export function joinTemporaryFilePath(...segments: string[]) {
  return join(tmpdir(), ...segments)
}

export async function readTextFile(path: string) {
  return readFile(path, 'utf8')
}

export async function writeTextFile(path: string, content: string) {
  await writeFile(path, content)
}

export async function removeTemporaryDirectories(directories: string[]) {
  const removedDirectories = directories.splice(0)
  await Promise.all(
    removedDirectories.map(directory =>
      rm(directory, { recursive: true, force: true })
    )
  )
}

export async function runCommand(run: () => Promise<unknown>): Promise<{
  exitCode: number
  stdout: string
  stderr: string
  error?: unknown
}> {
  const loggerCapture = captureLoggerForTest()
  try {
    const exitCode = await run()
    return {
      exitCode: typeof exitCode === 'number' ? exitCode : 0,
      stdout: loggerCapture.stdout(),
      stderr: loggerCapture.stderr()
    }
  } catch (error) {
    return {
      exitCode: 1,
      stdout: loggerCapture.stdout(),
      stderr: loggerCapture.stderr(),
      error
    }
  } finally {
    loggerCapture.restore()
  }
}
