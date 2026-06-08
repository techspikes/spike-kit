import { writeSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { intro, log, outro } from '@clack/prompts'
import pc from 'picocolors'
import {
  generateKyselyDatabaseTypes,
  generateKyselyMigration,
  KyselyMigrationValidationError,
  resolveMigrationOutputPath
} from './lib.ts'

const colors = pc.createColors(true)

const usage = [
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

export const command = {
  name: 'kysely-migration',
  summary: 'Generate a Kysely TypeScript initial or diff migration',
  usage,
  run: runKyselyMigrationCommand
}

async function runKyselyMigrationCommand(args: string[]) {
  let parsed: ReturnType<typeof parseArgs>
  try {
    parsed = parseArgs({
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
  const previousMigrationPath = parsed.values['previous-migration'] as
    | string
    | undefined
  const typesOutputPath = parsed.values['types-output'] as string | undefined
  if (typesOutputPath !== undefined && !typesOutputPath.endsWith('.d.ts')) {
    writeOptionError('--types-output must end with .d.ts')
    throw new Error('--types-output must end with .d.ts')
  }
  const isoPrefix = parsed.values['iso-prefix'] === true
  const includeTentative = parsed.values['include-tentative'] === true
  const dryRun = parsed.values['dry-run'] === true

  intro('Migration generation')

  let source: Buffer
  try {
    source = await readFile(filePath)
    log.success('Data Sketch read')
  } catch (error) {
    await reportMigrationError('Reading Data Sketch', error)
    throw new Error((error as Error).message)
  }

  let previousMigrationSource: string | undefined
  if (previousMigrationPath !== undefined) {
    try {
      previousMigrationSource = await readFile(previousMigrationPath, 'utf8')
      log.success('Previous migration read')
    } catch (error) {
      await reportMigrationError('Reading previous migration', error)
      throw new Error((error as Error).message)
    }
  }

  let errorStep = 'Parsing Data Sketch'
  const loadOpenApiSource = (source: string) =>
    readFile(resolve(dirname(filePath), source), 'utf8')
  const handleEvent = (
    event:
      | {
          type:
            | 'parsed'
            | 'validated'
            | 'projected'
            | 'previousSnapshotParsed'
            | 'rendered'
        }
      | { type: 'warning'; message: string }
  ) => {
    if (event.type === 'parsed') {
      errorStep = 'Validating Data Sketch'
    }
    if (event.type === 'validated') {
      log.success('Validating Data Sketch')
      errorStep = 'Creating DB projection snapshot'
    }
    if (event.type === 'projected') {
      log.success('Creating DB projection snapshot')
      errorStep =
        previousMigrationSource === undefined
          ? 'Rendering migration'
          : 'Parsing previous DB projection snapshot'
    }
    if (event.type === 'previousSnapshotParsed') {
      log.success('Previous DB projection snapshot parsed')
      errorStep = 'Rendering migration'
    }
    if (event.type === 'warning') {
      log.warn(event.message)
    }
    if (event.type === 'rendered') {
      log.success('Rendering migration')
    }
  }

  let migrationSource: string
  const generatedAt = new Date().toISOString()
  try {
    migrationSource = await generateKyselyMigration({
      source: source.toString('utf8'),
      sourceName: filePath,
      previousMigrationSource,
      includeTentative,
      generatedAt,
      loadOpenApiSource,
      onEvent: handleEvent
    })
  } catch (error) {
    if (error instanceof KyselyMigrationValidationError) {
      log.error('Validating Data Sketch failed')
      writeReason(error.issues.map(issue => issue.message).join('\n'))
      outro(colors.red('Failed'))
      await flushStdout()
      throw new Error(error.message)
    }
    await reportMigrationError(errorStep, error)
    throw new Error((error as Error).message)
  }

  if (dryRun) {
    log.success('Dry run completed')
    outro(colors.green('Succeeded'))
    await flushStdout()
    return
  }

  const finalOutputPath = resolveMigrationOutputPath(
    outputPath,
    isoPrefix,
    new Date()
  )

  try {
    await writeFile(finalOutputPath, migrationSource)
    log.success('Migration written')
    if (typesOutputPath !== undefined) {
      const databaseTypesSource = await generateKyselyDatabaseTypes({
        source: source.toString('utf8'),
        sourceName: filePath,
        includeTentative,
        generatedAt,
        loadOpenApiSource
      })
      await writeFile(typesOutputPath, databaseTypesSource)
      log.success('Type definitions written')
    }
  } catch (error) {
    await reportMigrationError('Writing migration', error)
    throw new Error((error as Error).message)
  }

  log.success('Migration generated')
  outro(colors.green('Succeeded'))
  await flushStdout()
}

function flushStdout() {
  return new Promise<void>(resolve => process.stdout.write('', () => resolve()))
}

function writeOptionError(reason: string) {
  writeSync(2, `Error: ${reason}\n\n${usage}\n`)
}

async function reportMigrationError(step: string, error: unknown) {
  log.error(`${step} failed`)
  writeReason((error as Error).message)
  outro(colors.red('Failed'))
  await flushStdout()
}

function writeReason(reason: string) {
  process.stdout.write(`${reason}\n`)
}
