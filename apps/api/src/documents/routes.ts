import { desc, eq, inArray } from 'drizzle-orm';
import { Hono } from 'hono';

import type { AuthBindings } from '../auth/middleware.js';
import { getDatabase } from '../db/client.js';
import { documents } from '../db/schema.js';
import {
  createOpenFgaClient,
  DocumentAuthorizer,
  type DocumentPermission,
  type DocumentRole,
  openFgaConfigFromEnv,
} from '../openfga/client.js';
import { logAuthorizationDecision } from '../observability/log.js';

const validRoles = new Set<DocumentRole>(['editor', 'viewer']);

const jsonObject = async (request: Request): Promise<Record<string, unknown> | undefined> => {
  try {
    const body = await request.json();
    return body !== null && typeof body === 'object' ? (body as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
};

const textField = (body: Record<string, unknown> | undefined, name: string) =>
  typeof body?.[name] === 'string' ? body[name].trim() : undefined;

const documentAuthorizer = () =>
  new DocumentAuthorizer(createOpenFgaClient(openFgaConfigFromEnv()));

async function permitted(
  requestId: string,
  userId: string,
  documentId: string,
  permission: DocumentPermission,
): Promise<boolean> {
  const allowed = await documentAuthorizer().can(userId, documentId, permission);
  logAuthorizationDecision(requestId, userId, documentId, permission, allowed);
  return allowed;
}

export function createDocumentRoutes() {
  const app = new Hono<AuthBindings>();

  app.get('/', async (context) => {
    const userId = context.get('auth').subject;
    const readableIds = await documentAuthorizer().readableDocumentIds(userId);

    if (readableIds.length === 0) {
      return context.json({ documents: [] });
    }

    const rows = await getDatabase()
      .select({ id: documents.id, title: documents.title, updatedAt: documents.updatedAt })
      .from(documents)
      .where(inArray(documents.id, readableIds))
      .orderBy(desc(documents.updatedAt));

    return context.json({ documents: rows });
  });

  app.post('/', async (context) => {
    const body = await jsonObject(context.req.raw);
    const title = textField(body, 'title');
    const documentBody = typeof body?.body === 'string' ? body.body : '';

    if (!title) {
      return context.json({ error: 'title_is_required' }, 400);
    }

    const [document] = await getDatabase()
      .insert(documents)
      .values({ title, body: documentBody })
      .returning();

    try {
      await documentAuthorizer().grant(document.id, context.get('auth').subject, 'owner');
    } catch (error) {
      await getDatabase().delete(documents).where(eq(documents.id, document.id));
      throw error;
    }

    return context.json({ document }, 201);
  });

  app.get('/:id', async (context) => {
    const documentId = context.req.param('id');
    if (!(await permitted(context.get('requestId'), context.get('auth').subject, documentId, 'can_read'))) {
      return context.json({ error: 'forbidden' }, 403);
    }

    const [document] = await getDatabase()
      .select()
      .from(documents)
      .where(eq(documents.id, documentId));

    return document ? context.json({ document }) : context.json({ error: 'not_found' }, 404);
  });

  app.patch('/:id', async (context) => {
    const documentId = context.req.param('id');
    if (!(await permitted(context.get('requestId'), context.get('auth').subject, documentId, 'can_write'))) {
      return context.json({ error: 'forbidden' }, 403);
    }

    const body = await jsonObject(context.req.raw);
    const title = textField(body, 'title');
    const documentBody = typeof body?.body === 'string' ? body.body : undefined;
    if (!title && documentBody === undefined) {
      return context.json({ error: 'title_or_body_is_required' }, 400);
    }

    const [document] = await getDatabase()
      .update(documents)
      .set({ ...(title ? { title } : {}), ...(documentBody !== undefined ? { body: documentBody } : {}), updatedAt: new Date() })
      .where(eq(documents.id, documentId))
      .returning();

    return document ? context.json({ document }) : context.json({ error: 'not_found' }, 404);
  });

  app.delete('/:id', async (context) => {
    const documentId = context.req.param('id');
    if (!(await permitted(context.get('requestId'), context.get('auth').subject, documentId, 'can_delete'))) {
      return context.json({ error: 'forbidden' }, 403);
    }

    await getDatabase().delete(documents).where(eq(documents.id, documentId));
    return context.body(null, 204);
  });

  app.post('/:id/shares', async (context) => {
    const documentId = context.req.param('id');
    if (!(await permitted(context.get('requestId'), context.get('auth').subject, documentId, 'can_share'))) {
      return context.json({ error: 'forbidden' }, 403);
    }

    const body = await jsonObject(context.req.raw);
    const userId = textField(body, 'userId');
    const role = textField(body, 'role');
    if (!userId || !role || !validRoles.has(role as DocumentRole)) {
      return context.json({ error: 'user_id_and_editor_or_viewer_role_are_required' }, 400);
    }

    await documentAuthorizer().grant(documentId, userId, role as DocumentRole);
    return context.body(null, 204);
  });

  app.delete('/:id/shares', async (context) => {
    const documentId = context.req.param('id');
    if (!(await permitted(context.get('requestId'), context.get('auth').subject, documentId, 'can_share'))) {
      return context.json({ error: 'forbidden' }, 403);
    }

    const body = await jsonObject(context.req.raw);
    const userId = textField(body, 'userId');
    const role = textField(body, 'role');
    if (!userId || !role || !validRoles.has(role as DocumentRole)) {
      return context.json({ error: 'user_id_and_editor_or_viewer_role_are_required' }, 400);
    }

    await documentAuthorizer().revoke(documentId, userId, role as DocumentRole);
    return context.body(null, 204);
  });

  return app;
}
