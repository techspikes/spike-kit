import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { isAbsolute, join, relative, resolve } from 'node:path'
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

export async function readTemporaryFile(path: string) {
  assertTemporaryPath(path)
  return readFile(path, 'utf8')
}

export async function writeTemporaryFile(path: string, content: string) {
  assertTemporaryPath(path)
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

function assertTemporaryPath(path: string) {
  const temporaryRoot = resolve(tmpdir())
  const resolvedPath = resolve(path)
  const relativePath = relative(temporaryRoot, resolvedPath)

  if (
    relativePath === '' ||
    (!relativePath.startsWith('..') && !isAbsolute(relativePath))
  ) {
    return
  }

  throw new Error(`temporary file path must be under ${temporaryRoot}`)
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
