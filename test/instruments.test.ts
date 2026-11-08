import { describe, expect, it } from 'vitest';
import { escapeLike } from '../src/modules/instruments/instruments.repository.js';
import { useTestContext } from './helpers.js';

const ctx = useTestContext({ reset: 'once' });

const search = (query: Record<string, string | number>) => ctx.api.get('/instruments/search').query(query);
const tickers = (body: { items: { ticker: string }[] }) => body.items.map((i) => i.ticker);

describe('GET /instruments/search', () => {
  it('busca por ticker parcial sin distinguir mayúsculas', async () => {
    const res = await search({ ticker: 'gal' }).expect(200);
    expect(tickers(res.body)).toEqual(['GGAL']);
    expect(res.body.items[0]).toMatchObject({
      name: 'Grupo Financiero Galicia',
      type: 'ACCIONES',
      lastPrice: expect.any(String),
    });
  });

  it('busca por nombre parcial', async () => {
    const res = await search({ name: 'banco' }).expect(200);
    expect(tickers(res.body)).toEqual(expect.arrayContaining(['BBAR', 'BHIP', 'BMA', 'BPAT']));
  });

  it('`q` busca en ticker o nombre, con coincidencia exacta de ticker primero', async () => {
    const res = await search({ q: 'irsa' }).expect(200);
    expect(tickers(res.body)[0]).toBe('IRSA');
    expect(tickers(res.body)).toContain('IRCP');
  });

  it('ticker y nombre combinados se aplican con AND', async () => {
    const res = await search({ ticker: 'b', name: 'macro' }).expect(200);
    expect(tickers(res.body)).toEqual(['BMA']);
  });

  it('no devuelve el instrumento de efectivo', async () => {
    const res = await search({ q: 'ars' }).expect(200);
    expect(tickers(res.body)).not.toContain('ARS');
  });

  it('los comodines de LIKE se buscan literalmente', async () => {
    expect((await search({ q: '_' }).expect(200)).body.items).toEqual([]);
    expect((await search({ q: '%' }).expect(200)).body.items).toEqual([]);
    expect(tickers((await search({ name: 'S.A.' }).expect(200)).body).length).toBeGreaterThan(0);
  });

  it('escapeLike escapa \\, % y _', () => {
    expect(escapeLike('50%_a\\b')).toBe('50\\%\\_a\\\\b');
  });

  it('pagina con limit/offset', async () => {
    const page1 = await search({ name: 's', limit: 2 }).expect(200);
    const page2 = await search({ name: 's', limit: 2, offset: 2 }).expect(200);
    expect(page1.body.items).toHaveLength(2);
    expect(tickers(page2.body)).not.toEqual(tickers(page1.body));
  });

  it('instrumento sin marketdata devuelve precio null', async () => {
    const res = await search({ ticker: 'PGR' }).expect(200);
    expect(res.body.items[0]).toMatchObject({ ticker: 'PGR', lastPrice: null });
  });

  it('400 sin términos de búsqueda o con limit fuera de rango', async () => {
    await search({}).expect(400);
    await search({ q: 'a', limit: 500 }).expect(400);
  });
});
