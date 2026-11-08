import { z } from 'zod';

const term = z.string().trim().min(1).max(100).optional();

export const searchQuerySchema = z
  .object({
    q: term,
    ticker: term,
    name: term,
    limit: z.coerce.number().int().min(1).max(50).default(20),
    offset: z.coerce.number().int().min(0).max(10_000).default(0),
  })
  .refine((v) => v.q || v.ticker || v.name, {
    message: 'Enviá al menos uno de `q`, `ticker` o `name`',
    path: ['q'],
  });
