import { readFile } from 'node:fs/promises';
import { OpenFgaClient } from '@openfga/sdk';
import dotenv from 'dotenv';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DocumentAuthorizer } from './client.js';

dotenv.config({ path: new URL('../../../../.env', import.meta.url) });

const apiUrl = process.env.OPENFGA_API_URL;
const describeWithOpenFga = apiUrl ? describe : describe.skip;

describeWithOpenFga('document authorization model', () => {
  let authorizer: DocumentAuthorizer;
  let testStoreClient: OpenFgaClient;

  beforeAll(async () => {
    const model = JSON.parse(
      await readFile(new URL('../../../../infra/openfga/model.json', import.meta.url), 'utf8'),
    );
    const rootClient = new OpenFgaClient({ apiUrl });
    const store = await rootClient.createStore({ name: `authorization-test-${Date.now()}` });
    testStoreClient = new OpenFgaClient({ apiUrl, storeId: store.id });
    const response = await testStoreClient.writeAuthorizationModel(model);

    authorizer = new DocumentAuthorizer(
      new OpenFgaClient({
        apiUrl,
        storeId: store.id,
        authorizationModelId: response.authorization_model_id,
      }),
    );

    await Promise.all([
      authorizer.grant('project-plan', 'owner', 'owner'),
      authorizer.grant('project-plan', 'editor', 'editor'),
      authorizer.grant('project-plan', 'viewer', 'viewer'),
    ]);
  });

  afterAll(async () => {
    await testStoreClient.deleteStore();
  });

  it('allows the owner to read, write, share, and delete', async () => {
    await expect(authorizer.can('owner', 'project-plan', 'can_read')).resolves.toBe(true);
    await expect(authorizer.can('owner', 'project-plan', 'can_write')).resolves.toBe(true);
    await expect(authorizer.can('owner', 'project-plan', 'can_share')).resolves.toBe(true);
    await expect(authorizer.can('owner', 'project-plan', 'can_delete')).resolves.toBe(true);
  });

  it('allows the editor to read and write only', async () => {
    await expect(authorizer.can('editor', 'project-plan', 'can_read')).resolves.toBe(true);
    await expect(authorizer.can('editor', 'project-plan', 'can_write')).resolves.toBe(true);
    await expect(authorizer.can('editor', 'project-plan', 'can_share')).resolves.toBe(false);
    await expect(authorizer.can('editor', 'project-plan', 'can_delete')).resolves.toBe(false);
  });

  it('allows the viewer to read only', async () => {
    await expect(authorizer.can('viewer', 'project-plan', 'can_read')).resolves.toBe(true);
    await expect(authorizer.can('viewer', 'project-plan', 'can_write')).resolves.toBe(false);
    await expect(authorizer.can('viewer', 'project-plan', 'can_share')).resolves.toBe(false);
    await expect(authorizer.can('viewer', 'project-plan', 'can_delete')).resolves.toBe(false);
  });

  it('lists only documents the user can read', async () => {
    await authorizer.grant('private-notes', 'owner', 'owner');

    await expect(authorizer.readableDocumentIds('viewer')).resolves.toEqual(['project-plan']);
    await expect(authorizer.readableDocumentIds('owner')).resolves.toEqual(
      expect.arrayContaining(['project-plan', 'private-notes']),
    );
  });
});
