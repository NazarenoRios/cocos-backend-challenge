import type { EntityManager } from 'typeorm';
import { User } from '../../db/entities/user.entity.js';

export function findUser(manager: EntityManager, id: number): Promise<User | null> {
  return manager.getRepository(User).findOneBy({ id });
}

export async function lockUser(manager: EntityManager, id: number): Promise<boolean> {
  const user = await manager
    .getRepository(User)
    .createQueryBuilder('u')
    .select('u.id')
    .setLock('pessimistic_write')
    .where('u.id = :id', { id })
    .getOne();
  return user !== null;
}
