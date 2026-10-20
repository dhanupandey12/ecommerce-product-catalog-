import pino from 'pino';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import type {
  ListProductsOptions,
  Product,
  ProductInput,
  ProductPage,
  ProductStore,
} from '../../src/products/product.types.js';
import { ProductService } from '../../src/products/product.service.js';

class MemoryProductStore implements ProductStore {
  private readonly products = new Map<string, Product>();
  private nextId = 1;
  failCreate = false;

  async create(input: ProductInput): Promise<Product> {
    if (this.failCreate) {
      throw new Error('database unavailable');
    }
    const now = new Date();
    const product = {
      id: String(this.nextId++),
      ...input,
      createdAt: now,
      updatedAt: now,
    };
    this.products.set(product.id, product);
    return product;
  }

  async findById(id: string): Promise<Product | undefined> {
    return this.products.get(id);
  }

  async update(id: string, input: ProductInput): Promise<Product | undefined> {
    const product = this.products.get(id);
    if (!product) {
      return undefined;
    }
    const updated = { ...product, ...input, updatedAt: new Date() };
    this.products.set(id, updated);
    return updated;
  }

  async delete(id: string): Promise<boolean> {
    return this.products.delete(id);
  }

  async list(options: ListProductsOptions): Promise<ProductPage> {
    const matching = [...this.products.values()]
      .filter(
        (product) =>
          options.category === undefined ||
          product.category === options.category,
      )
      .filter(
        (product) =>
          options.minPrice === undefined || product.price >= options.minPrice,
      )
      .filter(
        (product) =>
          options.maxPrice === undefined || product.price <= options.maxPrice,
      )
      .sort((left, right) => Number(left.id) - Number(right.id));
    const offset = (options.page - 1) * options.pageSize;
    const totalItems = matching.length;

    return {
      data: matching.slice(offset, offset + options.pageSize),
      pagination: {
        page: options.page,
        pageSize: options.pageSize,
        totalItems,
        totalPages: Math.ceil(totalItems / options.pageSize),
      },
    };
  }
}

describe('product API', () => {
  let store: MemoryProductStore;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    store = new MemoryProductStore();
    app = createApp(new ProductService(store), pino({ level: 'silent' }));
  });

  it('creates and retrieves a product', async () => {
    const created = await request(app)
      .post('/api/products')
      .send({ name: 'Mug', category: 'Home', price: 12.5 });

    expect(created.status).toBe(201);
    expect(created.headers.location).toBe(`/api/products/${created.body.id}`);
    expect(created.body).toMatchObject({
      name: 'Mug',
      description: null,
      category: 'Home',
      price: 12.5,
    });

    const retrieved = await request(app).get(
      `/api/products/${created.body.id}`,
    );
    expect(retrieved.status).toBe(200);
    expect(retrieved.body.id).toBe(created.body.id);
  });

  it('updates and deletes a product, then returns not found', async () => {
    const created = await store.create({
      name: 'Mug',
      description: null,
      category: 'Home',
      price: 12.5,
    });

    const updated = await request(app).put(`/api/products/${created.id}`).send({
      name: 'Large Mug',
      category: 'Kitchen',
      price: 15,
      description: 'Large size',
    });
    expect(updated.status).toBe(200);
    expect(updated.body).toMatchObject({
      name: 'Large Mug',
      category: 'Kitchen',
      price: 15,
    });

    const deleted = await request(app).delete(`/api/products/${created.id}`);
    expect(deleted.status).toBe(204);
    expect(deleted.text).toBe('');

    const missing = await request(app).get(`/api/products/${created.id}`);
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe('NOT_FOUND');
  });

  it('returns not found when updating or deleting a well-formed missing ID', async () => {
    const body = { name: 'Mug', category: 'Home', price: 12.5 };
    const updated = await request(app).put('/api/products/999').send(body);
    const deleted = await request(app).delete('/api/products/999');

    expect(updated.status).toBe(404);
    expect(updated.body.error.code).toBe('NOT_FOUND');
    expect(deleted.status).toBe(404);
    expect(deleted.body.error.code).toBe('NOT_FOUND');
  });

  it('validates product bodies and product IDs', async () => {
    const invalidBody = await request(app)
      .post('/api/products')
      .send({ name: ' ', category: 'Home', price: -1 });
    expect(invalidBody.status).toBe(400);
    expect(invalidBody.body.error.code).toBe('VALIDATION_ERROR');

    const invalidPricePrecision = await request(app)
      .post('/api/products')
      .send({ name: 'Item', category: 'Home', price: 1.234 });
    expect(invalidPricePrecision.status).toBe(400);

    const invalidId = await request(app).get('/api/products/abc');
    expect(invalidId.status).toBe(400);
    expect(invalidId.body.error.code).toBe('VALIDATION_ERROR');

    const outOfRangeId = await request(app).get(
      '/api/products/9223372036854775808',
    );
    expect(outOfRangeId.status).toBe(400);
  });

  it('filters and paginates products with combined filters', async () => {
    const products = [
      ['Mug', 'Home', 12.5],
      ['Lamp', 'Home', 42.99],
      ['Shelf', 'Home', 19.99],
      ['Bottle', 'Outdoor', 19.99],
    ] as const;
    for (const [name, category, price] of products) {
      await store.create({ name, description: null, category, price });
    }

    const response = await request(app).get(
      '/api/products?category=Home&minPrice=10&maxPrice=20&page=2&pageSize=1',
    );
    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].name).toBe('Shelf');
    expect(response.body.pagination).toEqual({
      page: 2,
      pageSize: 1,
      totalItems: 2,
      totalPages: 2,
    });

    const categoryOnly = await request(app).get(
      '/api/products?category=Outdoor',
    );
    expect(
      categoryOnly.body.data.map((product: Product) => product.name),
    ).toEqual(['Bottle']);

    const priceOnly = await request(app).get('/api/products?minPrice=40');
    expect(priceOnly.body.data.map((product: Product) => product.name)).toEqual(
      ['Lamp'],
    );
  });

  it('rejects invalid price ranges, unknown query parameters, and oversized pages', async () => {
    const invalidRange = await request(app).get(
      '/api/products?minPrice=20&maxPrice=10',
    );
    expect(invalidRange.status).toBe(400);
    expect(invalidRange.body.error.code).toBe('VALIDATION_ERROR');

    const oversizedPage = await request(app).get('/api/products?pageSize=101');
    expect(oversizedPage.status).toBe(400);

    const unknownQuery = await request(app).get('/api/products?sort=price');
    expect(unknownQuery.status).toBe(400);
  });

  it('returns empty results and validates the first-page boundary', async () => {
    const response = await request(app).get(
      '/api/products?page=1&pageSize=100',
    );
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      data: [],
      pagination: { page: 1, pageSize: 100, totalItems: 0, totalPages: 0 },
    });

    const invalidPage = await request(app).get('/api/products?page=0');
    expect(invalidPage.status).toBe(400);

    await store.create({
      name: 'Mug',
      description: null,
      category: 'Home',
      price: 12.5,
    });
    const pastLastPage = await request(app).get(
      '/api/products?page=2&pageSize=1',
    );
    expect(pastLastPage.status).toBe(200);
    expect(pastLastPage.body.data).toEqual([]);
    expect(pastLastPage.body.pagination.totalItems).toBe(1);
    expect(pastLastPage.body.pagination.totalPages).toBe(1);
  });

  it('returns a safe error response when the store fails', async () => {
    store.failCreate = true;
    const response = await request(app)
      .post('/api/products')
      .send({ name: 'Mug', category: 'Home', price: 12.5 });

    expect(response.status).toBe(500);
    expect(response.body.error).toEqual({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected error occurred',
    });
  });

  it('returns a consistent response for malformed JSON and unknown routes', async () => {
    const malformed = await request(app)
      .post('/api/products')
      .set('Content-Type', 'application/json')
      .send('{"name":');
    expect(malformed.status).toBe(400);
    expect(malformed.body.error.code).toBe('INVALID_JSON');

    const oversized = await request(app)
      .post('/api/products')
      .send({ description: 'x'.repeat(33 * 1024) });
    expect(oversized.status).toBe(413);
    expect(oversized.body.error.code).toBe('PAYLOAD_TOO_LARGE');

    const unknown = await request(app).get('/api/unknown');
    expect(unknown.status).toBe(404);
    expect(unknown.body.error.code).toBe('NOT_FOUND');
  });
});
