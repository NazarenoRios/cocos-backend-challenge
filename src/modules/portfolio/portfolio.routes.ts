import { Router } from 'express';
import type { PortfolioController } from './portfolio.controller.js';

export function portfolioRoutes(controller: PortfolioController): Router {
  return Router().get('/:userId/portfolio', controller.getPortfolio);
}
