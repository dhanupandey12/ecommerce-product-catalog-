import express, { type ErrorRequestHandler } from 'express';
import { pinoHttp } from 'pino-http';
import type { Logger } from 'pino';
import { AppError, NotFoundError } from './errors.js';
import { createProductRouter } from './products/product.routes.js';
import { ProductService } from './products/product.service.js';

export function createApp(service: ProductService, logger: Logger) {
  const app = express();

  app.use(pinoHttp({ logger }));
  app.use(express.json({ limit: '32kb' }));
  app.use('/api/products', createProductRouter(service));
  app.use((_request, _response, next) =>
    next(new NotFoundError('Route not found')),
  );

  const errorHandler: ErrorRequestHandler = (
    error: unknown,
    request,
    response,
    _next,
  ) => {
    if (error instanceof AppError) {
      response.status(error.statusCode).json({
        error: {
          code: error.code,
          message: error.message,
          ...(error.details === undefined ? {} : { details: error.details }),
        },
      });
      return;
    }

    if (isBodyParserError(error)) {
      const statusCode = error.status === 413 ? 413 : 400;
      response.status(statusCode).json({
        error: {
          code: statusCode === 413 ? 'PAYLOAD_TOO_LARGE' : 'INVALID_JSON',
          message:
            statusCode === 413
              ? 'Request body is too large'
              : 'Malformed JSON request body',
        },
      });
      return;
    }

    request.log.error({ err: error }, 'Unhandled request error');
    response.status(500).json({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An unexpected error occurred',
      },
    });
  };

  app.use(errorHandler);
  return app;
}

function isBodyParserError(
  error: unknown,
): error is { status: number; type?: string } {
  if (
    typeof error !== 'object' ||
    error === null ||
    !('status' in error) ||
    !('type' in error)
  ) {
    return false;
  }

  return (
    (error.status === 400 && error.type === 'entity.parse.failed') ||
    (error.status === 413 && error.type === 'entity.too.large')
  );
}
