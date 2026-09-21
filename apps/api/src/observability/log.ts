import { randomUUID } from 'node:crypto';

import type { MiddlewareHandler } from 'hono';

import type { AuthBindings } from '../auth/middleware.js';

type LogEntry = {
  event: string;
  requestId: string;
  userId?: string;
  documentId?: string;
  permission?: string;
  allowed?: boolean;
  method?: string;
  path?: string;
  status?: number;
};

function write(entry: LogEntry) {
  // Deliberately do not include authorization headers, tokens, or document bodies.
  console.info(JSON.stringify({ timestamp: new Date().toISOString(), ...entry }));
}

export const requestLogger = (): MiddlewareHandler<AuthBindings> => async (context, next) => {
  const requestId = context.req.header('x-request-id') ?? randomUUID();
  context.set('requestId', requestId);

  await next();

  write({
    event: 'http_request',
    requestId,
    userId: context.get('auth')?.subject,
    method: context.req.method,
    path: context.req.path,
    status: context.res.status,
  });
};

export function logAuthorizationDecision(
  requestId: string,
  userId: string,
  documentId: string,
  permission: string,
  allowed: boolean,
) {
  write({ event: 'authorization_check', requestId, userId, documentId, permission, allowed });
}
