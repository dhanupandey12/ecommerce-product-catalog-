import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { Pool } from 'pg';
import { createPool } from './pool.js';

const migrationsDirectory = fileURLToPath(
  new URL('../../migrations/', import.meta.url),
);

export async function runMigrations(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const migrations = (await readdir(migrationsDirectory))
    .filter((name) => name.endsWith('.sql'))
    .sort();

  for (const name of migrations) {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');
      const existing = await client.query<{ name: string }>(
        'SELECT name FROM schema_migrations WHERE name = $1',
        [name],
      );

      if (existing.rowCount === 0) {
        const sql = await readFile(
          new URL(`../../migrations/${name}`, import.meta.url),
          'utf8',
        );
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [
          name,
        ]);
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const pool = createPool();
  try {
    await runMigrations(pool);
    console.info('Database migrations applied.');
  } finally {
    await pool.end();
  }
}
