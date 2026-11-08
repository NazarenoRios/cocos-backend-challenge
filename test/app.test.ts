import supertest from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { createDataSource } from '../src/db/data-source.js';
import { createLogger } from '../src/shared/logger.js';
import { useTestContext } from './helpers.js';

const ctx = useTestContext({ reset: 'never' });
const appWithDatabaseDown = () =>
  createApp(createDataSource('postgresql://u:p@127.0.0.1:1/none_test'), createLogger('silent'));

describe('aspectos transversales', () => {
  it('GET /health responde 200 con la base disponible', async () => {
    await ctx.api.get('/health').expect(200, { status: 'ok' });
  });

  it('GET /health responde 503 si la base no responde', async () => {
    await supertest(appWithDatabaseDown()).get('/health').expect(503, { status: 'unavailable' });
  });

  it('propaga un X-Request-Id válido y lo incluye en los errores', async () => {
    const res = await ctx.api.get('/nope').set('X-Request-Id', 'abc-123').expect(404);
    expect(res.headers['x-request-id']).toBe('abc-123');
    expect(res.body.error).toMatchObject({ code: 'NOT_FOUND', requestId: 'abc-123' });
  });

  it('genera un request id si el entrante falta o no es válido', async () => {
    const res = await ctx.api.get('/health').set('X-Request-Id', 'inválido con espacios');
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('no expone detalles internos en errores 500', async () => {
    const res = await supertest(appWithDatabaseDown()).get('/users/1/portfolio').expect(500);
    expect(res.body).toEqual({
      error: { code: 'INTERNAL_ERROR', message: 'Error interno', requestId: expect.any(String) },
    });
  });

  it('rechaza bodies de más de 10kb con 413', async () => {
    const res = await ctx.api
      .post('/orders')
      .send({ padding: 'x'.repeat(20_000) })
      .expect(413);
    expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });
});
