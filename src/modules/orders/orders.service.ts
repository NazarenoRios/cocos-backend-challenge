import type { DataSource, EntityManager } from 'typeorm';
import { type Instrument, InstrumentType } from '../../db/entities/instrument.entity.js';
import { type Order, OrderSide, OrderStatus, OrderType } from '../../db/entities/order.entity.js';
import { AppError } from '../../shared/errors.js';
import { Decimal, formatMoney } from '../../shared/money.js';
import { PG_INT_MAX } from '../../shared/validation.js';
import { findCashInstrument, findInstrument } from '../instruments/instruments.repository.js';
import { getCashBalance, getHoldings } from '../ledger/ledger.repository.js';
import { getLatestPrices } from '../market/market.repository.js';
import { lockUser } from '../users/users.repository.js';
import { findOrder, findOrderForUpdate, insertOrder, markOrderCancelled } from './orders.repository.js';
import type { PlaceOrderCommand, Quantity } from './orders.schemas.js';
import { unitsForAmount } from './orders.sizing.js';

type RejectReason = 'INSUFFICIENT_FUNDS' | 'INSUFFICIENT_HOLDINGS';

interface OrderDraft {
  instrument: Instrument;
  side: OrderSide;
  type: OrderType;
  size: number;
  price: Decimal;
}

type TradeCommand = Extract<PlaceOrderCommand, { kind: 'trade' }>;
type TransferCommand = Extract<PlaceOrderCommand, { kind: 'transfer' }>;

export class OrdersService {
  constructor(private readonly dataSource: DataSource) {}

  async placeOrder(command: PlaceOrderCommand) {
    return this.dataSource.transaction(async (manager) => {
      await this.lockUserOrFail(manager, command.userId);

      const draft =
        command.kind === 'transfer'
          ? await this.draftTransfer(manager, command)
          : await this.draftTrade(manager, command);

      const rejectReason = await this.checkAvailability(manager, command.userId, draft);

      const order = await insertOrder(manager, {
        userId: command.userId,
        instrumentId: draft.instrument.id,
        side: draft.side,
        type: draft.type,
        size: draft.size,
        price: draft.price.toFixed(2),
        status: resolveStatus(draft.type, rejectReason),
      });
      return toOrderResponse(order, draft.instrument, rejectReason);
    });
  }

  async cancelOrder(orderId: number) {
    return this.dataSource.transaction(async (manager) => {
      const existing = await findOrder(manager, orderId);
      if (!existing) throw AppError.notFound(`Orden ${orderId} no encontrada`);

      await this.lockUserOrFail(manager, existing.userId);
      const order = await findOrderForUpdate(manager, orderId);
      if (order.status !== OrderStatus.NEW) {
        throw AppError.conflict(`Solo se pueden cancelar órdenes NEW (estado actual: ${order.status})`);
      }

      await markOrderCancelled(manager, orderId);
      const instrument = await findInstrument(manager, order.instrumentId);
      return toOrderResponse({ ...order, status: OrderStatus.CANCELLED }, instrument);
    });
  }

  private async lockUserOrFail(manager: EntityManager, userId: number): Promise<void> {
    if (!(await lockUser(manager, userId))) throw AppError.notFound(`Usuario ${userId} no encontrado`);
  }

  private async draftTransfer(manager: EntityManager, command: TransferCommand): Promise<OrderDraft> {
    const instrument = await findCashInstrument(manager);
    if (!instrument) throw new Error('No existe el instrumento de efectivo (ARS / MONEDA) en la base');
    if (command.instrumentId !== undefined && command.instrumentId !== instrument.id) {
      throw AppError.unprocessable(`Las transferencias se registran sobre el instrumento ARS (id ${instrument.id})`);
    }
    return { instrument, side: command.side, type: OrderType.MARKET, size: command.amount, price: new Decimal(1) };
  }

  private async draftTrade(manager: EntityManager, command: TradeCommand): Promise<OrderDraft> {
    const instrument = await findInstrument(manager, command.instrumentId);
    if (!instrument) throw AppError.notFound(`Instrumento ${command.instrumentId} no encontrado`);
    if (instrument.type === InstrumentType.CURRENCY) {
      throw AppError.unprocessable('Los pesos no se compran ni venden: usá CASH_IN / CASH_OUT');
    }

    const price =
      command.type === OrderType.LIMIT ? new Decimal(command.price) : await this.getMarketPrice(manager, instrument.id);
    return {
      instrument,
      side: command.side,
      type: command.type,
      size: this.resolveSize(command.quantity, price),
      price,
    };
  }

  private async getMarketPrice(manager: EntityManager, instrumentId: number): Promise<Decimal> {
    const latest = (await getLatestPrices(manager, [instrumentId])).get(instrumentId);
    if (!latest) {
      throw AppError.unprocessable(
        `No hay precio de mercado para el instrumento ${instrumentId}: no se puede ejecutar una orden MARKET`,
      );
    }
    return latest.close;
  }

  private resolveSize(quantity: Quantity, price: Decimal): number {
    if ('size' in quantity) return quantity.size;

    const size = unitsForAmount(new Decimal(quantity.amount), price);
    if (size < 1) {
      throw AppError.unprocessable(`El monto ${quantity.amount} no alcanza para una unidad a $${formatMoney(price)}`, {
        amount: quantity.amount,
        price: formatMoney(price),
      });
    }
    if (size > PG_INT_MAX) throw AppError.unprocessable('La cantidad resultante excede el máximo permitido');
    return size;
  }

  private async checkAvailability(
    manager: EntityManager,
    userId: number,
    draft: OrderDraft,
  ): Promise<RejectReason | null> {
    switch (draft.side) {
      case OrderSide.CASH_IN:
        return null;
      case OrderSide.BUY:
      case OrderSide.CASH_OUT: {
        const { available } = await getCashBalance(manager, userId);
        return available.gte(draft.price.times(draft.size)) ? null : 'INSUFFICIENT_FUNDS';
      }
      case OrderSide.SELL: {
        const [holding] = await getHoldings(manager, userId, draft.instrument.id);
        return (holding?.availableQuantity ?? 0) >= draft.size ? null : 'INSUFFICIENT_HOLDINGS';
      }
    }
  }
}

function resolveStatus(type: OrderType, rejectReason: RejectReason | null): OrderStatus {
  if (rejectReason) return OrderStatus.REJECTED;
  return type === OrderType.MARKET ? OrderStatus.FILLED : OrderStatus.NEW;
}

function toOrderResponse(order: Order, instrument: Instrument | null, rejectReason?: RejectReason | null) {
  return {
    id: order.id,
    userId: order.userId,
    instrumentId: order.instrumentId,
    ticker: instrument?.ticker ?? null,
    side: order.side,
    type: order.type,
    size: order.size,
    price: order.price,
    status: order.status,
    datetime: order.datetime.toISOString(),
    ...(rejectReason ? { rejectReason } : {}),
  };
}
