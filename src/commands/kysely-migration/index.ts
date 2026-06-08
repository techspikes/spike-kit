import { readFile, writeFile } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { logger } from '../../core/logger.ts'
import { shot } from './lib.ts'

type ParsedArgs =
  | {
      isHelp: true
    }
  | {
      isHelp: false
      filePath: string
      outputPath: string
      previousMigrationPath?: string
      typesOutputPath?: string
      isoPrefix: boolean
      includeTentative: boolean
      dryRun: boolean
    }

type KyselyMigrationOptions = Extract<ParsedArgs, { isHelp: false }>

export async function runSteps(args: string[]) {
  const options = stepParseArgs(args)

  if (options.isHelp) return

  const source = await stepReadSource(options.filePath)
  const previousMigrationSource = await stepReadPreviousMigration(options)
  const output = await stepCreateKyselyMigration(
    options,
    source,
    previousMigrationSource
  )
  if (options.dryRun) {
    logger.info('shot kysely-migration dry run completed')
    return
  }
  await stepWriteOutput(options, output)

  logger.info('shot kysely-migration completed')
}

function stepParseArgs(args: string[]): ParsedArgs {
  const usage = () =>
    [
      'Usage:',
      '  shot kysely-migration <file> --output <file>',
      '  shot kysely-migration <file> -o <file>',
      '  shot kysely-migration <file> --output <file> --iso-prefix',
      '  shot kysely-migration <file> --output <file> --types-output <file.d.ts>',
      '  shot kysely-migration <file> --output <file> --include-tentative',
      '  shot kysely-migration <file> --output <file> --dry-run',
      '  shot kysely-migration <file> --previous-migration <file> --output <file>',
      '  shot kysely-migration <file> -p <file> --output <file>',
      '',
      'Generate a Kysely TypeScript initial or diff migration.',
      '',
      'Options:',
      '  -o, --output <file>      Write the migration to a file',
      '  -p, --previous-migration <file> Read the previous DB projection snapshot',
      '      --types-output <file.d.ts> Write Database type definitions to a file',
      '      --iso-prefix         Prefix the migration file basename with ISO 8601 time',
      '      --include-tentative  Include tentative stores',
      '      --dry-run            Validate and render without writing files',
      '  -h, --help               Show this help'
    ].join('\n')

  try {
    const parsed = parseArgs({
      args,
      allowPositionals: true,
      strict: true,
      options: {
        output: { type: 'string', short: 'o' },
        'previous-migration': { type: 'string', short: 'p' },
        'types-output': { type: 'string' },
        'iso-prefix': { type: 'boolean' },
        'include-tentative': { type: 'boolean' },
        'dry-run': { type: 'boolean' },
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

    const typesOutputPath = parsed.values['types-output']
    if (typesOutputPath !== undefined && !typesOutputPath.endsWith('.d.ts')) {
      throw new Error('--types-output must end with .d.ts')
    }

    return {
      isHelp: false,
      filePath: parsed.positionals[0],
      outputPath: parsed.values.output,
      previousMigrationPath: parsed.values['previous-migration'],
      typesOutputPath,
      isoPrefix: parsed.values['iso-prefix'] === true,
      includeTentative: parsed.values['include-tentative'] === true,
      dryRun: parsed.values['dry-run'] === true
    }
  } catch (error) {
    logger.error(`Error: ${(error as Error).message}\n\n${usage()}`)
    throw new Error((error as Error).message)
  }
}

async function stepReadSource(filePath: string) {
  try {
    const source = await readFile(filePath)
    return source
  } catch (error) {
    logger.error('Reading Data Sketch failed')
    logger.error((error as Error).message)
    throw new Error((error as Error).message)
  }
}

async function stepReadPreviousMigration(options: KyselyMigrationOptions) {
  if (options.previousMigrationPath === undefined) return undefined
  try {
    const previousMigrationSource = await readFile(
      options.previousMigrationPath,
      'utf8'
    )
    return previousMigrationSource
  } catch (error) {
    logger.error('Reading previous migration failed')
    logger.error((error as Error).message)
    throw new Error((error as Error).message)
  }
}

function stepLoadOpenApiSource(filePath: string) {
  return (source: string) =>
    readFile(resolve(dirname(filePath), source), 'utf8')
}

async function stepCreateKyselyMigration(
  options: KyselyMigrationOptions,
  source: Buffer,
  previousMigrationSource: string | undefined
) {
  let errorStep = 'Parsing Data Sketch'
  const generatedAt = new Date().toISOString()
  try {
    const result = await shot({
      source: source.toString('utf8'),
      sourceName: options.filePath,
      previousMigrationSource,
      includeTentative: options.includeTentative,
      generatedAt,
      renderMode:
        options.typesOutputPath === undefined
          ? 'migration'
          : 'migrationAndDatabaseTypes',
      sources: {
        openapi: stepLoadOpenApiSource(options.filePath)
      }
    })
    for (const warning of result.warnings) {
      logger.warn(warning.message)
    }
    errorStep = 'Rendering migration'

    /* c8 ignore next 3 */
    if (result.migrationSource === undefined) {
      throw new Error('Migration render output is missing')
    }
    return {
      migrationSource: result.migrationSource,
      databaseTypesSource: result.databaseTypesSource
    }
  } catch (error) {
    if ((error as Error).name === 'KyselyMigrationValidationError') {
      logger.error('Validating Data Sketch failed')
      logger.error((error as Error).message)
      throw new Error((error as Error).message)
    }
    logger.error(`${errorStep} failed`)
    logger.error((error as Error).message)
    throw new Error((error as Error).message)
  }
}

async function stepWriteOutput(
  options: KyselyMigrationOptions,
  output: { migrationSource: string; databaseTypesSource?: string }
) {
  const finalOutputPath = resolveMigrationOutputPath(
    options.outputPath,
    options.isoPrefix,
    new Date()
  )
  try {
    await writeFile(finalOutputPath, output.migrationSource)
    if (options.typesOutputPath !== undefined) {
      /* c8 ignore next 3 */
      if (output.databaseTypesSource === undefined) {
        throw new Error('Database types render output is missing')
      }
      await writeFile(options.typesOutputPath, output.databaseTypesSource)
    }
  } catch (error) {
    logger.error('Writing migration failed')
    logger.error((error as Error).message)
    throw new Error((error as Error).message)
  }
}

function resolveMigrationOutputPath(
  outputPath: string,
  isoPrefix: boolean,
  date: Date
) {
  if (!isoPrefix) return outputPath
  return join(
    dirname(outputPath),
    `${date.toISOString()}_${basename(outputPath)}`
  )
}
