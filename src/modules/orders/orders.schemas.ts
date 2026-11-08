import { z } from 'zod';
import { OrderSide, OrderType } from '../../db/entities/order.entity.js';
import { decimalAmountSchema, idSchema, PG_INT_MAX } from '../../shared/validation.js';

const PRICE_MAX = '99999999.99';
const AMOUNT_MAX = '1000000000000';

export type Quantity = { size: number } | { amount: string };

export interface TradeBase {
  kind: 'trade';
  userId: number;
  instrumentId: number;
  side: typeof OrderSide.BUY | typeof OrderSide.SELL;
  quantity: Quantity;
}

export type PlaceOrderCommand =
  | (TradeBase & { type: typeof OrderType.MARKET })
  | (TradeBase & { type: typeof OrderType.LIMIT; price: string })
  | {
      kind: 'transfer';
      userId: number;
      instrumentId: number | undefined;
      side: typeof OrderSide.CASH_IN | typeof OrderSide.CASH_OUT;
      amount: number;
    };

const orderRequestSchema = z
  .object({
    userId: idSchema,
    instrumentId: idSchema.optional(),
    side: z.enum([OrderSide.BUY, OrderSide.SELL, OrderSide.CASH_IN, OrderSide.CASH_OUT]),
    type: z.enum([OrderType.MARKET, OrderType.LIMIT]),
    size: z.number().int().positive().max(PG_INT_MAX).optional(),
    amount: decimalAmountSchema(AMOUNT_MAX).optional(),
    price: decimalAmountSchema(PRICE_MAX).optional(),
  })
  .strict();

export const placeOrderSchema = orderRequestSchema.transform((input, ctx): PlaceOrderCommand => {
  const issues: { path: string; message: string }[] = [];
  const addIssue = (path: string, message: string) => issues.push({ path, message });
  const rejectWithIssues = () => {
    for (const issue of issues) ctx.addIssue({ code: 'custom', path: [issue.path], message: issue.message });
    return z.NEVER;
  };

  const quantity: Quantity | null =
    input.size !== undefined && input.amount === undefined
      ? { size: input.size }
      : input.amount !== undefined && input.size === undefined
        ? { amount: input.amount }
        : null;
  if (!quantity) addIssue('size', 'Enviá exactamente uno de `size` (unidades) o `amount` (monto en pesos)');
  if (input.type === OrderType.MARKET && input.price !== undefined) {
    addIssue('price', 'Las órdenes MARKET no aceptan `price`: se ejecutan al último precio de mercado');
  }

  if (input.side === OrderSide.CASH_IN || input.side === OrderSide.CASH_OUT) {
    if (input.type !== OrderType.MARKET) addIssue('type', 'Las transferencias (CASH_IN/CASH_OUT) son siempre MARKET');
    if (input.amount !== undefined && !/^\d+$/.test(input.amount)) {
      addIssue('amount', 'Las transferencias se registran en pesos enteros');
    } else if (input.amount !== undefined && Number(input.amount) > PG_INT_MAX) {
      addIssue('amount', `Debe ser menor o igual a ${PG_INT_MAX}`);
    }
    if (issues.length > 0 || !quantity) return rejectWithIssues();
    const amount = 'size' in quantity ? quantity.size : Number(quantity.amount);
    return { kind: 'transfer', userId: input.userId, instrumentId: input.instrumentId, side: input.side, amount };
  }

  if (input.instrumentId === undefined) addIssue('instrumentId', 'Las órdenes BUY/SELL requieren `instrumentId`');
  if (input.type === OrderType.LIMIT && input.price === undefined)
    addIssue('price', 'Las órdenes LIMIT requieren `price`');
  if (issues.length > 0 || !quantity || input.instrumentId === undefined) return rejectWithIssues();

  const base: TradeBase = {
    kind: 'trade',
    userId: input.userId,
    instrumentId: input.instrumentId,
    side: input.side,
    quantity,
  };
  if (input.type === OrderType.LIMIT) {
    return input.price === undefined ? rejectWithIssues() : { ...base, type: OrderType.LIMIT, price: input.price };
  }
  return { ...base, type: OrderType.MARKET };
});
