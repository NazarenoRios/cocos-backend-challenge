import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

export const InstrumentType = {
  STOCK: 'ACCIONES',
  CURRENCY: 'MONEDA',
} as const;
export type InstrumentType = (typeof InstrumentType)[keyof typeof InstrumentType];

@Entity({ name: 'instruments' })
export class Instrument {
  @PrimaryGeneratedColumn({ type: 'integer' })
  id!: number;

  @Column({ type: 'varchar', length: 10, nullable: true })
  ticker!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  name!: string | null;

  @Column({ type: 'varchar', length: 10, nullable: true })
  type!: InstrumentType | null;
}
