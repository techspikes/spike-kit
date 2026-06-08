import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { logger } from '../../core/logger.ts'
import type { ShotOutput } from './lib.ts'
import { shot } from './lib.ts'

type ParsedArgs =
  | {
      isHelp: true
    }
  | {
      isHelp: false
      path: string
    }

export async function runSteps(args: string[]) {
  const options = stepParseArgs(args)

  if (options.isHelp) return

  const spec = await stepReadSpec(options.path)
  await stepCheckDataSketch(options.path, spec)
}

function stepParseArgs(args: string[]): ParsedArgs {
  const usage = () =>
    [
      'Usage: shot check <file>',
      '',
      'Validate a Valuable Data Specification v1 YAML or JSON file.',
      '',
      'Options:',
      '  -h, --help  Show this help'
    ].join('\n')

  try {
    const parsed = parseArgs({
      args,
      allowPositionals: true,
      strict: true,
      options: {
        help: { type: 'boolean', short: 'h' }
      }
    })

    if (parsed.values.help === true) {
      logger.info(usage())
      return { isHelp: true }
    }

    if (
      parsed.positionals.length !== 1 ||
      parsed.positionals[0] === undefined
    ) {
      throw new Error('missing file argument')
    }

    return {
      isHelp: false,
      path: parsed.positionals[0]
    }
  } catch (error) {
    logger.error(`Error: ${(error as Error).message}\n\n${usage()}`)
    throw new Error((error as Error).message)
  }
}

async function stepReadSpec(path: string) {
  try {
    const spec = await readFile(path, 'utf8')
    return spec
  } catch (error) {
    logger.error('Reading Data Sketch failed')
    logger.error((error as Error).message)
    throw new Error((error as Error).message)
  }
}

async function stepCheckDataSketch(path: string, spec: string) {
  let output: ShotOutput

  try {
    output = await shot({
      spec,
      sources: {
        openapi: (source: string) =>
          readFile(resolve(dirname(path), source), 'utf8')
      }
    })
  } catch (error) {
    logger.error('Validating Data Sketch failed')
    logger.error((error as Error).message)
    throw new Error((error as Error).message)
  }

  if (!output.isValid) {
    const message = output.issues.map(issue => issue.message).join('\n')
    logger.error('Validating Data Sketch failed')
    logger.error(message)
    throw new Error(message)
  }
}
