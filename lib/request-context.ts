import { AsyncLocalStorage } from 'node:async_hooks'
import { randomUUID } from 'node:crypto'

export type RequestContext = {
  requestId: string
}

export const requestContext = new AsyncLocalStorage<RequestContext>()

export function getRequestId(): string | undefined {
  return requestContext.getStore()?.requestId
}

const REQUEST_ID_REGEX = /^[0-9a-f-]{36}$/i

export function resolveRequestId(headerValue: string | null): string {
  if (headerValue && REQUEST_ID_REGEX.test(headerValue)) return headerValue
  return randomUUID()
}

export function withRequest<TReq extends Request, TRes>(
  handler: (req: TReq) => Promise<TRes> | TRes,
): (req: TReq) => Promise<TRes> {
  return async (req) => {
    const requestId = resolveRequestId(req.headers.get('x-request-id'))
    return requestContext.run({ requestId }, () =>
      Promise.resolve(handler(req)),
    )
  }
}
