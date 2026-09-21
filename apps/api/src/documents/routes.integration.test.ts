import { randomUUID } from 'node:crypto';

import { eq } from 'drizzle-orm';
import dotenv from 'dotenv';
import { afterEach, describe, expect, it } from 'vitest';

import { createApp } from '../app.js';
import { getDatabase } from '../db/client.js';
import { documents } from '../db/schema.js';

dotenv.config({ path: new URL('../../../../.env', import.meta.url) });

const createdDocumentIds: string[] = [];
const app = createApp(async (token) => ({ subject: token, claims: { sub: token } }));

async function request(userId: string, path: string, init: RequestInit = {}) {
  return app.request(path, {
    ...init,
    headers: {
      authorization: `Bearer ${userId}`,
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...init.headers,
    },
  });
}

afterEach(async () => {
  if (createdDocumentIds.length > 0) {
    for (const id of createdDocumentIds.splice(0)) {
      await getDatabase().delete(documents).where(eq(documents.id, id));
    }
  }
});

describe('document API with PostgreSQL and OpenFGA', () => {
  it('enforces owner, viewer, and editor permissions', async () => {
    const suffix = randomUUID();
    const owner = `integration-owner-${suffix}`;
    const viewer = `integration-viewer-${suffix}`;
    const editor = `integration-editor-${suffix}`;

    const created = await request(owner, '/documents', {
      method: 'POST',
      body: JSON.stringify({ title: 'Integration document', body: 'initial body' }),
    });
    expect(created.status).toBe(201);
    const document = (await created.json()).document as { id: string };
    createdDocumentIds.push(document.id);

    expect((await request(viewer, `/documents/${document.id}`)).status).toBe(403);

    expect(
      (
        await request(owner, `/documents/${document.id}/shares`, {
          method: 'POST',
          body: JSON.stringify({ userId: viewer, role: 'viewer' }),
        })
      ).status,
    ).toBe(204);
    expect((await request(viewer, `/documents/${document.id}`)).status).toBe(200);
    expect(
      (
        await request(viewer, `/documents/${document.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ body: 'viewer cannot write' }),
        })
      ).status,
    ).toBe(403);

    expect(
      (
        await request(owner, `/documents/${document.id}/shares`, {
          method: 'POST',
          body: JSON.stringify({ userId: editor, role: 'editor' }),
        })
      ).status,
    ).toBe(204);
    expect(
      (
        await request(editor, `/documents/${document.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ body: 'editor can write' }),
        })
      ).status,
    ).toBe(200);

    const visibleToViewer = await request(viewer, '/documents');
    expect(visibleToViewer.status).toBe(200);
    expect((await visibleToViewer.json()).documents.map((entry: { id: string }) => entry.id)).toContain(
      document.id,
    );
  });
});
