import { OpenFgaClient } from '@openfga/sdk';

export type DocumentPermission = 'can_read' | 'can_write' | 'can_share' | 'can_delete';
export type DocumentRole = 'owner' | 'editor' | 'viewer';

export type OpenFgaConfig = {
  apiUrl: string;
  storeId: string;
  authorizationModelId: string;
};

export function openFgaConfigFromEnv(environment = process.env): OpenFgaConfig {
  const required = [
    'OPENFGA_API_URL',
    'OPENFGA_STORE_ID',
    'OPENFGA_AUTHORIZATION_MODEL_ID',
  ] as const;

  const missing = required.filter((key) => !environment[key]);

  if (missing.length > 0) {
    throw new Error(`Missing OpenFGA configuration: ${missing.join(', ')}`);
  }

  return {
    apiUrl: environment.OPENFGA_API_URL!,
    storeId: environment.OPENFGA_STORE_ID!,
    authorizationModelId: environment.OPENFGA_AUTHORIZATION_MODEL_ID!,
  };
}

export function createOpenFgaClient(config: OpenFgaConfig): OpenFgaClient {
  return new OpenFgaClient(config);
}

export class DocumentAuthorizer {
  constructor(private readonly client: OpenFgaClient) {}

  async can(userId: string, documentId: string, permission: DocumentPermission): Promise<boolean> {
    const response = await this.client.check({
      user: `user:${userId}`,
      relation: permission,
      object: `document:${documentId}`,
    });

    return response.allowed === true;
  }

  async readableDocumentIds(userId: string): Promise<string[]> {
    const response = await this.client.listObjects({
      type: 'document',
      relation: 'can_read',
      user: `user:${userId}`,
    });

    return response.objects.map((object) => object.replace(/^document:/, ''));
  }

  async grant(documentId: string, userId: string, role: DocumentRole): Promise<void> {
    await this.client.write({
      writes: [
        {
          user: `user:${userId}`,
          relation: role,
          object: `document:${documentId}`,
        },
      ],
    });
  }

  async revoke(documentId: string, userId: string, role: DocumentRole): Promise<void> {
    await this.client.write({
      deletes: [
        {
          user: `user:${userId}`,
          relation: role,
          object: `document:${documentId}`,
        },
      ],
    });
  }
}
