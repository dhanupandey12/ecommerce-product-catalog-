# Product Catalog API

A small, modular REST API for an e-commerce product catalog. It uses TypeScript, Node.js, Express, and PostgreSQL. SQL performs filtering, ordering, counting, and pagination; product rows are never loaded into application memory to filter them.

## Requirements and setup

- Node.js 22.13 or newer and npm
- Docker with Docker Compose (recommended local PostgreSQL setup), or a PostgreSQL database you can configure yourself

From a clean checkout, in PowerShell:

```powershell
Copy-Item .env.example .env
npm ci
docker compose up -d db
npm run db:migrate
npm run db:seed
npm run dev
```

The included `.env.example` values match the Compose defaults. They are local development placeholders, not production credentials. To use an existing PostgreSQL instance, edit `DATABASE_URL` in `.env`. The application does not create its database or run migrations automatically; create the database first, then explicitly run `npm run db:migrate`.

The seed command inserts five sample products and can be run more than once. It avoids adding another seed row with the same name and category.

## Commands

| Command                    | Purpose                                             |
| -------------------------- | --------------------------------------------------- |
| `npm run dev`              | Run the API in watch mode                           |
| `npm run build`            | Compile strict TypeScript into `dist/`              |
| `npm start`                | Run the compiled server                             |
| `npm run typecheck`        | Type-check without emitting files                   |
| `npm run lint`             | Run ESLint                                          |
| `npm run format:check`     | Check Prettier formatting                           |
| `npm test`                 | Run unit tests and PostgreSQL tests when configured |
| `npm run test:unit`        | Run API and validation tests without PostgreSQL     |
| `npm run test:integration` | Run repository tests against PostgreSQL             |
| `npm run db:migrate`       | Apply unapplied SQL migrations                      |
| `npm run db:seed`          | Insert the sample catalog records                   |

The integration suite requires `DATABASE_URL_TEST` to point to a **disposable test database**. The test user must be allowed to create and drop schemas. Each run creates an isolated schema, applies the real migrations, and drops that schema afterward. In PowerShell, set the variable before running the suite:

```powershell
$env:DATABASE_URL_TEST = "postgresql://catalog:catalog_dev_password@localhost:5432/catalog_test"
npm run test:integration
```

When `DATABASE_URL_TEST` is unset, these integration tests are skipped; they are not evidence that PostgreSQL behavior was verified. `npm test` still runs all non-database tests.

## API

All routes use the `/api/products` base path. Successful product responses include `id` as a string (to preserve PostgreSQL `BIGINT` IDs in JavaScript), `price` as a JSON number, and ISO-8601 timestamps. `description` may be `null`.

### Create a product

`POST /api/products` returns `201 Created` and a `Location` header.

```powershell
curl.exe -i -X POST http://localhost:3000/api/products -H "Content-Type: application/json" -d '{"name":"Ceramic mug","description":"Stoneware","category":"Home","price":12.50}'
```

Example response:

```json
{
  "id": "1",
  "name": "Ceramic mug",
  "description": "Stoneware",
  "category": "Home",
  "price": 12.5,
  "createdAt": "2026-10-20T12:00:00.000Z",
  "updatedAt": "2026-10-20T12:00:00.000Z"
}
```

`name` and `category` are trimmed, non-empty strings (up to 200 and 100 characters). `description` is optional, nullable, and limited to 10,000 characters. `price` is a non-negative number with at most two decimal places and a maximum of `9999999999.99`. `PUT` replaces all mutable product fields; it uses the same body shape, with `description` optional (omitting it clears the description).

### Retrieve a product

`GET /api/products/:id` returns `200 OK`, or `404 Not Found` if the well-formed ID does not exist.

```powershell
curl.exe -i http://localhost:3000/api/products/1
```

### Update a product

`PUT /api/products/:id` returns `200 OK`, or `404 Not Found`. All mutable fields are replaced.

```powershell
curl.exe -i -X PUT http://localhost:3000/api/products/1 -H "Content-Type: application/json" -d '{"name":"Large ceramic mug","description":"Updated size","category":"Home","price":15.00}'
```

### Delete a product

`DELETE /api/products/:id` returns `204 No Content`, or `404 Not Found`.

```powershell
curl.exe -i -X DELETE http://localhost:3000/api/products/1
```

### List, filter, and paginate

`GET /api/products` returns `{ "data": [...], "pagination": { "page", "pageSize", "totalItems", "totalPages" } }`.

- `page`: one-based positive integer; default `1`
- `pageSize`: positive integer from `1` to `100`; default `20`
- `category`: exact category match
- `minPrice`, `maxPrice`: inclusive numeric bounds with up to two decimal places
- Filters can be combined. Unknown query parameters and `minPrice > maxPrice` are rejected with `400`.

```powershell
curl.exe -i "http://localhost:3000/api/products?page=1&pageSize=20"
curl.exe -i "http://localhost:3000/api/products?category=Home"
curl.exe -i "http://localhost:3000/api/products?minPrice=10&maxPrice=50"
curl.exe -i "http://localhost:3000/api/products?category=Home&minPrice=10&maxPrice=50&page=2&pageSize=10"
```

Products are sorted by ascending `id`, which makes the order deterministic for a given database state. Pagination uses offset/limit and a separate count query; concurrent writes can make the count and page reflect slightly different instants. Deep offsets require the database to walk past skipped rows. Offset pagination is simple and adequate for the assignment's catalog size and page-number UX; if measurements show deep-page latency is a problem, keyset pagination using the last-seen ID is the next option, with the trade-off that arbitrary page-number jumps are no longer supported.

### Errors

Errors use one JSON shape. Validation errors (including malformed IDs and JSON) return `400`; missing products and routes return `404`; oversized request bodies return `413`; unexpected database or server failures return a generic `500` response and are logged server-side.

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": [
      {
        "code": "too_small",
        "path": ["name"],
        "message": "String must contain at least 1 character(s)"
      }
    ]
  }
}
```

## Design

- **Separation:** Express routes handle HTTP and validation; `ProductService` owns not-found behavior; `ProductRepository` owns parameterized SQL; the migration runner applies versioned SQL separately from server startup.
- **Money and IDs:** PostgreSQL stores money as `NUMERIC(12,2)` for exact decimal persistence. The JSON API accepts and emits a number for ergonomic clients; the application does not perform arithmetic on prices. Clients doing financial calculations should use integer minor units or a decimal library. `BIGINT` IDs are serialized as strings to avoid JavaScript integer precision loss.
- **Currency assumption:** A deployment uses one catalog-wide currency, which is not stored on each product. Multi-currency catalogs need an explicit currency field and currency-aware price filters.
- **Indexes:** The primary key supports ID lookups and stable ordering. A B-tree on `category` supports exact category filters; a B-tree on `price` supports inclusive price ranges. PostgreSQL can combine indexes for filters. No speculative composite index is added: verify query plans and representative filter distributions before adding one.
- **Scale:** A few hundred thousand rows are a reasonable starting point for PostgreSQL with these indexed filters and bounded result pages; this is a design expectation, not a benchmark claim. Before scaling further, measure p95/p99 list latency at realistic filter selectivity and offsets, `EXPLAIN (ANALYZE, BUFFERS)` plans, index size/write overhead, connection-pool wait time, CPU, I/O, and count-query cost.
- **No cache:** Reads dominate, but no cache is warranted without workload measurements. Avoiding a cache also avoids stale product data and invalidation complexity.
- **Consistency:** Each create, update, and delete is one SQL statement. Update sets `updated_at` in the database. List rows and count use separate statements without a repeatable-read transaction; concurrent writes may cause small metadata inconsistencies, while each statement itself remains consistent.

## Limitations

- There is no authentication, authorization, rate limiting, or API versioning; add these before exposing the service publicly.
- Offset pagination can become expensive for very deep pages; keyset pagination is a measured follow-up, not implemented.
- The list count and data query are not a single snapshot during concurrent writes.
- Concurrent product updates are last-write-wins; optimistic concurrency controls such as ETags are not included.
- The API accepts a JSON number for price, so consumers requiring exact arithmetic should parse it as decimal or use integer minor units.
