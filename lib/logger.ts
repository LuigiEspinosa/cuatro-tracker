import pino, { type DestinationStream, type LoggerOptions } from 'pino'
import pretty from 'pino-pretty'
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
  'notes',
  'headers.authorization',
  'headers.cookie',
  '*.password',
  '*.token',
  '*.apiKey',
  '*.notes',
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

  if (env.NODE_ENV === 'production') {
    return pino(baseOptions())
  }

  return pino(baseOptions(), pretty({ colorize: true }))
}

export const logger = createLogger()
