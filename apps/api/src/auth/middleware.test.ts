import { exportJWK, generateKeyPair, SignJWT, createLocalJWKSet } from 'jose';
import { describe, expect, it } from 'vitest';

import { createApp } from '../app.js';
import { createAccessTokenVerifier } from './jwt.js';

const issuer = 'http://localhost:8080';
const audience = 'document-api';

async function createTestApp() {
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const publicJwk = await exportJWK(publicKey);
  const verifier = createAccessTokenVerifier(
    { issuer, audience },
    createLocalJWKSet({ keys: [{ ...publicJwk, kid: 'test-key', alg: 'RS256', use: 'sig' }] }),
  );

  const token = async (claims: { issuer?: string; audience?: string; expiresIn?: string }) =>
    new SignJWT({})
      .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
      .setIssuer(claims.issuer ?? issuer)
      .setAudience(claims.audience ?? audience)
      .setSubject('zitadel-user-id')
      .setIssuedAt()
      .setExpirationTime(claims.expiresIn ?? '5m')
      .sign(privateKey);

  return { app: createApp(verifier), token };
}

describe('JWT authentication middleware', () => {
  it('accepts a correctly signed token with the expected issuer and audience', async () => {
    const { app, token } = await createTestApp();
    const response = await app.request('/me', {
      headers: { authorization: `Bearer ${await token({})}` },
    });

    await expect(response.json()).resolves.toEqual({ sub: 'zitadel-user-id' });
    expect(response.status).toBe(200);
  });

  it.each([
    ['missing token', undefined],
    ['wrong issuer', { issuer: 'http://untrusted.example' }],
    ['wrong audience', { audience: 'another-api' }],
    ['expired token', { expiresIn: '-1s' }],
  ])('rejects %s', async (_description, claims) => {
    const { app, token } = await createTestApp();
    const headers = claims ? { authorization: `Bearer ${await token(claims)}` } : undefined;
    const response = await app.request('/me', { headers });

    expect(response.status).toBe(401);
  });
});
