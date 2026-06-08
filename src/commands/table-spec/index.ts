import { createHash } from 'node:crypto'
import { writeSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { basename, dirname, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { intro, log, outro } from '@clack/prompts'
import pc from 'picocolors'
import { generateTableSpecDocument, TableSpecValidationError } from './lib.ts'

const colors = pc.createColors(true)

const usage = [
  'Usage:',
  '  shot table-spec <file> --output <file>',
  '  shot table-spec <file> -o <file>',
  '',
  'Generate a Markdown table specification document.',
  '',
  'Options:',
  '  -o, --output <file>  Write the document to a file',
  '  -h, --help           Show this help'
].join('\n')

export const command = {
  name: 'table-spec',
  summary: 'Generate a Markdown table specification document',
  usage,
  run: runTableSpecCommand
}

async function runTableSpecCommand(args: string[]) {
  let parsed: ReturnType<typeof parseArgs>
  try {
    parsed = parseArgs({
      args,
      allowPositionals: true,
      strict: true,
      options: {
        output: { type: 'string', short: 'o' },
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
  if (parsed.positionals.length !== 1 || parsed.values.output === undefined) {
    writeOptionError('expected one input file and --output <file>')
    throw new Error('expected one input file and --output <file>')
  }
  const filePath = parsed.positionals[0]
  const outputPath = parsed.values.output as string

  intro('Table specification generation')

  let source: Buffer
  try {
    source = await readFile(filePath)
    log.success('Data Sketch read')
  } catch (error) {
    log.error('Reading Data Sketch failed')
    writeReason((error as Error).message)
    outro(colors.red('Failed'))
    await flushStdout()
    throw new Error((error as Error).message)
  }

  const sourceSha256 = createHash('sha256').update(source).digest('hex')
  let errorStep = 'Parsing Data Sketch'
  const handleEvent = (event: {
    type: 'parsed' | 'validated' | 'rendered'
  }) => {
    if (event.type === 'parsed') {
      errorStep = 'Validating Data Sketch'
    }
    if (event.type === 'validated') {
      log.success('Validating Data Sketch')
      errorStep = 'Rendering table specification'
    }
    if (event.type === 'rendered') {
      log.success('Rendering table specification')
    }
  }

  let document: string
  try {
    document = await generateTableSpecDocument(source.toString('utf8'), {
      metadata: {
        source: basename(filePath),
        sourceSha256,
        generatedAt: new Date().toISOString()
      },
      sourceName: filePath,
      loadOpenApiSource: source =>
        readFile(resolve(dirname(filePath), source), 'utf8'),
      onEvent: handleEvent
    })
  } catch (error) {
    if (error instanceof TableSpecValidationError) {
      await reportTableSpecValidationIssues(
        'Validating Data Sketch',
        error.issues.map(issue => issue.message)
      )
      throw new Error(error.message)
    }
    await reportTableSpecError(errorStep, error)
    throw new Error((error as Error).message)
  }

  try {
    await writeFile(outputPath, document)
    log.success('Table specification written')
  } catch (error) {
    log.error('Writing table specification failed')
    writeReason((error as Error).message)
    outro(colors.red('Failed'))
    await flushStdout()
    throw new Error((error as Error).message)
  }

  log.success('Table specification generated')
  outro(colors.green('Succeeded'))
  await flushStdout()
}

function flushStdout() {
  return new Promise<void>(resolve => process.stdout.write('', () => resolve()))
}

function writeOptionError(reason: string) {
  writeSync(2, `Error: ${reason}\n\n${usage}\n`)
}

async function reportTableSpecError(step: string, error: unknown) {
  log.error(`${step} failed`)
  writeReason((error as Error).message)
  outro(colors.red('Failed'))
  await flushStdout()
}

async function reportTableSpecValidationIssues(
  step: string,
  messages: string[]
) {
  log.error(`${step} failed`)
  writeValidationIssues(messages)
  outro(colors.red('Failed'))
  await flushStdout()
}

function writeValidationIssues(messages: string[]) {
  process.stdout.write(`${messages.join('\n')}\n`)
}

function writeReason(reason: string) {
  process.stdout.write(`${reason}\n`)
}
