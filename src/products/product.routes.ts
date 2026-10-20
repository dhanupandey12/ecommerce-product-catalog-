import { Router } from 'express';
import { ProductService } from './product.service.js';
import {
  parseListOptions,
  parseProductId,
  parseProductInput,
} from './product.validation.js';

export function createProductRouter(service: ProductService): Router {
  const router = Router();

  router.post('/', async (request, response) => {
    const product = await service.create(parseProductInput(request.body));
    response.location(`/api/products/${product.id}`).status(201).json(product);
  });

  router.get('/', async (request, response) => {
    const page = await service.list(parseListOptions(request.query));
    response.json(page);
  });

  router.get('/:id', async (request, response) => {
    const product = await service.get(parseProductId(request.params.id));
    response.json(product);
  });

  router.put('/:id', async (request, response) => {
    const product = await service.update(
      parseProductId(request.params.id),
      parseProductInput(request.body),
    );
    response.json(product);
  });

  router.delete('/:id', async (request, response) => {
    await service.delete(parseProductId(request.params.id));
    response.status(204).end();
  });

  return router;
}
