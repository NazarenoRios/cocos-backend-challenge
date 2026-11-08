import { describe, expect, it } from 'vitest';
import { Order } from '../src/db/entities/order.entity.js';
import { countOrders, createFundedUser, SEED_INSTRUMENTS, useTestContext } from './helpers.js';

const ctx = useTestContext();

const placeOrder = (body: object) => ctx.api.post('/orders').send(body);
const getPortfolio = async (userId: number) => (await ctx.api.get(`/users/${userId}/portfolio`).expect(200)).body;
const findOrder = (id: number) => ctx.dataSource.getRepository(Order).findOneByOrFail({ id });

describe('POST /orders - MARKET', () => {
  it('compra por cantidad: queda FILLED al último close y descuenta el efectivo', async () => {
    const userId = await createFundedUser(ctx.dataSource, 100_000);

    const res = await placeOrder({
      userId,
      instrumentId: SEED_INSTRUMENTS.PAMP,
      side: 'BUY',
      type: 'MARKET',
      size: 10,
    }).expect(201);

    expect(res.body).toMatchObject({
      userId,
      instrumentId: SEED_INSTRUMENTS.PAMP,
      ticker: 'PAMP',
      side: 'BUY',
      type: 'MARKET',
      size: 10,
      price: '925.85',
      status: 'FILLED',
    });
    expect(res.headers.location).toBe(`/orders/${res.body.id}`);
    expect(Date.now() - Date.parse(res.body.datetime)).toBeLessThan(60_000);

    const stored = await findOrder(res.body.id);
    expect(stored).toMatchObject({ status: 'FILLED', size: 10, price: '925.85', side: 'BUY', type: 'MARKET' });

    const portfolio = await getPortfolio(userId);
    expect(portfolio.availableCash).toBe('90741.50');
    expect(portfolio.positions).toEqual([
      expect.objectContaining({ ticker: 'PAMP', quantity: 10, marketValue: '9258.50' }),
    ]);
  });

  it('compra por monto: calcula la máxima cantidad entera de unidades (redondeo hacia abajo)', async () => {
    const userId = await createFundedUser(ctx.dataSource, 100_000);

    const res = await placeOrder({
      userId,
      instrumentId: SEED_INSTRUMENTS.PAMP,
      side: 'BUY',
      type: 'MARKET',
      amount: '10000',
    }).expect(201);

    expect(res.body).toMatchObject({ size: 10, status: 'FILLED', price: '925.85' });
  });

  it('acepta comprar con el saldo exacto y rechaza (persistiendo REJECTED) la siguiente unidad', async () => {
    const userId = await createFundedUser(ctx.dataSource, 459);

    const exact = await placeOrder({
      userId,
      instrumentId: SEED_INSTRUMENTS.METR,
      side: 'BUY',
      type: 'MARKET',
      size: 2,
    }).expect(201);
    expect(exact.body.status).toBe('FILLED');
    expect((await getPortfolio(userId)).availableCash).toBe('0.00');

    const over = await placeOrder({
      userId,
      instrumentId: SEED_INSTRUMENTS.METR,
      side: 'BUY',
      type: 'MARKET',
      size: 1,
    }).expect(201);
    expect(over.body).toMatchObject({
      status: 'REJECTED',
      rejectReason: 'INSUFFICIENT_FUNDS',
      size: 1,
      price: '229.50',
    });
    expect((await findOrder(over.body.id)).status).toBe('REJECTED');
  });

  it('fondos insuficientes: persiste REJECTED y no modifica efectivo ni posiciones', async () => {
    const userId = await createFundedUser(ctx.dataSource, 1_000);

    const res = await placeOrder({
      userId,
      instrumentId: SEED_INSTRUMENTS.PAMP,
      side: 'BUY',
      type: 'MARKET',
      size: 5,
    }).expect(201);

    expect(res.body).toMatchObject({ status: 'REJECTED', rejectReason: 'INSUFFICIENT_FUNDS' });
    const portfolio = await getPortfolio(userId);
    expect(portfolio.availableCash).toBe('1000.00');
    expect(portfolio.positions).toEqual([]);
  });

  it('venta: FILLED acredita el efectivo; vender más de lo que se tiene queda REJECTED', async () => {
    const userId = await createFundedUser(ctx.dataSource, 10_000);
    await placeOrder({ userId, instrumentId: SEED_INSTRUMENTS.METR, side: 'BUY', type: 'MARKET', size: 10 }).expect(
      201,
    );

    const sell = await placeOrder({
      userId,
      instrumentId: SEED_INSTRUMENTS.METR,
      side: 'SELL',
      type: 'MARKET',
      size: 4,
    }).expect(201);
    expect(sell.body).toMatchObject({ status: 'FILLED', price: '229.50', size: 4 });

    const portfolio = await getPortfolio(userId);
    expect(portfolio.availableCash).toBe('8623.00');
    expect(portfolio.positions[0]).toMatchObject({ quantity: 6 });

    const tooMuch = await placeOrder({
      userId,
      instrumentId: SEED_INSTRUMENTS.METR,
      side: 'SELL',
      type: 'MARKET',
      size: 7,
    }).expect(201);
    expect(tooMuch.body).toMatchObject({ status: 'REJECTED', rejectReason: 'INSUFFICIENT_HOLDINGS' });
  });

  it('venta por monto: convierte a unidades enteras al último precio', async () => {
    const userId = await createFundedUser(ctx.dataSource, 10_000);
    await placeOrder({ userId, instrumentId: SEED_INSTRUMENTS.METR, side: 'BUY', type: 'MARKET', size: 10 }).expect(
      201,
    );

    const res = await placeOrder({
      userId,
      instrumentId: SEED_INSTRUMENTS.METR,
      side: 'SELL',
      type: 'MARKET',
      amount: 1000,
    }).expect(201);
    expect(res.body).toMatchObject({ status: 'FILLED', size: 4 });
  });

  it('no permite vender un instrumento que no se tiene', async () => {
    const userId = await createFundedUser(ctx.dataSource, 10_000);
    const res = await placeOrder({
      userId,
      instrumentId: SEED_INSTRUMENTS.PAMP,
      side: 'SELL',
      type: 'MARKET',
      size: 1,
    }).expect(201);
    expect(res.body).toMatchObject({ status: 'REJECTED', rejectReason: 'INSUFFICIENT_HOLDINGS' });
  });

  it('sin precio de mercado no puede ejecutar MARKET: 422 y no persiste nada', async () => {
    const userId = await createFundedUser(ctx.dataSource, 10_000);
    const before = await countOrders(ctx.dataSource, userId);

    const res = await placeOrder({
      userId,
      instrumentId: SEED_INSTRUMENTS.PGR,
      side: 'BUY',
      type: 'MARKET',
      size: 1,
    }).expect(422);

    expect(res.body.error.code).toBe('UNPROCESSABLE');
    expect(await countOrders(ctx.dataSource, userId)).toBe(before);
  });

  it('un monto menor al precio de una unidad devuelve 422', async () => {
    const userId = await createFundedUser(ctx.dataSource, 10_000);
    const res = await placeOrder({
      userId,
      instrumentId: SEED_INSTRUMENTS.PAMP,
      side: 'BUY',
      type: 'MARKET',
      amount: '500',
    }).expect(422);
    expect(res.body.error.message).toMatch(/no alcanza/);
  });
});

describe('POST /orders - LIMIT', () => {
  it('queda NEW con el precio enviado y reserva el efectivo para órdenes posteriores', async () => {
    const userId = await createFundedUser(ctx.dataSource, 1_000);

    const limit = await placeOrder({
      userId,
      instrumentId: SEED_INSTRUMENTS.METR,
      side: 'BUY',
      type: 'LIMIT',
      size: 4,
      price: 200,
    }).expect(201);
    expect(limit.body).toMatchObject({ status: 'NEW', price: '200.00', size: 4, type: 'LIMIT' });

    const portfolio = await getPortfolio(userId);
    expect(portfolio).toMatchObject({
      cashBalance: '1000.00',
      reservedCash: '800.00',
      availableCash: '200.00',
      totalValue: '1000.00',
    });
    expect(portfolio.positions).toEqual([]);

    const market = await placeOrder({
      userId,
      instrumentId: SEED_INSTRUMENTS.METR,
      side: 'BUY',
      type: 'MARKET',
      size: 1,
    }).expect(201);
    expect(market.body.status).toBe('REJECTED');
  });

  it('compra LIMIT por monto usa el precio límite para calcular unidades', async () => {
    const userId = await createFundedUser(ctx.dataSource, 1_000);
    const res = await placeOrder({
      userId,
      instrumentId: SEED_INSTRUMENTS.METR,
      side: 'BUY',
      type: 'LIMIT',
      amount: 1000,
      price: '300',
    }).expect(201);
    expect(res.body).toMatchObject({ status: 'NEW', size: 3, price: '300.00' });
  });

  it('LIMIT por encima del disponible queda REJECTED', async () => {
    const userId = await createFundedUser(ctx.dataSource, 1_000);
    const res = await placeOrder({
      userId,
      instrumentId: SEED_INSTRUMENTS.METR,
      side: 'BUY',
      type: 'LIMIT',
      size: 5,
      price: 250,
    }).expect(201);
    expect(res.body).toMatchObject({ status: 'REJECTED', rejectReason: 'INSUFFICIENT_FUNDS' });
  });

  it('venta LIMIT reserva unidades', async () => {
    const userId = await createFundedUser(ctx.dataSource, 10_000);
    await placeOrder({ userId, instrumentId: SEED_INSTRUMENTS.METR, side: 'BUY', type: 'MARKET', size: 10 }).expect(
      201,
    );

    await placeOrder({
      userId,
      instrumentId: SEED_INSTRUMENTS.METR,
      side: 'SELL',
      type: 'LIMIT',
      size: 6,
      price: 300,
    }).expect(201);
    const portfolio = await getPortfolio(userId);
    expect(portfolio.positions[0]).toMatchObject({ quantity: 10, availableQuantity: 4 });

    const res = await placeOrder({
      userId,
      instrumentId: SEED_INSTRUMENTS.METR,
      side: 'SELL',
      type: 'MARKET',
      size: 5,
    }).expect(201);
    expect(res.body).toMatchObject({ status: 'REJECTED', rejectReason: 'INSUFFICIENT_HOLDINGS' });
  });

  it('LIMIT no necesita marketdata', async () => {
    const userId = await createFundedUser(ctx.dataSource, 1_000);
    const res = await placeOrder({
      userId,
      instrumentId: SEED_INSTRUMENTS.PGR,
      side: 'BUY',
      type: 'LIMIT',
      size: 1,
      price: 10,
    }).expect(201);
    expect(res.body.status).toBe('NEW');
  });
});

describe('POST /orders/:id/cancel', () => {
  it('cancela una orden NEW y libera la reserva', async () => {
    const userId = await createFundedUser(ctx.dataSource, 1_000);
    const limit = await placeOrder({
      userId,
      instrumentId: SEED_INSTRUMENTS.METR,
      side: 'BUY',
      type: 'LIMIT',
      size: 4,
      price: 200,
    }).expect(201);

    const res = await ctx.api.post(`/orders/${limit.body.id}/cancel`).expect(200);

    expect(res.body).toMatchObject({ id: limit.body.id, status: 'CANCELLED' });
    expect((await getPortfolio(userId)).availableCash).toBe('1000.00');
  });

  it('no permite cancelar órdenes que no están NEW', async () => {
    const userId = await createFundedUser(ctx.dataSource, 1_000);
    const filled = await placeOrder({
      userId,
      instrumentId: SEED_INSTRUMENTS.METR,
      side: 'BUY',
      type: 'MARKET',
      size: 1,
    }).expect(201);

    const res = await ctx.api.post(`/orders/${filled.body.id}/cancel`).expect(409);
    expect(res.body.error.code).toBe('CONFLICT');
    expect((await findOrder(filled.body.id)).status).toBe('FILLED');
  });

  it('404 si la orden no existe', async () => {
    await ctx.api.post('/orders/999999/cancel').expect(404);
  });
});

describe('POST /orders - transferencias', () => {
  it('CASH_IN y CASH_OUT se registran sobre ARS con price 1 y size = pesos', async () => {
    const userId = await createFundedUser(ctx.dataSource, 0);

    const cashIn = await placeOrder({ userId, side: 'CASH_IN', type: 'MARKET', amount: 5000 }).expect(201);
    expect(cashIn.body).toMatchObject({
      instrumentId: SEED_INSTRUMENTS.ARS,
      ticker: 'ARS',
      size: 5000,
      price: '1.00',
      status: 'FILLED',
    });

    const cashOut = await placeOrder({ userId, side: 'CASH_OUT', type: 'MARKET', size: 1500 }).expect(201);
    expect(cashOut.body.status).toBe('FILLED');

    const portfolio = await getPortfolio(userId);
    expect(portfolio).toMatchObject({ availableCash: '3500.00', totalValue: '3500.00', positions: [] });
  });

  it('CASH_OUT mayor al disponible queda REJECTED', async () => {
    const userId = await createFundedUser(ctx.dataSource, 100);
    const res = await placeOrder({ userId, side: 'CASH_OUT', type: 'MARKET', size: 101 }).expect(201);
    expect(res.body).toMatchObject({ status: 'REJECTED', rejectReason: 'INSUFFICIENT_FUNDS' });
  });
});

describe('POST /orders - validación (no persiste nada)', () => {
  const base = { side: 'BUY', type: 'MARKET', instrumentId: SEED_INSTRUMENTS.PAMP, size: 1 };

  it.each([
    ['LIMIT sin price', { type: 'LIMIT' }],
    ['MARKET con price', { price: 100 }],
    ['size y amount a la vez', { amount: 1000 }],
    ['ni size ni amount', { size: undefined }],
    ['size fraccionario', { size: 1.5 }],
    ['size negativo', { size: -1 }],
    ['size como string', { size: '10' }],
    ['price negativo', { type: 'LIMIT', price: -5 }],
    ['price con 3 decimales', { type: 'LIMIT', price: '10.123' }],
    ['price no numérico', { type: 'LIMIT', price: 'abc' }],
    ['amount no numérico', { size: undefined, amount: 'mil' }],
    ['amount en cero', { size: undefined, amount: '0' }],
    ['side inválido', { side: 'SHORT' }],
    ['type inválido', { type: 'STOP' }],
    ['campo desconocido', { foo: 'bar' }],
    ['BUY sin instrumentId', { instrumentId: undefined }],
    ['transferencia LIMIT', { side: 'CASH_IN', instrumentId: undefined, type: 'LIMIT', price: 1 }],
    ['transferencia con centavos', { side: 'CASH_IN', instrumentId: undefined, size: undefined, amount: '10.50' }],
  ])('400 si %s', async (_name, override) => {
    const userId = await createFundedUser(ctx.dataSource, 100_000);
    const before = await countOrders(ctx.dataSource);

    const res = await placeOrder({ ...base, userId, ...override }).expect(400);

    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details.length).toBeGreaterThan(0);
    expect(await countOrders(ctx.dataSource)).toBe(before);
  });

  it('400 con JSON mal formado', async () => {
    const res = await ctx.api.post('/orders').set('content-type', 'application/json').send('{"userId": ').expect(400);
    expect(res.body.error.code).toBe('INVALID_JSON');
  });

  it('404 si el usuario no existe', async () => {
    const res = await placeOrder({ ...base, userId: 999_999 }).expect(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('404 si el instrumento no existe', async () => {
    const userId = await createFundedUser(ctx.dataSource, 1_000);
    await placeOrder({ ...base, userId, instrumentId: 999_999 }).expect(404);
  });

  it('422 si se intenta comprar el instrumento de efectivo (ARS)', async () => {
    const userId = await createFundedUser(ctx.dataSource, 1_000);
    await placeOrder({ ...base, userId, instrumentId: SEED_INSTRUMENTS.ARS }).expect(422);
  });
});

describe('POST /orders - concurrencia', () => {
  it('requests simultáneos del mismo usuario no gastan el mismo efectivo dos veces', async () => {
    const userId = await createFundedUser(ctx.dataSource, 459);

    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        placeOrder({ userId, instrumentId: SEED_INSTRUMENTS.METR, side: 'BUY', type: 'MARKET', size: 1 }),
      ),
    );

    const statuses = results.map((r) => r.body.status);
    expect(results.every((r) => r.status === 201)).toBe(true);
    expect(statuses.filter((s) => s === 'FILLED')).toHaveLength(2);
    expect(statuses.filter((s) => s === 'REJECTED')).toHaveLength(6);

    const portfolio = await getPortfolio(userId);
    expect(portfolio.availableCash).toBe('0.00');
    expect(portfolio.positions[0]).toMatchObject({ quantity: 2 });
  });

  it('ventas simultáneas no venden las mismas unidades dos veces', async () => {
    const userId = await createFundedUser(ctx.dataSource, 10_000);
    await placeOrder({ userId, instrumentId: SEED_INSTRUMENTS.METR, side: 'BUY', type: 'MARKET', size: 3 }).expect(201);

    const results = await Promise.all(
      Array.from({ length: 6 }, () =>
        placeOrder({ userId, instrumentId: SEED_INSTRUMENTS.METR, side: 'SELL', type: 'MARKET', size: 1 }),
      ),
    );

    expect(results.filter((r) => r.body.status === 'FILLED')).toHaveLength(3);
    expect((await getPortfolio(userId)).positions).toEqual([]);
  });
});
