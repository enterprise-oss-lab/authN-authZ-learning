import { Hono } from 'hono';
import { cors } from 'hono/cors';

import { createAccessTokenVerifier, jwtVerifierConfigFromEnv } from './auth/jwt.js';
import { requireAuthentication, type AuthBindings, type AccessTokenVerifier } from './auth/middleware.js';
import { createDocumentRoutes } from './documents/routes.js';

export function createApp(verifyAccessToken?: AccessTokenVerifier) {
  const app = new Hono<AuthBindings>();

  app.use(
    '*',
    cors({
      origin: process.env.WEB_ORIGIN ?? 'http://localhost:5173',
      allowHeaders: ['Authorization', 'Content-Type'],
      allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    }),
  );

  app.get('/health', (context) => context.json({ status: 'ok' }));

  const authenticate = requireAuthentication(
    verifyAccessToken ?? createAccessTokenVerifier(jwtVerifierConfigFromEnv()),
  );

  app.use('/me', authenticate);
  app.use('/documents', authenticate);
  app.use('/documents/*', authenticate);

  app.get('/me', (context) => {
    const user = context.get('auth');
    return context.json({ sub: user.subject });
  });

  app.route('/documents', createDocumentRoutes());

  return app;
}
