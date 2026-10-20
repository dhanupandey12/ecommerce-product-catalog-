import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { runMigrations } from '../../src/db/migrate.js';
import { ProductRepository } from '../../src/products/product.repository.js';

const databaseUrl = process.env.DATABASE_URL_TEST;
const integration = describe.skipIf(!databaseUrl);
let adminPool: Pool | undefined;
let testPool: Pool | undefined;
let schemaName: string | undefined;
let repository: ProductRepository;

integration('PostgreSQL product repository', () => {
  beforeAll(async () => {
    if (!databaseUrl) {
      throw new Error('DATABASE_URL_TEST is required for integration tests');
    }
    adminPool = new Pool({ connectionString: databaseUrl });
    schemaName = `catalog_test_${randomUUID().replaceAll('-', '')}`;
    await adminPool.query(`CREATE SCHEMA "${schemaName}"`);
    testPool = new Pool({
      connectionString: databaseUrl,
      options: `-c search_path=${schemaName}`,
    });
    await runMigrations(testPool);
    repository = new ProductRepository(testPool);
  });

  beforeEach(async () => {
    await testPool?.query('TRUNCATE products RESTART IDENTITY');
  });

  afterAll(async () => {
    await testPool?.end();
    if (schemaName) {
      await adminPool?.query(`DROP SCHEMA "${schemaName}" CASCADE`);
    }
    await adminPool?.end();
  });

  it('creates, reads, updates, deletes, and reports missing products', async () => {
    const created = await repository.create({
      name: 'Mug',
      description: null,
      category: 'Home',
      price: 12.5,
    });
    expect(created.id).toBe('1');
    expect(created.price).toBe(12.5);
    expect((await repository.findById(created.id))?.name).toBe('Mug');

    const updated = await repository.update(created.id, {
      name: 'Large Mug',
      description: 'Updated',
      category: 'Kitchen',
      price: 15,
    });
    expect(updated?.name).toBe('Large Mug');
    expect(updated?.updatedAt.getTime()).toBeGreaterThanOrEqual(
      created.updatedAt.getTime(),
    );
    expect(await repository.delete(created.id)).toBe(true);
    expect(await repository.findById(created.id)).toBeUndefined();
    expect(await repository.delete(created.id)).toBe(false);
  });

  it('filters category and price ranges together with stable pagination', async () => {
    const inputs = [
      ['Mug', 'Home', 12.5],
      ['Lamp', 'Home', 42.99],
      ['Shelf', 'Home', 19.99],
      ['Bottle', 'Outdoor', 19.99],
    ] as const;
    for (const [name, category, price] of inputs) {
      await repository.create({ name, description: null, category, price });
    }

    const page = await repository.list({
      category: 'Home',
      minPrice: 10,
      maxPrice: 20,
      page: 2,
      pageSize: 1,
    });
    expect(page.data.map((product) => product.name)).toEqual(['Shelf']);
    expect(page.pagination).toEqual({
      page: 2,
      pageSize: 1,
      totalItems: 2,
      totalPages: 2,
    });

    const empty = await repository.list({
      category: 'No such category',
      page: 1,
      pageSize: 20,
    });
    expect(empty.data).toEqual([]);
    expect(empty.pagination.totalPages).toBe(0);
  });

  it('treats filter values as data rather than SQL syntax', async () => {
    const result = await repository.list({
      category: "' OR 1=1 --",
      page: 1,
      pageSize: 20,
    });
    expect(result.data).toEqual([]);
    expect(result.pagination.totalItems).toBe(0);
  });
});
