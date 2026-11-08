import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPerformanceIndexes1730000000000 implements MigrationInterface {
  name = 'AddPerformanceIndexes1730000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS idx_orders_user_status_instrument ON orders (userid, status, instrumentid)',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS idx_marketdata_instrument_date ON marketdata (instrumentid, date DESC, id DESC)',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS idx_marketdata_instrument_date');
    await queryRunner.query('DROP INDEX IF EXISTS idx_orders_user_status_instrument');
  }
}
