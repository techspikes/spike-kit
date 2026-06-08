import { writeSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { intro, log, outro } from '@clack/prompts'
import pc from 'picocolors'
import { checkDataSketch } from './lib.ts'

const colors = pc.createColors(true)

const usage = [
  'Usage: shot check <file>',
  '',
  'Validate a Valuable Data Specification v1 YAML or JSON file.',
  '',
  'Options:',
  '  -h, --help  Show this help'
].join('\n')

export const command = {
  name: 'check',
  summary: 'Validate a Valuable Data Specification v1 YAML or JSON file',
  usage,
  run: runCheckCommand
}

async function runCheckCommand(args: string[]) {
  let parsed: ReturnType<typeof parseArgs>
  try {
    parsed = parseArgs({
      args,
      allowPositionals: true,
      strict: true,
      options: {
        help: { type: 'boolean', short: 'h' }
      }
    })
  } catch (error) {
    writeOptionError((error as Error).message)
    throw new Error((error as Error).message)
  }
  if (parsed.values.help === true) {
    writeSync(1, `${usage}\n`)
    return
  }
  if (parsed.positionals.length !== 1) {
    writeOptionError('missing file argument')
    throw new Error('missing file argument')
  }
  const filePath = parsed.positionals[0]

  intro('Data Sketch validation')

  let source: string
  try {
    source = await readFile(filePath, 'utf8')
    log.success('Data Sketch read')
  } catch (error) {
    log.error('Reading Data Sketch failed')
    writeReason((error as Error).message)
    outro(colors.red('Failed'))
    await flushStdout()
    throw new Error((error as Error).message)
  }

  const result = await checkDataSketch(source, {
    sourceName: filePath,
    loadOpenApiSource: source =>
      readFile(resolve(dirname(filePath), source), 'utf8'),
    onEvent: event => {
      if (event.type === 'validated') {
        log.success('Validating Data Sketch')
      }
    }
  })
  if (result !== '') {
    log.error('Validating Data Sketch failed')
    writeValidationIssues(result)
    outro(colors.red('Failed'))
    await flushStdout()
    throw new Error(result)
  }

  log.success('Data Sketch is valid')
  outro(colors.green('Succeeded'))
  await flushStdout()
}

function flushStdout() {
  return new Promise<void>(resolve => process.stdout.write('', () => resolve()))
}

function writeOptionError(reason: string) {
  writeSync(2, `Error: ${reason}\n\n${usage}\n`)
}

function writeValidationIssues(messages: string) {
  process.stdout.write(`${messages}\n`)
}

function writeReason(reason: string) {
  process.stdout.write(`${reason}\n`)
}
