export interface Product {
  id: string;
  name: string;
  description: string | null;
  category: string;
  price: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProductInput {
  name: string;
  description: string | null;
  category: string;
  price: number;
}

export interface ProductFilters {
  category?: string;
  minPrice?: number;
  maxPrice?: number;
}

export interface ListProductsOptions extends ProductFilters {
  page: number;
  pageSize: number;
}

export interface ProductPage {
  data: Product[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
}

export interface ProductStore {
  create(input: ProductInput): Promise<Product>;
  findById(id: string): Promise<Product | undefined>;
  update(id: string, input: ProductInput): Promise<Product | undefined>;
  delete(id: string): Promise<boolean>;
  list(options: ListProductsOptions): Promise<ProductPage>;
}
