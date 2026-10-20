import { NotFoundError } from '../errors.js';
import type {
  ListProductsOptions,
  Product,
  ProductInput,
  ProductPage,
  ProductStore,
} from './product.types.js';

export class ProductService {
  constructor(private readonly products: ProductStore) {}

  create(input: ProductInput): Promise<Product> {
    return this.products.create(input);
  }

  async get(id: string): Promise<Product> {
    const product = await this.products.findById(id);
    if (!product) {
      throw new NotFoundError('Product not found');
    }
    return product;
  }

  async update(id: string, input: ProductInput): Promise<Product> {
    const product = await this.products.update(id, input);
    if (!product) {
      throw new NotFoundError('Product not found');
    }
    return product;
  }

  async delete(id: string): Promise<void> {
    if (!(await this.products.delete(id))) {
      throw new NotFoundError('Product not found');
    }
  }

  list(options: ListProductsOptions): Promise<ProductPage> {
    return this.products.list(options);
  }
}
