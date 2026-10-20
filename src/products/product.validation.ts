import { z } from 'zod';
import { ValidationError } from '../errors.js';
import type { ListProductsOptions, ProductInput } from './product.types.js';

const maximumPrice = 9_999_999_999.99;
const priceSchema = z
  .number()
  .finite()
  .min(0)
  .max(maximumPrice)
  .refine((price) => Math.abs(price * 100 - Math.round(price * 100)) < 1e-8, {
    message: 'Price must have at most two decimal places',
  });

const productBodySchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    description: z.string().max(10_000).nullable().optional(),
    category: z.string().trim().min(1).max(100),
    price: priceSchema,
  })
  .strict();

const queryPriceSchema = z
  .string()
  .regex(/^\d{1,10}(?:\.\d{1,2})?$/)
  .transform(Number)
  .pipe(priceSchema);

const listQuerySchema = z
  .object({
    category: z.string().trim().min(1).max(100).optional(),
    minPrice: queryPriceSchema.optional(),
    maxPrice: queryPriceSchema.optional(),
    page: z
      .string()
      .regex(/^[1-9]\d{0,8}$/)
      .transform(Number)
      .default('1'),
    pageSize: z
      .string()
      .regex(/^[1-9]\d{0,2}$/)
      .transform(Number)
      .pipe(z.number().int().max(100))
      .default('20'),
  })
  .strict()
  .superRefine((query, context) => {
    if (
      query.minPrice !== undefined &&
      query.maxPrice !== undefined &&
      query.minPrice > query.maxPrice
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['maxPrice'],
        message: 'maxPrice must be greater than or equal to minPrice',
      });
    }
  });

const productIdSchema = z
  .string()
  .refine(
    (id) =>
      /^[1-9]\d{0,18}$/.test(id) && BigInt(id) <= 9_223_372_036_854_775_807n,
    { message: 'ID must be a positive PostgreSQL BIGINT' },
  );

function parse<Schema extends z.ZodTypeAny>(
  schema: Schema,
  value: unknown,
): z.output<Schema> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new ValidationError(result.error.issues);
  }
  return result.data;
}

export function parseProductInput(value: unknown): ProductInput {
  const input = parse(productBodySchema, value);
  return {
    ...input,
    description: input.description ?? null,
  };
}

export function parseProductId(value: unknown): string {
  return parse(productIdSchema, value);
}

export function parseListOptions(value: unknown): ListProductsOptions {
  const { category, minPrice, maxPrice, page, pageSize } = parse(
    listQuerySchema,
    value,
  );
  return {
    page,
    pageSize,
    ...(category === undefined ? {} : { category }),
    ...(minPrice === undefined ? {} : { minPrice }),
    ...(maxPrice === undefined ? {} : { maxPrice }),
  };
}
