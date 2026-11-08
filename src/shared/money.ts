import { Decimal as BaseDecimal } from 'decimal.js';

export const Decimal = BaseDecimal.clone({ precision: 40, rounding: BaseDecimal.ROUND_HALF_UP });
export type Decimal = InstanceType<typeof Decimal>;

const toTwoDecimals = (value: Decimal): string => value.toFixed(2, Decimal.ROUND_HALF_UP);

export function formatMoney(value: Decimal): string;
export function formatMoney(value: Decimal | null): string | null;
export function formatMoney(value: Decimal | null): string | null {
  return value === null ? null : toTwoDecimals(value);
}

export function formatPercent(value: Decimal): string;
export function formatPercent(value: Decimal | null): string | null;
export function formatPercent(value: Decimal | null): string | null {
  return value === null ? null : toTwoDecimals(value);
}

export function percentChange(from: Decimal | null, to: Decimal | null): Decimal | null {
  if (from === null || to === null || from.isZero()) return null;
  return to.minus(from).div(from).times(100);
}
