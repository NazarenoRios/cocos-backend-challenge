import type { EntityManager } from 'typeorm';
import { MarketData } from '../../db/entities/market-data.entity.js';
import { Decimal } from '../../shared/money.js';

export interface LatestPrice {
  instrumentId: number;
  close: Decimal;
  previousClose: Decimal | null;
  date: string | null;
}

export async function getLatestPrices(
  manager: EntityManager,
  instrumentIds: number[],
): Promise<Map<number, LatestPrice>> {
  if (instrumentIds.length === 0) return new Map();

  const rows = await manager
    .createQueryBuilder(MarketData, 'md')
    .distinctOn(['md.instrumentid'])
    .where('md.instrumentId IN (:...instrumentIds)', { instrumentIds })
    .andWhere('md.close IS NOT NULL')
    .orderBy('md.instrumentId', 'ASC')
    .addOrderBy('md.date', 'DESC', 'NULLS LAST')
    .addOrderBy('md.id', 'DESC')
    .getMany();

  const prices = new Map<number, LatestPrice>();
  for (const row of rows) {
    if (row.close === null) continue;
    prices.set(row.instrumentId, {
      instrumentId: row.instrumentId,
      close: new Decimal(row.close),
      previousClose: row.previousClose === null ? null : new Decimal(row.previousClose),
      date: row.date,
    });
  }
  return prices;
}
