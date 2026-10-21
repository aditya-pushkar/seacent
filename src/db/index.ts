/**
 * Drizzle Postgres client (server-only). The connection is created lazily on
 * the first request so builds do not require a populated .env and client
 * bundles can never import this module.
 */
import 'server-only';

import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { getServerEnv } from '@/lib/server/env';
import { schema } from './schema';

let pool: Pool | null = null;
let database: NodePgDatabase<typeof schema> | null = null;

export function getPool(): Pool {
  if (!pool) {
    const env = getServerEnv();
    pool = new Pool({ connectionString: env.DATABASE_URL });
  }
  return pool;
}

export function getDb(): NodePgDatabase<typeof schema> {
  if (!database) {
    database = drizzle({ client: getPool(), schema });
  }
  return database;
}
