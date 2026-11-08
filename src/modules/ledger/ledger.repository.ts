import type { EntityManager } from 'typeorm';
import { Order, OrderSide, OrderStatus } from '../../db/entities/order.entity.js';
import { Decimal } from '../../shared/money.js';

export interface CashBalance {
  balance: Decimal;
  reserved: Decimal;
  available: Decimal;
}

export interface Holding {
  instrumentId: number;
  quantity: number;
  reservedQuantity: number;
  availableQuantity: number;
}

export interface FilledTrade {
  instrumentId: number;
  side: typeof OrderSide.BUY | typeof OrderSide.SELL;
  size: number;
  price: Decimal;
}

const LEDGER_PARAMS = {
  filled: OrderStatus.FILLED,
  pending: OrderStatus.NEW,
  buy: OrderSide.BUY,
  sell: OrderSide.SELL,
  cashIn: OrderSide.CASH_IN,
  cashOut: OrderSide.CASH_OUT,
};

export async function getCashBalance(manager: EntityManager, userId: number): Promise<CashBalance> {
  const row = await manager
    .createQueryBuilder(Order, 'o')
    .select(
      `COALESCE(SUM(CASE o.side
          WHEN :cashIn  THEN o.size
          WHEN :cashOut THEN -o.size
          WHEN :buy     THEN -(o.size * o.price)
          WHEN :sell    THEN o.size * o.price
        END) FILTER (WHERE o.status = :filled), 0)`,
      'balance',
    )
    .addSelect(`COALESCE(SUM(o.size * o.price) FILTER (WHERE o.status = :pending AND o.side = :buy), 0)`, 'reserved')
    .where('o.userId = :userId', { userId })
    .andWhere('o.status IN (:filled, :pending)')
    .setParameters(LEDGER_PARAMS)
    .getRawOne<{ balance: string; reserved: string }>();

  const balance = new Decimal(row?.balance ?? 0);
  const reserved = new Decimal(row?.reserved ?? 0);
  return { balance, reserved, available: balance.minus(reserved) };
}

export async function getHoldings(manager: EntityManager, userId: number, instrumentId?: number): Promise<Holding[]> {
  const qb = manager
    .createQueryBuilder(Order, 'o')
    .select('o.instrumentId', 'instrumentId')
    .addSelect(
      `COALESCE(SUM(CASE o.side WHEN :buy THEN o.size ELSE -o.size END) FILTER (WHERE o.status = :filled), 0)`,
      'quantity',
    )
    .addSelect(`COALESCE(SUM(o.size) FILTER (WHERE o.status = :pending AND o.side = :sell), 0)`, 'reservedQuantity')
    .where('o.userId = :userId', { userId })
    .andWhere('o.side IN (:buy, :sell)')
    .andWhere('o.status IN (:filled, :pending)')
    .setParameters(LEDGER_PARAMS);
  if (instrumentId !== undefined) qb.andWhere('o.instrumentId = :instrumentId', { instrumentId });

  const rows = await qb
    .groupBy('o.instrumentId')
    .orderBy('o.instrumentId')
    .getRawMany<{ instrumentId: number; quantity: string; reservedQuantity: string }>();

  return rows.map((row) => {
    const quantity = Number(row.quantity);
    const reservedQuantity = Number(row.reservedQuantity);
    return {
      instrumentId: Number(row.instrumentId),
      quantity,
      reservedQuantity,
      availableQuantity: quantity - reservedQuantity,
    };
  });
}

export async function getFilledTrades(manager: EntityManager, userId: number): Promise<FilledTrade[]> {
  const orders = await manager
    .createQueryBuilder(Order, 'o')
    .select(['o.instrumentId', 'o.side', 'o.size', 'o.price'])
    .where('o.userId = :userId', { userId })
    .andWhere('o.status = :filled')
    .andWhere('o.side IN (:buy, :sell)')
    .setParameters(LEDGER_PARAMS)
    .orderBy('o.datetime', 'ASC')
    .addOrderBy('o.id', 'ASC')
    .getMany();

  return orders.flatMap((order) =>
    (order.side === OrderSide.BUY || order.side === OrderSide.SELL) && order.price !== null
      ? [{ instrumentId: order.instrumentId, side: order.side, size: order.size, price: new Decimal(order.price) }]
      : [],
  );
}
