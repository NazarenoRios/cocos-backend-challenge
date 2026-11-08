# Cocos Backend Challenge

API para el [challenge de backend de Cocos](https://github.com/cocos-capital/cocos-challenge/blob/main/backend-challenge.md):
portfolio, búsqueda de activos y envío de órdenes.

**Stack:** Node.js · TypeScript · Express 5 · TypeORM · PostgreSQL.

## Cómo correrlo

Requiere Node.js 22+.

```bash
npm install
cp .env.example .env   # completar DATABASE_URL con la cadena de conexión de la base provista
npm run dev            # http://localhost:3000
```

Para producción: `npm run build && npm start`.

### Con Docker

Con el mismo `.env`:

```bash
docker compose up --build   # http://localhost:3000
```

La imagen es multi-stage (solo `dist/` y dependencias de producción), corre con un usuario sin privilegios y define
un healthcheck sobre `/health`.

## Endpoints

| Método | Ruta                                   | Descripción                                                 |
| ------ | -------------------------------------- | ----------------------------------------------------------- |
| GET    | `/users/:userId/portfolio`             | Valor total, pesos disponibles y posiciones con rendimiento |
| GET    | `/instruments/search?q=&ticker=&name=` | Búsqueda parcial por ticker y/o nombre                      |
| POST   | `/orders`                              | Envía una orden (compra, venta, CASH_IN, CASH_OUT)          |
| POST   | `/orders/:orderId/cancel`              | Cancela una orden `NEW`                                     |
| GET    | `/health`                              | Estado de la API y la base                                  |

Ejemplos listos para usar en [`requests.http`](./requests.http) (extensión REST Client de VS Code).

```bash
curl -X POST http://localhost:3000/orders -H "Content-Type: application/json" \
  -d '{"userId":4,"instrumentId":47,"side":"BUY","type":"MARKET","amount":"10000"}'
```

Una orden lleva `size` (cantidad de acciones) **o** `amount` (monto en pesos). `price` es obligatorio en `LIMIT` y no
se acepta en `MARKET`. Importes y precios se devuelven como strings decimales (`"925.85"`) para no perder precisión.

| Resultado                                      | HTTP | Estado guardado               |
| ---------------------------------------------- | ---- | ----------------------------- |
| `MARKET` con saldo / acciones suficientes      | 201  | `FILLED` (al último `close`)  |
| `LIMIT` con saldo / acciones suficientes       | 201  | `NEW`                         |
| Saldo o acciones insuficientes                 | 201  | `REJECTED` (+ `rejectReason`) |
| Body inválido                                  | 400  | no se guarda                  |
| Usuario o instrumento inexistente              | 404  | no se guarda                  |
| Sin precio de mercado o monto menor a 1 acción | 422  | no se guarda                  |

## Tests

```bash
npm test         # tests funcionales y unitarios
npm run check    # typecheck + lint + formato + tests
```

Los tests **no usan la base provista**: levantan un Postgres descartable con Docker (Testcontainers) y lo cargan con
[`db/database.sql`](./db/database.sql) antes de cada test, para no escribir datos de prueba en la base compartida.
El test funcional de envío de órdenes es [`test/orders.test.ts`](./test/orders.test.ts).

## Decisiones y supuestos

- **Saldos y posiciones se calculan desde `orders`** (solo `FILLED`, usando `size`), como pide el enunciado:
  - pesos = `CASH_IN` − `CASH_OUT` − compras + ventas;
  - **pesos disponibles** = pesos − compras `LIMIT` pendientes (`NEW`), que quedan reservadas. Las ventas `NEW`
    reservan acciones del mismo modo.
- **Valor total** = pesos + Σ (acciones × último `close`).
- **Rendimiento total (%)** = (último `close` − precio promedio de compra) / precio promedio de compra. Es el
  rendimiento de la tenencia actual; las ventas no cambian el precio promedio. También se informa el rendimiento diario
  (`close` vs `previousClose`).
- **Compra por monto**: `floor(amount / precio)` acciones, para no superar nunca el monto pedido.
- **Las órdenes `LIMIT` quedan `NEW`** aunque su precio cruce el de mercado: el enunciado indica no simular el mercado.
- **Transferencias**: se guardan sobre el instrumento ARS con `price = 1` y `size` = pesos, igual que en los datos
  provistos. Como `size` es entero, solo admiten pesos enteros.
- **Concurrencia**: cada orden se procesa en una transacción que bloquea al usuario (`SELECT … FOR UPDATE`). Así dos
  órdenes simultáneas no pueden gastar el mismo saldo; hay un test que lo verifica.
- **Cálculos con decimales exactos** (`decimal.js`), redondeados a 2 decimales recién al responder.
- **Dato inconsistente en la base**: el usuario 1 vendió 30 `BMA` habiendo comprado 20 (posición −10). No se
  modifican datos existentes: se muestra tal cual, sin precio promedio. La API rechazaría esa venta.
- **Cancelación de órdenes**: se agregó el endpoint porque el enunciado define el estado `CANCELLED` y la regla "solo se
  pueden cancelar órdenes `NEW`".
- **Sin autenticación**, como indica el enunciado.

### Cambio de esquema propuesto

La app funciona con la base tal como está (`synchronize: false`). Para que las consultas de saldos y precios escalen,
[`src/db/migrations/1730000000000-AddPerformanceIndexes.ts`](./src/db/migrations/1730000000000-AddPerformanceIndexes.ts)
agrega índices en `orders(userid, status, instrumentid)` y `marketdata(instrumentid, date DESC, id DESC)`. Solo afecta
performance. No se aplicó sobre la base compartida; los tests sí la aplican. Se ejecuta con `npm run migration:run`.

### Mejoras posibles

Idempotencia en `POST /orders` (header `Idempotency-Key`), tablas de saldos y posiciones materializadas cuando el
volumen de órdenes lo justifique, y autenticación.
