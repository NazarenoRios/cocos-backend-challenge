import express from 'express';
import type { DataSource } from 'typeorm';
import { healthRoutes } from './modules/health/health.routes.js';
import { InstrumentsController } from './modules/instruments/instruments.controller.js';
import { instrumentsRoutes } from './modules/instruments/instruments.routes.js';
import { InstrumentsService } from './modules/instruments/instruments.service.js';
import { OrdersController } from './modules/orders/orders.controller.js';
import { ordersRoutes } from './modules/orders/orders.routes.js';
import { OrdersService } from './modules/orders/orders.service.js';
import { PortfolioController } from './modules/portfolio/portfolio.controller.js';
import { portfolioRoutes } from './modules/portfolio/portfolio.routes.js';
import { PortfolioService } from './modules/portfolio/portfolio.service.js';
import { errorHandler, notFoundHandler } from './shared/error-handler.js';
import { httpLogger } from './shared/http-logger.js';
import type { Logger } from './shared/logger.js';

export function createApp(dataSource: DataSource, logger: Logger) {
  const app = express();
  app.disable('x-powered-by');
  app.use(httpLogger(logger));
  app.use(express.json({ limit: '10kb' }));

  app.use('/health', healthRoutes(dataSource));
  app.use('/users', portfolioRoutes(new PortfolioController(new PortfolioService(dataSource))));
  app.use('/instruments', instrumentsRoutes(new InstrumentsController(new InstrumentsService(dataSource))));
  app.use('/orders', ordersRoutes(new OrdersController(new OrdersService(dataSource))));

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
