import { describe, expect, it } from 'vitest';
import { createFundedUser, useTestContext } from './helpers.js';

const ctx = useTestContext();

describe('GET /users/:userId/portfolio', () => {
  it('calcula el portfolio del usuario del seed', async () => {
    const res = await ctx.api.get('/users/1/portfolio').expect(200);

    expect(res.body).toMatchObject({
      userId: 1,
      accountNumber: '10001',
      cashBalance: '753000.00',
      reservedCash: '125500.00',
      availableCash: '627500.00',
      positionsValue: '136756.00',
      totalValue: '889756.00',
    });

    const byTicker = Object.fromEntries(res.body.positions.map((p: { ticker: string }) => [p.ticker, p]));
    expect(Object.keys(byTicker).sort()).toEqual(['BMA', 'METR', 'PAMP']);

    expect(byTicker.PAMP).toMatchObject({
      quantity: 40,
      lastPrice: '925.85',
      marketValue: '37034.00',
      averageCost: '930.00',
      totalReturn: { amount: '-166.00', percent: '-0.45' },
      dailyReturn: { amount: '162.00', percent: '0.44' },
    });
    expect(byTicker.METR).toMatchObject({
      quantity: 500,
      marketValue: '114750.00',
      averageCost: '250.00',
      totalReturn: { amount: '-10250.00', percent: '-8.20' },
      dailyReturn: { amount: '-1250.00', percent: '-1.08' },
    });
    expect(byTicker.BMA).toMatchObject({
      quantity: -10,
      marketValue: '-15028.00',
      averageCost: null,
      totalReturn: { amount: null, percent: null },
    });
  });

  it('usuario sin movimientos: todo en cero y sin posiciones', async () => {
    const res = await ctx.api.get('/users/2/portfolio').expect(200);
    expect(res.body).toMatchObject({ totalValue: '0.00', availableCash: '0.00', positions: [] });
  });

  it('no lista posiciones cerradas', async () => {
    const userId = await createFundedUser(ctx.dataSource, 10_000);
    await ctx.api.post('/orders').send({ userId, instrumentId: 54, side: 'BUY', type: 'MARKET', size: 2 }).expect(201);
    await ctx.api.post('/orders').send({ userId, instrumentId: 54, side: 'SELL', type: 'MARKET', size: 2 }).expect(201);

    const res = await ctx.api.get(`/users/${userId}/portfolio`).expect(200);
    expect(res.body).toMatchObject({ positions: [], availableCash: '10000.00', totalValue: '10000.00' });
  });

  it('404 si el usuario no existe y 400 si el id es inválido', async () => {
    await ctx.api.get('/users/999999/portfolio').expect(404);
    const res = await ctx.api.get('/users/abc/portfolio').expect(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});
