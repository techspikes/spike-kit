import { writeSync } from 'node:fs'
import { createRequire } from 'node:module'
import { runCheckCommand } from './commands/check.ts'
import { runKyselyMigrationCommand } from './commands/kysely-migration.ts'
import { runTableSpecCommand } from './commands/table-spec.ts'

const require = createRequire(import.meta.url)
const packageJson = require('../package.json') as { version: string }

export const usage = [
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
  const [subcommand, ...args] = argv
  if (subcommand === '--help' || subcommand === '-h') {
    writeSync(1, `${usage}\n`)
    return 0
  }
  if (subcommand === '--version' || subcommand === '-v') {
    writeSync(1, `${packageJson.version}\n`)
    return 0
  }
  if (subcommand === undefined) {
    writeOptionError('missing subcommand')
    return 1
  }

  switch (subcommand) {
    case 'check':
      return runCheckCommand(args)
    case 'kysely-migration':
      return runKyselyMigrationCommand(args)
    case 'table-spec':
      return runTableSpecCommand(args)
    default:
      writeOptionError(`unknown subcommand "${subcommand}"`)
      return 1
  }
}

function writeOptionError(reason: string) {
  writeSync(2, `Error: ${reason}\n\n${usage}\n`)
}

const exitCode = await main()
process.exitCode = exitCode
