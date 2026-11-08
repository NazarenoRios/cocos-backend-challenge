import type { DataSource } from 'typeorm';
import { AppError } from '../../shared/errors.js';
import { findInstrumentsByIds } from '../instruments/instruments.repository.js';
import { getCashBalance, getFilledTrades, getHoldings } from '../ledger/ledger.repository.js';
import { getLatestPrices } from '../market/market.repository.js';
import { findUser } from '../users/users.repository.js';
import { buildPortfolio } from './portfolio.calculator.js';

export class PortfolioService {
  constructor(private readonly dataSource: DataSource) {}

  async getPortfolio(userId: number) {
    return this.dataSource.transaction('REPEATABLE READ', async (manager) => {
      await manager.query('SET TRANSACTION READ ONLY');
      const user = await findUser(manager, userId);
      if (!user) throw AppError.notFound(`Usuario ${userId} no encontrado`);

      const cash = await getCashBalance(manager, userId);
      const holdings = await getHoldings(manager, userId);
      const trades = await getFilledTrades(manager, userId);
      const instrumentIds = holdings.map((h) => h.instrumentId);
      const prices = await getLatestPrices(manager, instrumentIds);
      const instruments = await findInstrumentsByIds(manager, instrumentIds);

      return {
        userId: user.id,
        accountNumber: user.accountNumber,
        ...buildPortfolio({ cash, holdings, trades, prices, instruments }),
      };
    });
  }
}
