import pino from 'pino'
import pretty from 'pino-pretty'

const STDOUT_LOGGER = pino({ level: 'info' }, prettyStream(process.stdout))
const STDERR_LOGGER = pino({ level: 'error' }, prettyStream(process.stderr))

type LoggerCapture = {
  stdout: string[]
  stderr: string[]
}

let currentCapture: LoggerCapture | undefined

export const logger = {
  info: (message: string) => {
    if (currentCapture !== undefined) {
      currentCapture.stdout.push(message)
      return
    }
    /* c8 ignore next */
    STDOUT_LOGGER.info(message)
  },
  warn: (message: string) => {
    if (currentCapture !== undefined) {
      currentCapture.stdout.push(message)
      return
    }
    /* c8 ignore next */
    STDOUT_LOGGER.warn(message)
  },
  error: (message: string) => {
    if (currentCapture !== undefined) {
      currentCapture.stderr.push(message)
      return
    }
    /* c8 ignore next */
    STDERR_LOGGER.error(message)
  }
}

export function captureLoggerForTest() {
  const previous = currentCapture
  const capture: LoggerCapture = {
    stdout: [],
    stderr: []
  }
  currentCapture = capture

  return {
    stdout: () => joinCapturedLogs(capture.stdout),
    stderr: () => joinCapturedLogs(capture.stderr),
    restore: () => {
      currentCapture = previous
    }
  }
}

function prettyStream(destination: NodeJS.WritableStream) {
  return pretty({
    colorize: true,
    destination,
    ignore: 'time,level,pid,hostname'
  })
}

function joinCapturedLogs(messages: string[]) {
  return messages.length === 0 ? '' : `${messages.join('\n')}\n`
}
