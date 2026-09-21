import type { MiddlewareHandler } from 'hono';

import type { AuthenticatedUser } from './jwt.js';

export type AuthBindings = {
  Variables: {
    auth: AuthenticatedUser;
    requestId: string;
  };
};

export type AccessTokenVerifier = (token: string) => Promise<AuthenticatedUser>;

export function requireAuthentication(
  verifyAccessToken: AccessTokenVerifier,
): MiddlewareHandler<AuthBindings> {
  return async (context, next) => {
    const authorization = context.req.header('authorization');
    const match = authorization?.match(/^Bearer\s+(.+)$/i);

    if (!match) {
      return context.json({ error: 'missing_bearer_token' }, 401);
    }

    try {
      context.set('auth', await verifyAccessToken(match[1]));
    } catch {
      return context.json({ error: 'invalid_access_token' }, 401);
    }

    await next();
  };
}
