import type { Request, Response } from 'express';
import { idParamSchema } from '../../shared/validation.js';
import type { PortfolioService } from './portfolio.service.js';

export class PortfolioController {
  constructor(private readonly service: PortfolioService) {}

  getPortfolio = async (req: Request, res: Response) => {
    const userId = idParamSchema.parse(req.params.userId);
    res.json(await this.service.getPortfolio(userId));
  };
}
