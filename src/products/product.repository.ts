import type { Pool, QueryResultRow } from 'pg';
import type {
  ListProductsOptions,
  Product,
  ProductInput,
  ProductPage,
  ProductStore,
} from './product.types.js';

interface ProductRow extends QueryResultRow {
  id: string;
  name: string;
  description: string | null;
  category: string;
  price: string;
  created_at: Date;
  updated_at: Date;
}

function toProduct(row: ProductRow): Product {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    category: row.category,
    price: Number(row.price),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class ProductRepository implements ProductStore {
  constructor(private readonly pool: Pool) {}

  async create(input: ProductInput): Promise<Product> {
    const result = await this.pool.query<ProductRow>(
      `INSERT INTO products (name, description, category, price)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, description, category, price, created_at, updated_at`,
      [input.name, input.description, input.category, input.price],
    );
    const row = result.rows[0];
    if (!row) {
      throw new Error('Product insert returned no row');
    }
    return toProduct(row);
  }

  async findById(id: string): Promise<Product | undefined> {
    const result = await this.pool.query<ProductRow>(
      `SELECT id, name, description, category, price, created_at, updated_at
       FROM products WHERE id = $1`,
      [id],
    );
    const row = result.rows[0];
    return row ? toProduct(row) : undefined;
  }

  async update(id: string, input: ProductInput): Promise<Product | undefined> {
    const result = await this.pool.query<ProductRow>(
      `UPDATE products
       SET name = $2, description = $3, category = $4, price = $5, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING id, name, description, category, price, created_at, updated_at`,
      [id, input.name, input.description, input.category, input.price],
    );
    const row = result.rows[0];
    return row ? toProduct(row) : undefined;
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.pool.query('DELETE FROM products WHERE id = $1', [
      id,
    ]);
    return result.rowCount === 1;
  }

  async list(options: ListProductsOptions): Promise<ProductPage> {
    const conditions: string[] = [];
    const values: (string | number)[] = [];

    if (options.category !== undefined) {
      values.push(options.category);
      conditions.push(`category = $${values.length}`);
    }
    if (options.minPrice !== undefined) {
      values.push(options.minPrice);
      conditions.push(`price >= $${values.length}`);
    }
    if (options.maxPrice !== undefined) {
      values.push(options.maxPrice);
      conditions.push(`price <= $${values.length}`);
    }

    const where =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const countResult = await this.pool.query<{ total: string }>(
      `SELECT COUNT(*)::text AS total FROM products ${where}`,
      values,
    );
    const totalItems = Number(countResult.rows[0]?.total ?? '0');
    const offset = (options.page - 1) * options.pageSize;
    const pageValues = [...values, options.pageSize, offset];
    const result = await this.pool.query<ProductRow>(
      `SELECT id, name, description, category, price, created_at, updated_at
       FROM products ${where}
       ORDER BY id ASC
       LIMIT $${pageValues.length - 1} OFFSET $${pageValues.length}`,
      pageValues,
    );

    return {
      data: result.rows.map(toProduct),
      pagination: {
        page: options.page,
        pageSize: options.pageSize,
        totalItems,
        totalPages: Math.ceil(totalItems / options.pageSize),
      },
    };
  }
}
