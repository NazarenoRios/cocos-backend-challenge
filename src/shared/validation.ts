import { z } from 'zod';
import { Decimal } from './money.js';

export const PG_INT_MAX = 2_147_483_647;

const TWO_DECIMALS_PATTERN = /^\d+(\.\d{1,2})?$/;

export const idSchema = z.number().int().positive().max(PG_INT_MAX);

export const idParamSchema = z.coerce.number().int().positive().max(PG_INT_MAX);

export const decimalAmountSchema = (max: string) =>
  z
    .union([z.number(), z.string()])
    .transform((value) => (typeof value === 'number' ? value.toString() : value.trim()))
    .refine((value) => TWO_DECIMALS_PATTERN.test(value), 'Debe ser un número positivo con hasta 2 decimales')
    .refine((value) => !TWO_DECIMALS_PATTERN.test(value) || new Decimal(value).gt(0), 'Debe ser mayor a 0')
    .refine(
      (value) => !TWO_DECIMALS_PATTERN.test(value) || new Decimal(value).lte(max),
      `Debe ser menor o igual a ${max}`,
    );
