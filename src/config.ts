import 'dotenv/config';
import { z } from 'zod';

const configSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
});

export type Config = z.infer<typeof configSchema>;

export function getConfig(
  environment: NodeJS.ProcessEnv = process.env,
): Config {
  return configSchema.parse(environment);
}
