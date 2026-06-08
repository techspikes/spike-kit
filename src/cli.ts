import { writeSync } from 'node:fs'
import { createRequire } from 'node:module'
import { command as checkCommand } from './commands/check/index.ts'
import { command as kyselyMigrationCommand } from './commands/kysely-migration/index.ts'
import { command as tableSpecCommand } from './commands/table-spec/index.ts'

const require = createRequire(import.meta.url)
const packageJson = require('../package.json') as { version: string }

type Command = {
  name: string
  summary: string
  usage: string
  run(args: string[]): Promise<void>
}

const commands: Command[] = [
  checkCommand,
  kyselyMigrationCommand,
  tableSpecCommand
]

const usage = [
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

async function main(argv = process.argv.slice(2)) {
  try {
    return await runMain(argv)
  } catch (error) {
    writeOptionError((error as Error).message)
    return 1
  }
}

async function runMain(argv: string[]) {
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

function writeOptionError(reason: string) {
  writeSync(2, `Error: ${reason}\n\n${usage}\n`)
}

const exitCode = await main()
process.exitCode = exitCode
