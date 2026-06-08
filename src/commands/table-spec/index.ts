import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { basename, dirname, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { logger } from '../../core/logger.ts'
import { shot } from './lib.ts'

type ParsedArgs =
  | {
      isHelp: true
    }
  | {
      isHelp: false
      path: string
      outputPath: string
    }

export async function runSteps(args: string[]) {
  const options = stepParseArgs(args)

  if (options.isHelp) return

  const spec = await stepReadSpec(options.path)
  const tableSpec = await stepCreateTableSpec(options.path, spec)
  await stepWriteOutput(options.outputPath, tableSpec)
}

function stepParseArgs(args: string[]): ParsedArgs {
  const usage = () =>
    [
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

  try {
    const parsed = parseArgs({
      args,
      allowPositionals: true,
      strict: true,
      options: {
        output: { type: 'string', short: 'o' },
        help: { type: 'boolean', short: 'h' }
      }
    })

    if (parsed.values.help === true) {
      logger.info(usage())
      return { isHelp: true }
    }

    if (
      parsed.positionals.length !== 1 ||
      parsed.positionals[0] === undefined ||
      parsed.values.output === undefined
    ) {
      throw new Error('expected one input file and --output <file>')
    }

    return {
      isHelp: false,
      path: parsed.positionals[0],
      outputPath: parsed.values.output
    }
  } catch (error) {
    logger.error(`Error: ${(error as Error).message}\n\n${usage()}`)
    throw new Error((error as Error).message)
  }
}

async function stepReadSpec(path: string) {
  try {
    const spec = await readFile(path, 'utf-8')
    return spec
  } catch (error) {
    logger.error('Reading Data Sketch failed')
    logger.error((error as Error).message)
    throw new Error((error as Error).message)
  }
}

async function stepCreateTableSpec(path: string, spec: string) {
  const sourceSha256 = createHash('sha256').update(spec).digest('hex')
  let errorStep = 'Validating Data Sketch'

  try {
    const result = await shot({
      spec,
      sources: {
        openapi: (source: string) =>
          readFile(resolve(dirname(path), source), 'utf8')
      },
      metadata: {
        source: basename(path),
        sourceSha256,
        generatedAt: new Date().toISOString()
      }
    })
    errorStep = 'Rendering table specification'
    return result.tableSpec
  } catch (error) {
    if ((error as Error).name === 'TableSpecValidationError') {
      logger.error('Validating Data Sketch failed')
      logger.error((error as Error).message)
      throw new Error((error as Error).message)
    }
    logger.error(`${errorStep} failed`)
    logger.error((error as Error).message)
    throw new Error((error as Error).message)
  }
}

async function stepWriteOutput(outputPath: string, tableSpec: string) {
  try {
    await writeFile(outputPath, tableSpec)
  } catch (error) {
    logger.error('Writing table specification failed')
    logger.error((error as Error).message)
    throw new Error((error as Error).message)
  }
}
