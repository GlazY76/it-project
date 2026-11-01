import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import { createAuthMiddleware } from './middleware/auth.js';
import { createErrorHandler, notFoundHandler } from './middleware/error-handler.js';
import { createAuthService } from './modules/auth/auth.service.js';
import { createBooksService } from './modules/books/books.service.js';
import { createCoversService } from './modules/books/covers.service.js';
import { createCartService } from './modules/cart/cart.service.js';
import { createCategoriesService } from './modules/categories/categories.service.js';
import { createOrdersService } from './modules/orders/orders.service.js';
import { createUsersService } from './modules/users/users.service.js';
import { createApiRouter } from './routes.js';

export function createServices(db, config) {
  const usersService = createUsersService(db);
  const booksService = createBooksService(db, config);
  return {
    usersService,
    authService: createAuthService({ usersService, config }),
    booksService,
    coversService: createCoversService({ booksService, config }),
    categoriesService: createCategoriesService(db),
    cartService: createCartService(db, config),
    ordersService: createOrdersService(db, config),
  };
}

/** Builds the Express application. It has no side effects, so tests can create one per database. */
export function createApp({ db, config }) {
  const services = createServices(db, config);
  const auth = createAuthMiddleware({ usersService: services.usersService, config });

  const app = express();
  // Covers are shown by a frontend on another origin, so allow cross-origin image loading
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cors({ origin: config.corsOrigins }));
  if (config.logRequests) app.use(morgan('dev'));
  app.use(express.json({ limit: '100kb' }));

  app.use('/pictures', express.static(config.picturesDir, { index: false, maxAge: '1d' }));
  app.use('/api', createApiRouter({ db, services, auth, config }));

  app.use(notFoundHandler);
  app.use(createErrorHandler());
  return app;
}
