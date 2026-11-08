import { OrderSide } from '../../db/entities/order.entity.js';
import { Decimal, formatMoney, formatPercent, percentChange } from '../../shared/money.js';
import type { CashBalance, FilledTrade, Holding } from '../ledger/ledger.repository.js';
import type { LatestPrice } from '../market/market.repository.js';

interface InstrumentInfo {
  ticker: string | null;
  name: string | null;
}

interface PortfolioInput {
  cash: CashBalance;
  holdings: Holding[];
  trades: FilledTrade[];
  prices: Map<number, LatestPrice>;
  instruments: Map<number, InstrumentInfo>;
}

export function averageCostByInstrument(trades: FilledTrade[]): Map<number, Decimal | null> {
  const state = new Map<number, { qty: number; avg: Decimal | null }>();
  for (const trade of trades) {
    const position = state.get(trade.instrumentId) ?? { qty: 0, avg: null };
    if (trade.side === OrderSide.BUY) {
      const newQty = position.qty + trade.size;
      position.avg =
        position.qty > 0 && position.avg !== null
          ? position.avg.times(position.qty).plus(trade.price.times(trade.size)).div(newQty)
          : newQty > 0
            ? trade.price
            : null;
      position.qty = newQty;
    } else {
      position.qty -= trade.size;
      if (position.qty <= 0) position.avg = null;
    }
    state.set(trade.instrumentId, position);
  }
  return new Map([...state].map(([id, position]) => [id, position.avg]));
}

function valuePosition(holding: Holding, price: LatestPrice | null, averageCost: Decimal | null) {
  const marketValue = price ? price.close.times(holding.quantity) : null;
  const hasCostBasis = averageCost !== null && holding.quantity > 0;

  const totalReturnAmount =
    hasCostBasis && marketValue !== null ? marketValue.minus(averageCost.times(holding.quantity)) : null;
  const totalReturnPercent = hasCostBasis && price ? percentChange(averageCost, price.close) : null;

  const dailyReturnAmount =
    price && price.previousClose !== null ? price.close.minus(price.previousClose).times(holding.quantity) : null;
  const dailyReturnPercent = price ? percentChange(price.previousClose, price.close) : null;

  return {
    marketValue,
    totalReturn: { amount: formatMoney(totalReturnAmount), percent: formatPercent(totalReturnPercent) },
    dailyReturn: { amount: formatMoney(dailyReturnAmount), percent: formatPercent(dailyReturnPercent) },
  };
}

export function buildPortfolio({ cash, holdings, trades, prices, instruments }: PortfolioInput) {
  const avgCosts = averageCostByInstrument(trades);

  const valuedPositions = holdings
    .filter((holding) => holding.quantity !== 0)
    .map((holding) => {
      const price = prices.get(holding.instrumentId) ?? null;
      const averageCost = avgCosts.get(holding.instrumentId) ?? null;
      const info = instruments.get(holding.instrumentId);
      const { marketValue, totalReturn, dailyReturn } = valuePosition(holding, price, averageCost);
      return {
        marketValue,
        position: {
          instrumentId: holding.instrumentId,
          ticker: info?.ticker ?? null,
          name: info?.name ?? null,
          quantity: holding.quantity,
          availableQuantity: holding.availableQuantity,
          lastPrice: formatMoney(price?.close ?? null),
          priceDate: price?.date ?? null,
          marketValue: formatMoney(marketValue),
          averageCost: formatMoney(averageCost),
          totalReturn,
          dailyReturn,
        },
      };
    })
    .sort((a, b) => (a.position.ticker ?? '').localeCompare(b.position.ticker ?? ''));

  const positionsValue = valuedPositions.reduce(
    (sum, { marketValue }) => (marketValue === null ? sum : sum.plus(marketValue)),
    new Decimal(0),
  );

  return {
    totalValue: formatMoney(cash.balance.plus(positionsValue)),
    availableCash: formatMoney(cash.available),
    reservedCash: formatMoney(cash.reserved),
    cashBalance: formatMoney(cash.balance),
    positionsValue: formatMoney(positionsValue),
    positions: valuedPositions.map(({ position }) => position),
  };
}
