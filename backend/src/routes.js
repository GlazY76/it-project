import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import swaggerUi from 'swagger-ui-express';
import YAML from 'yaml';
import { BACKEND_ROOT } from './config.js';
import { currentVersion } from './db/migrate.js';
import { notFoundHandler } from './middleware/error-handler.js';
import { createAuthRouter } from './modules/auth/auth.routes.js';
import { createBooksAdminRouter } from './modules/books/books.admin.routes.js';
import { createBooksRouter } from './modules/books/books.routes.js';
import { createCartRouter } from './modules/cart/cart.routes.js';
import { createCategoriesAdminRouter } from './modules/categories/categories.admin.routes.js';
import { createCategoriesRouter } from './modules/categories/categories.routes.js';
import { createOrdersAdminRouter } from './modules/orders/orders.admin.routes.js';
import { createOrdersRouter } from './modules/orders/orders.routes.js';
import { createUsersRouter } from './modules/users/users.routes.js';

const openApiSpec = YAML.parse(
  fs.readFileSync(path.join(BACKEND_ROOT, 'docs/openapi.yaml'), 'utf8'),
);

/** Everything under /api. */
export function createApiRouter({ db, services, auth, config }) {
  const router = Router();

  router.get('/health', (_req, res) => {
    res.json({ status: 'ok', schemaVersion: currentVersion(db) });
  });

  router.get('/openapi.json', (_req, res) => {
    res.json(openApiSpec);
  });
  router.use(
    '/docs',
    swaggerUi.serve,
    swaggerUi.setup(openApiSpec, { customSiteTitle: 'CodeShelf API' }),
  );

  router.use('/auth', createAuthRouter({ ...services, auth, config }));
  router.use('/users', auth.requireAuth, createUsersRouter(services));
  router.use('/books', createBooksRouter(services));
  router.use('/categories', createCategoriesRouter(services));
  router.use('/cart', auth.requireAuth, createCartRouter(services));
  router.use('/orders', auth.requireAuth, createOrdersRouter(services, config));

  const admin = Router();
  admin.use(auth.requireAuth, auth.requireAdmin);
  admin.use('/books', createBooksAdminRouter(services));
  admin.use('/categories', createCategoriesAdminRouter(services));
  admin.use('/orders', createOrdersAdminRouter(services));
  router.use('/admin', admin);

  router.use(notFoundHandler);
  return router;
}
