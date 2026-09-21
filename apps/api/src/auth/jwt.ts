import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey, type JWTPayload } from 'jose';

export type AuthenticatedUser = {
  subject: string;
  claims: JWTPayload;
};

export type JwtVerifierConfig = {
  issuer: string;
  audience: string;
};

export function jwtVerifierConfigFromEnv(environment = process.env): JwtVerifierConfig {
  const issuer = environment.ZITADEL_ISSUER;
  const audience = environment.ZITADEL_API_AUDIENCE;

  if (!issuer || !audience) {
    throw new Error('ZITADEL_ISSUER and ZITADEL_API_AUDIENCE must be configured.');
  }

  return { issuer, audience };
}

export function createAccessTokenVerifier(
  config: JwtVerifierConfig,
  getKey: JWTVerifyGetKey = createRemoteJWKSet(new URL('/oauth/v2/keys', config.issuer)),
) {
  return async (token: string): Promise<AuthenticatedUser> => {
    const { payload } = await jwtVerify(token, getKey, {
      issuer: config.issuer,
      audience: config.audience,
      algorithms: ['RS256'],
    });

    if (!payload.sub) {
      throw new Error('Access token is missing the subject claim.');
    }

    return { subject: payload.sub, claims: payload };
  };
}
