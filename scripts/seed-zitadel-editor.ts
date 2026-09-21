import { readFile, writeFile } from 'node:fs/promises';
import { createPrivateKey } from 'node:crypto';
import { importPKCS8, SignJWT } from 'jose';
import dotenv from 'dotenv';

type CreateUserResponse = { userId?: string };
type MachineKey = { keyId: string; key: string; userId: string };

async function managementAccessToken(issuer: string, machineKeyPath: string): Promise<string> {
  const machineKey = JSON.parse(await readFile(machineKeyPath, 'utf8')) as MachineKey;
  // ZITADEL JSON keys may contain either a PKCS#1 ("RSA PRIVATE KEY") or
  // PKCS#8 ("PRIVATE KEY") PEM. Normalize both to the form jose accepts.
  const pkcs8 = createPrivateKey(machineKey.key)
    .export({ type: 'pkcs8', format: 'pem' })
    .toString();
  const privateKey = await importPKCS8(pkcs8, 'RS256');
  const tokenEndpoint = `${issuer}/oauth/v2/token`;
  const assertion = await new SignJWT({})
    .setProtectedHeader({ alg: 'RS256', kid: machineKey.keyId, typ: 'JWT' })
    .setIssuer(machineKey.userId)
    .setSubject(machineKey.userId)
    .setAudience(issuer)
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(privateKey);
  const form = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    scope: 'openid profile email urn:zitadel:iam:org:project:id:zitadel:aud',
    assertion,
  });
  const response = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: form,
  });

  if (!response.ok) {
    throw new Error(`Machine User authentication failed (${response.status}): ${await response.text()}`);
  }

  const body = (await response.json()) as { access_token?: string };
  if (!body.access_token) {
    throw new Error('Machine User authentication did not return an access token.');
  }

  return body.access_token;
}

async function main() {
  const envPath = new URL('../.env', import.meta.url);
  dotenv.config({ path: envPath });

  const issuer = process.env.ZITADEL_ISSUER?.replace(/\/$/, '');
  const machineKeyPath = process.env.ZITADEL_MACHINE_KEY_PATH;
  const username = process.env.ZITADEL_EDITOR_USERNAME ?? 'editor';
  const email = process.env.ZITADEL_EDITOR_EMAIL ?? 'editor@example.test';
  const password = process.env.ZITADEL_EDITOR_PASSWORD;
  const existingUserId = process.env.ZITADEL_EDITOR_USER_ID;

  if (!issuer || !machineKeyPath || !password) {
    throw new Error(
      'ZITADEL_ISSUER, ZITADEL_MACHINE_KEY_PATH, and ZITADEL_EDITOR_PASSWORD must be set in .env.',
    );
  }

  const accessToken = await managementAccessToken(issuer, machineKeyPath);

  const request = async (path: string, init: RequestInit = {}) => {
    const response = await fetch(`${issuer}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${accessToken}`,
        ...(init.body ? { 'content-type': 'application/json' } : {}),
        ...init.headers,
      },
    });

    if (!response.ok) {
      throw new Error(
        `Zitadel Management API request failed (${response.status}): ${await response.text()}`,
      );
    }

    return response;
  };

  const reuseOrRemoveInitialUser = async (userId: string) => {
    const response = await request(`/management/v1/users/${userId}`);
    const { user } = (await response.json()) as { user?: { state?: string } };

    if (user?.state === 'USER_STATE_ACTIVE') {
      return true;
    }

    if (user?.state === 'USER_STATE_INITIAL') {
      await request(`/management/v1/users/${userId}`, { method: 'DELETE' });
      console.log(`Removed incomplete Zitadel editor user: ${userId}`);
      return false;
    }

    throw new Error(`Existing Zitadel editor user is not active (state: ${user?.state ?? 'unknown'}).`);
  };

  if (existingUserId) {
    if (await reuseOrRemoveInitialUser(existingUserId)) {
      console.log(`Zitadel editor user already exists: ${existingUserId}`);
      return;
    }
  }

  const response = await request('/management/v1/users/human', {
    method: 'POST',
    body: JSON.stringify({
      userName: username,
      profile: {
        firstName: 'Editor',
        lastName: 'Demo',
        displayName: 'Editor Demo',
      },
      email: {
        email,
        isEmailVerified: true,
      },
      initialPassword: password,
    }),
  });
  const { userId } = (await response.json()) as CreateUserResponse;

  if (!userId) {
    throw new Error('Zitadel did not return a user ID.');
  }

  const envFile = await readFile(envPath, 'utf8');
  const nextEnv = /^ZITADEL_EDITOR_USER_ID=.*$/m.test(envFile)
    ? envFile.replace(/^ZITADEL_EDITOR_USER_ID=.*$/m, `ZITADEL_EDITOR_USER_ID=${userId}`)
    : `${envFile.trimEnd()}\nZITADEL_EDITOR_USER_ID=${userId}\n`;
  await writeFile(envPath, nextEnv);

  console.log(`Zitadel editor user created: ${userId}`);
  console.log(`Login name: ${username}@auth-learning.localhost`);
}

void main();
