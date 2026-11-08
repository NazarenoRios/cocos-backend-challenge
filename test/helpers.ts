import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import supertest from 'supertest';
import type { DataSource } from 'typeorm';
import { afterAll, beforeAll, beforeEach, inject } from 'vitest';
import { createApp } from '../src/app.js';
import { createDataSource } from '../src/db/data-source.js';
import { Order, OrderSide, OrderStatus, OrderType } from '../src/db/entities/order.entity.js';
import { User } from '../src/db/entities/user.entity.js';
import { createLogger } from '../src/shared/logger.js';

const seedSql = readFileSync(fileURLToPath(new URL('../db/database.sql', import.meta.url)), 'utf8');

export const SEED_INSTRUMENTS = {
  ARS: 66,
  PAMP: 47,
  METR: 54,
  BMA: 31,
  PGR: 3,
} as const;

export interface TestContext {
  dataSource: DataSource;
  api: ReturnType<typeof supertest>;
}

async function createTestContext(): Promise<TestContext> {
  const dataSource = createDataSource(inject('testDatabaseUrl'), 20);
  await dataSource.initialize();
  const app = createApp(dataSource, createLogger('silent'));
  return { dataSource, api: supertest(app) };
}

export async function resetDatabase(dataSource: DataSource): Promise<void> {
  await dataSource.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await dataSource.query(seedSql);
  await dataSource.runMigrations({ transaction: 'all' });
}

type ResetMode = 'each' | 'once' | 'never';

export function useTestContext({ reset = 'each' }: { reset?: ResetMode } = {}): TestContext {
  const ctx = {} as TestContext;

  beforeAll(async () => {
    Object.assign(ctx, await createTestContext());
    if (reset === 'once') await resetDatabase(ctx.dataSource);
  });
  afterAll(async () => {
    await ctx.dataSource.destroy();
  });
  if (reset === 'each') {
    beforeEach(async () => {
      await resetDatabase(ctx.dataSource);
    });
  }

  return ctx;
}

export async function createFundedUser(dataSource: DataSource, cash: number): Promise<number> {
  const user = await dataSource
    .getRepository(User)
    .save({ email: `test-${Date.now()}-${Math.random()}@test.com`, accountNumber: 'T1' });
  if (cash > 0) {
    await dataSource.getRepository(Order).insert({
      userId: user.id,
      instrumentId: SEED_INSTRUMENTS.ARS,
      side: OrderSide.CASH_IN,
      type: OrderType.MARKET,
      size: cash,
      price: '1',
      status: OrderStatus.FILLED,
      datetime: () => "(now() AT TIME ZONE 'UTC')",
    });
  }
  return user.id;
}

export function countOrders(dataSource: DataSource, userId?: number): Promise<number> {
  return dataSource.getRepository(Order).count(userId === undefined ? {} : { where: { userId } });
}
