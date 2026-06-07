import { writeSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { intro, log, outro } from '@clack/prompts'
import pc from 'picocolors'
import { parseSpecificationFile } from '../parser.ts'
import { validateSpecification } from '../validator.ts'

const colors = pc.createColors(true)

export const usage = [
  'Usage: shot check <file>',
  '',
  'Validate a Valuable Data Specification v1 YAML or JSON file.',
  '',
  'Options:',
  '  -h, --help  Show this help'
].join('\n')

export async function runCheckCommand(args: string[]) {
  let filePath: string
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
      writeSync(1, `${usage}\n`)
      return 0
    }
    if (parsed.positionals.length !== 1) {
      writeOptionError('missing file argument')
      return 1
    }
    filePath = parsed.positionals[0]
  } catch (error) {
    writeOptionError((error as Error).message)
    return 1
  }

  intro('Data Sketch validation')

  let input: unknown
  try {
    input = await parseSpecificationFile(filePath)
    log.success('Data Sketch read')
  } catch (error) {
    log.error('Reading Data Sketch failed')
    writeReason((error as Error).message)
    outro(colors.red('Failed'))
    await flushStdout()
    return 1
  }

  const result = await validateSpecification(input, { sourcePath: filePath })

  if (!result.success) {
    log.error('Validating Data Sketch failed')
    writeValidationIssues(result.issues.map(issue => issue.message))
    outro(colors.red('Failed'))
    await flushStdout()
    return 1
  }

  log.success('Validating Data Sketch')
  log.success('Data Sketch is valid')
  outro(colors.green('Succeeded'))
  await flushStdout()
  return 0
}

function flushStdout() {
  return new Promise<void>(resolve => process.stdout.write('', () => resolve()))
}

function writeOptionError(reason: string) {
  writeSync(2, `Error: ${reason}\n\n${usage}\n`)
}

function writeValidationIssues(messages: string[]) {
  process.stdout.write(`${messages.join('\n')}\n`)
}

function writeReason(reason: string) {
  process.stdout.write(`${reason}\n`)
}
