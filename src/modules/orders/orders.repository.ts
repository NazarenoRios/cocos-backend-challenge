import type { EntityManager } from 'typeorm';
import { Order, OrderStatus, type OrderSide, type OrderType } from '../../db/entities/order.entity.js';

interface NewOrder {
  userId: number;
  instrumentId: number;
  side: OrderSide;
  type: OrderType;
  size: number;
  price: string;
  status: OrderStatus;
}

export function findOrder(manager: EntityManager, id: number): Promise<Order | null> {
  return manager.getRepository(Order).findOneBy({ id });
}

export function findOrderForUpdate(manager: EntityManager, id: number): Promise<Order> {
  return manager
    .getRepository(Order)
    .createQueryBuilder('o')
    .setLock('pessimistic_write')
    .where('o.id = :id', { id })
    .getOneOrFail();
}

export async function insertOrder(manager: EntityManager, order: NewOrder): Promise<Order> {
  const result = await manager
    .createQueryBuilder()
    .insert()
    .into(Order)
    .values({ ...order, datetime: () => "(now() AT TIME ZONE 'UTC')" })
    .returning(['id'])
    .execute();
  return manager.getRepository(Order).findOneByOrFail({ id: result.identifiers[0]?.id as number });
}

export async function markOrderCancelled(manager: EntityManager, id: number): Promise<void> {
  await manager.getRepository(Order).update({ id, status: OrderStatus.NEW }, { status: OrderStatus.CANCELLED });
}
