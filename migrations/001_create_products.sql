CREATE TABLE products (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name VARCHAR(200) NOT NULL CHECK (length(btrim(name)) > 0),
  description TEXT,
  category VARCHAR(100) NOT NULL CHECK (length(btrim(category)) > 0),
  price NUMERIC(12, 2) NOT NULL CHECK (price >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX products_category_idx ON products (category);
CREATE INDEX products_price_idx ON products (price);
