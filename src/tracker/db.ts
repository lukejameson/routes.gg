import { Pool } from 'pg';
import 'dotenv/config';
import { SCHEMA_SQL, MIGRATE_SQL } from './schema.js';

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export async function initDb(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(SCHEMA_SQL);
    await client.query(MIGRATE_SQL);
  } finally {
    client.release();
  }
}
