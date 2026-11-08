import { Brackets, In, type EntityManager } from 'typeorm';
import { Instrument, InstrumentType } from '../../db/entities/instrument.entity.js';

export function findInstrument(manager: EntityManager, id: number): Promise<Instrument | null> {
  return manager.getRepository(Instrument).findOneBy({ id });
}

export async function findInstrumentsByIds(manager: EntityManager, ids: number[]): Promise<Map<number, Instrument>> {
  if (ids.length === 0) return new Map();
  const instruments = await manager.getRepository(Instrument).findBy({ id: In(ids) });
  return new Map(instruments.map((i) => [i.id, i]));
}

export function findCashInstrument(manager: EntityManager): Promise<Instrument | null> {
  return manager.getRepository(Instrument).findOneBy({ type: InstrumentType.CURRENCY, ticker: 'ARS' });
}

export interface SearchFilters {
  q?: string | undefined;
  ticker?: string | undefined;
  name?: string | undefined;
  limit: number;
  offset: number;
}

export const escapeLike = (term: string) => term.replace(/[\\%_]/g, (c) => `\\${c}`);
const containsPattern = (term: string) => `%${escapeLike(term)}%`;

export function findInstrumentsMatching(manager: EntityManager, filters: SearchFilters): Promise<Instrument[]> {
  const qb = manager
    .getRepository(Instrument)
    .createQueryBuilder('i')
    .where('i.type IS DISTINCT FROM :currency', { currency: InstrumentType.CURRENCY });

  if (filters.q) {
    const q = containsPattern(filters.q);
    qb.andWhere(
      new Brackets((w) =>
        w.where(`i.ticker ILIKE :q ESCAPE '\\'`, { q }).orWhere(`i.name ILIKE :q ESCAPE '\\'`, { q }),
      ),
    );
  }
  if (filters.ticker) qb.andWhere(`i.ticker ILIKE :ticker ESCAPE '\\'`, { ticker: containsPattern(filters.ticker) });
  if (filters.name) qb.andWhere(`i.name ILIKE :name ESCAPE '\\'`, { name: containsPattern(filters.name) });

  const rankTerm = (filters.q ?? filters.ticker ?? '').toUpperCase();
  return qb
    .addSelect(
      `CASE WHEN UPPER(i.ticker) = :exact THEN 0 WHEN UPPER(i.ticker) LIKE :prefix ESCAPE '\\' THEN 1 ELSE 2 END`,
      'rank',
    )
    .setParameters({ exact: rankTerm, prefix: `${escapeLike(rankTerm)}%` })
    .orderBy('rank', 'ASC')
    .addOrderBy('i.ticker', 'ASC')
    .addOrderBy('i.id', 'ASC')
    .offset(filters.offset)
    .limit(filters.limit)
    .getMany();
}
