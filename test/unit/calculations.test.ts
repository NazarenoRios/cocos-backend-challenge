import { describe, expect, it } from 'vitest';
import { averageCostByInstrument } from '../../src/modules/portfolio/portfolio.calculator.js';
import { unitsForAmount } from '../../src/modules/orders/orders.sizing.js';
import { Decimal, percentChange } from '../../src/shared/money.js';

const buy = (size: number, price: string) => ({
  instrumentId: 1,
  side: 'BUY' as const,
  size,
  price: new Decimal(price),
});
const sell = (size: number, price: string) => ({
  instrumentId: 1,
  side: 'SELL' as const,
  size,
  price: new Decimal(price),
});

describe('unitsForAmount', () => {
  it('redondea hacia abajo a unidades enteras', () => {
    expect(unitsForAmount(new Decimal('1000'), new Decimal('300'))).toBe(3);
    expect(unitsForAmount(new Decimal('10000'), new Decimal('925.85'))).toBe(10);
  });

  it('sin errores de coma flotante en divisiones exactas', () => {
    expect(unitsForAmount(new Decimal('0.3'), new Decimal('0.1'))).toBe(3);
    expect(unitsForAmount(new Decimal('459'), new Decimal('229.50'))).toBe(2);
  });

  it('devuelve 0 si el monto no alcanza para una unidad', () => {
    expect(unitsForAmount(new Decimal('99.99'), new Decimal('100'))).toBe(0);
  });
});

describe('averageCostByInstrument (PPC)', () => {
  it('pondera las compras', () => {
    expect(
      averageCostByInstrument([buy(10, '100'), buy(30, '200')])
        .get(1)
        ?.toString(),
    ).toBe('175');
  });

  it('las ventas no cambian el PPC', () => {
    expect(
      averageCostByInstrument([buy(10, '100'), sell(4, '500'), buy(6, '200')])
        .get(1)
        ?.toString(),
    ).toBe('150');
  });

  it('se reinicia al cerrar la posición', () => {
    expect(
      averageCostByInstrument([buy(10, '100'), sell(10, '150'), buy(5, '300')])
        .get(1)
        ?.toString(),
    ).toBe('300');
  });

  it('queda indefinido si la cantidad es negativa', () => {
    expect(averageCostByInstrument([buy(20, '1540'), sell(30, '1530')]).get(1)).toBeNull();
  });
});

describe('percentChange', () => {
  it('calcula la variación porcentual', () => {
    expect(percentChange(new Decimal('921.80'), new Decimal('925.85'))?.toFixed(4)).toBe('0.4394');
  });

  it('es null si la base es 0 o falta', () => {
    expect(percentChange(new Decimal(0), new Decimal(10))).toBeNull();
    expect(percentChange(null, new Decimal(10))).toBeNull();
  });
});
