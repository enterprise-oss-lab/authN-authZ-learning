import { serve } from '@hono/node-server';
import dotenv from 'dotenv';
import { createApp } from './app.js';

dotenv.config({ path: new URL('../../../.env', import.meta.url) });

const port = Number(process.env.API_PORT ?? 3000);
const app = createApp();

serve({ fetch: app.fetch, port }, () => {
  console.log(`API listening on http://localhost:${port}`);
});
