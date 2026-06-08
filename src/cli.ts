import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { runSteps as runCheckSteps } from './commands/check/index.ts'
import { runSteps as runKyselyMigrationSteps } from './commands/kysely-migration/index.ts'
import { runSteps as runTableSpecSteps } from './commands/table-spec/index.ts'
import { logger } from './core/logger.ts'

const require = createRequire(import.meta.url)
const { version } = require('../package.json') as { version: string }

const commands = [
  {
    name: 'check',
    summary: 'Validate a Valuable Data Specification v1 YAML or JSON file',
    run: runCheckSteps
  },
  {
    name: 'kysely-migration',
    summary: 'Generate a Kysely TypeScript initial or diff migration',
    run: runKyselyMigrationSteps
  },
  {
    name: 'table-spec',
    summary: 'Generate a Markdown table specification document',
    run: runTableSpecSteps
  }
]

const usage = () =>
  [
    'Usage:',
    '  shot check <file>',
    '  shot kysely-migration <file> --output <file>',
    '  shot table-spec <file> --output <file>',
    '',
    'Subcommands:',
    '  check             Validate a Valuable Data Specification v1 YAML or JSON file',
    '  kysely-migration  Generate a Kysely TypeScript initial or diff migration',
    '  table-spec        Generate a Markdown table specification document',
    '',
    'Options:',
    '  -h, --help     Show this help',
    '  -v, --version  Show version'
  ].join('\n')

export async function main(argv = process.argv.slice(2)) {
  try {
    return await runMain(argv)
  } catch (error) {
    logger.error(`Error: ${(error as Error).message}\n\n${usage()}`)
    return 1
  }
}

async function runMain(argv: string[]) {
  const [subcommand, ...args] = argv
  if (subcommand === '--help' || subcommand === '-h') {
    logger.info(usage())
    return 0
  }
  if (subcommand === '--version' || subcommand === '-v') {
    logger.info(version)
    return 0
  }
  if (subcommand === undefined) {
    throw new Error('missing subcommand')
  }

  const command = commands.find(command => command.name === subcommand)
  if (command === undefined) {
    throw new Error(`unknown subcommand "${subcommand}"`)
  }

  try {
    await command.run(args)
    return 0
  } catch {
    return 1
  }
}

/* c8 ignore next 6 */
if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  process.exitCode = await main()
}
