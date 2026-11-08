import type { Decimal } from '../../shared/money.js';

export function unitsForAmount(amount: Decimal, price: Decimal): number {
  if (price.lte(0)) throw new RangeError('price debe ser positivo');
  return amount.div(price).floor().toNumber();
}
