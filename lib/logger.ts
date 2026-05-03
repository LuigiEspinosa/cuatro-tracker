import pino, { type DestinationStream, type LoggerOptions } from 'pino'
import { env } from '@/lib/env'
import { getRequestId } from './request-context'

const redactPaths = [
  'password',
  'Authorization',
  'authorization',
  'cookie',
  'Cookie',
  'token',
  'apiKey',
  'headers.authorization',
  'headers.cookie',
  '*.password',
  '*.token',
  '*.apiKey',
]

function baseOptions(): LoggerOptions {
  return {
    level: env.LOG_LEVEL,
    redact: { paths: redactPaths, censor: '[REDACTED]' },
    mixin() {
      const requestId = getRequestId()
      return requestId ? { requestId } : {}
    },
  }
}

export function createLogger(destination?: DestinationStream) {
  if (destination) {
    return pino(baseOptions(), destination)
  }

  const options: LoggerOptions = {
    ...baseOptions(),
    transport:
      env.NODE_ENV === 'production'
        ? undefined
        : { target: 'pino-pretty', options: { colorize: true } },
  }
  return pino(options)
}

export const logger = createLogger()
