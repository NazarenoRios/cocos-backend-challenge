import { Router } from 'express';
import type { InstrumentsController } from './instruments.controller.js';

export function instrumentsRoutes(controller: InstrumentsController): Router {
  return Router().get('/search', controller.searchInstruments);
}
