import { Router } from 'express';
import type { DataSource } from 'typeorm';

export function healthRoutes(dataSource: DataSource): Router {
  return Router().get('/', async (req, res) => {
    try {
      await dataSource.query('SELECT 1');
      res.json({ status: 'ok' });
    } catch (err) {
      req.log.error({ err }, 'Health check: la base no responde');
      res.status(503).json({ status: 'unavailable' });
    }
  });
}
