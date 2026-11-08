import type { DataSource } from 'typeorm';
import { formatMoney, formatPercent, percentChange } from '../../shared/money.js';
import { getLatestPrices } from '../market/market.repository.js';
import { findInstrumentsMatching, type SearchFilters } from './instruments.repository.js';

export class InstrumentsService {
  constructor(private readonly dataSource: DataSource) {}

  async searchInstruments(filters: SearchFilters) {
    const manager = this.dataSource.manager;
    const instruments = await findInstrumentsMatching(manager, filters);
    const prices = await getLatestPrices(
      manager,
      instruments.map((instrument) => instrument.id),
    );

    return {
      items: instruments.map((instrument) => {
        const price = prices.get(instrument.id) ?? null;
        return {
          id: instrument.id,
          ticker: instrument.ticker,
          name: instrument.name,
          type: instrument.type,
          lastPrice: formatMoney(price?.close ?? null),
          dailyReturnPercent: formatPercent(price ? percentChange(price.previousClose, price.close) : null),
        };
      }),
      limit: filters.limit,
      offset: filters.offset,
    };
  }
}
