import pg from 'pg';
import { DataSource } from 'typeorm';
import { Instrument } from './entities/instrument.entity.js';
import { MarketData } from './entities/market-data.entity.js';
import { Order } from './entities/order.entity.js';
import { User } from './entities/user.entity.js';
import { AddPerformanceIndexes1730000000000 } from './migrations/1730000000000-AddPerformanceIndexes.js';

pg.types.setTypeParser(1114, (value: string) => `${value.replace(' ', 'T')}Z`);
pg.types.setTypeParser(1082, (value: string) => value);

export const entities = [User, Instrument, Order, MarketData];

export function createDataSource(url: string, poolMax = 10): DataSource {
  return new DataSource({
    type: 'postgres',
    url,
    entities,
    migrations: [AddPerformanceIndexes1730000000000],
    synchronize: false,
    migrationsRun: false,
    logging: false,
    applicationName: 'cocos-backend-challenge',
    extra: { max: poolMax, connectionTimeoutMillis: 5_000, idleTimeoutMillis: 30_000 },
  });
}
