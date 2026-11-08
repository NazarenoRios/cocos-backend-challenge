import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

export const OrderSide = { BUY: 'BUY', SELL: 'SELL', CASH_IN: 'CASH_IN', CASH_OUT: 'CASH_OUT' } as const;
export type OrderSide = (typeof OrderSide)[keyof typeof OrderSide];

export const OrderType = { MARKET: 'MARKET', LIMIT: 'LIMIT' } as const;
export type OrderType = (typeof OrderType)[keyof typeof OrderType];

export const OrderStatus = { NEW: 'NEW', FILLED: 'FILLED', REJECTED: 'REJECTED', CANCELLED: 'CANCELLED' } as const;
export type OrderStatus = (typeof OrderStatus)[keyof typeof OrderStatus];

@Entity({ name: 'orders' })
export class Order {
  @PrimaryGeneratedColumn({ type: 'integer' })
  id!: number;

  @Column({ name: 'instrumentid', type: 'integer' })
  instrumentId!: number;

  @Column({ name: 'userid', type: 'integer' })
  userId!: number;

  @Column({ type: 'integer' })
  size!: number;

  @Column({ type: 'numeric', precision: 10, scale: 2, nullable: true })
  price!: string | null;

  @Column({ type: 'varchar', length: 10 })
  type!: OrderType;

  @Column({ type: 'varchar', length: 10 })
  side!: OrderSide;

  @Column({ type: 'varchar', length: 20 })
  status!: OrderStatus;

  @Column({ type: 'timestamp' })
  datetime!: Date;
}
