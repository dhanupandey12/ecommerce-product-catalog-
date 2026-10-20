import { createServer } from 'node:http';
import pino from 'pino';
import { createApp } from './app.js';
import { getConfig } from './config.js';
import { createPool } from './db/pool.js';
import { ProductRepository } from './products/product.repository.js';
import { ProductService } from './products/product.service.js';

const config = getConfig();
const logger = pino({ level: config.LOG_LEVEL });
const pool = createPool();
const app = createApp(new ProductService(new ProductRepository(pool)), logger);
const server = createServer(app);

pool.on('error', (error) =>
  logger.error({ err: error }, 'Unexpected PostgreSQL pool error'),
);

async function start(): Promise<void> {
  await pool.query('SELECT 1');
  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => {
      server.off('listening', onListening);
      reject(error);
    };
    const onListening = () => {
      server.off('error', onError);
      resolve();
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(config.PORT);
  });
  logger.info({ port: config.PORT }, 'Product catalog API is listening');
}

let isShuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (isShuttingDown) {
    return;
  }
  isShuttingDown = true;
  logger.info({ signal }, 'Shutting down');

  const forceClose = setTimeout(() => server.closeAllConnections(), 10_000);
  forceClose.unref();

  let shutdownFailed = false;
  try {
    if (server.listening) {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  } catch (error) {
    shutdownFailed = true;
    logger.error({ err: error }, 'Error closing HTTP server');
  }

  try {
    await pool.end();
  } catch (error) {
    shutdownFailed = true;
    logger.error({ err: error }, 'Error closing PostgreSQL pool');
  } finally {
    clearTimeout(forceClose);
  }

  if (shutdownFailed) {
    process.exitCode = 1;
  } else {
    logger.info('Shutdown complete');
  }
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

try {
  await start();
} catch (error) {
  logger.error({ err: error }, 'Failed to start product catalog API');
  await pool.end();
  process.exitCode = 1;
}
