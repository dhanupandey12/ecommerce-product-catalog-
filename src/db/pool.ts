import { Pool, type PoolConfig } from 'pg';
import { getConfig } from '../config.js';

export function createPool(config: PoolConfig = {}): Pool {
  return new Pool({
    connectionString: getConfig().DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    ...config,
  });
}
