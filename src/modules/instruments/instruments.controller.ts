import type { Request, Response } from 'express';
import { searchQuerySchema } from './instruments.schemas.js';
import type { InstrumentsService } from './instruments.service.js';

export class InstrumentsController {
  constructor(private readonly service: InstrumentsService) {}

  searchInstruments = async (req: Request, res: Response) => {
    const filters = searchQuerySchema.parse(req.query);
    res.json(await this.service.searchInstruments(filters));
  };
}
