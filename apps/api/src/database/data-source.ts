import 'reflect-metadata';
import { DataSource, DataSourceOptions } from 'typeorm';
import { ENTITIES } from '../entities';

/**
 * Shared TypeORM options. Used by the Nest app, the migration runner, the
 * seed script and the TypeORM CLI (migration:generate).
 */
export function buildDataSourceOptions(
  url = process.env.DATABASE_URL,
  ssl = process.env.DATABASE_SSL === 'true',
): DataSourceOptions {
  if (!url) throw new Error('DATABASE_URL is not set');
  return {
    type: 'postgres',
    url,
    ssl: ssl ? { rejectUnauthorized: true } : false,
    entities: ENTITIES,
    migrations: [__dirname + '/migrations/*.{ts,js}'],
    // Schema changes only ever happen through reviewed migrations.
    synchronize: false,
    migrationsRun: false,
    logging: ['error', 'warn'],
  };
}

// Default export consumed by the TypeORM CLI.
export default new DataSource(buildDataSourceOptions());
