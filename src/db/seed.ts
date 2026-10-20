import { fileURLToPath } from 'node:url';
import { createPool } from './pool.js';

const products: Array<[string, string, string, number]> = [
  ['Everyday Ceramic Mug', 'A stoneware mug for daily use.', 'Home', 12.5],
  ['Canvas Tote', 'Reusable cotton canvas shopping bag.', 'Accessories', 18],
  ['Desk Lamp', 'Adjustable LED desk lamp.', 'Home', 42.99],
  ['Trail Water Bottle', 'Insulated stainless-steel bottle.', 'Outdoor', 29.95],
  ['Wireless Keyboard', 'Compact Bluetooth keyboard.', 'Electronics', 64.5],
];

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const pool = createPool();
  try {
    for (const [name, description, category, price] of products) {
      await pool.query(
        `INSERT INTO products (name, description, category, price)
         SELECT $1, $2, $3, $4
         WHERE NOT EXISTS (
           SELECT 1 FROM products WHERE name = $1 AND category = $3
         )`,
        [name, description, category, price],
      );
    }
    console.info('Seed products are present.');
  } finally {
    await pool.end();
  }
}
