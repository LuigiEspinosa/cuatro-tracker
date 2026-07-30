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
  'headers.authorization',
  'headers.cookie',
  '*.password',
  '*.token',
  '*.apiKey',
]

function baseOptions(): LoggerOptions {
  return {
    // ?? 'info' guards the build: with SKIP_ENV_VALIDATION the Zod default is
    // not applied, so env.LOG_LEVEL is undefined and pino would throw. At
    // runtime the schema default ('info') makes this a no-op.
    level: env.LOG_LEVEL ?? 'info',
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
