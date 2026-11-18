import 'reflect-metadata';
import { DataSource, DataSourceOptions } from 'typeorm';
import { ENTITIES } from '../entities';
import { directDatabaseUrl, resolveDbConnection } from './connection';

/**
 * Shared TypeORM options. Used by the Nest app, the migration runner, the
 * seed script and the TypeORM CLI (migration:generate).
 */
export function buildDataSourceOptions(
  url = process.env.DATABASE_URL,
  ssl = process.env.DATABASE_SSL === 'true',
): DataSourceOptions {
  if (!url) throw new Error('DATABASE_URL is not set');
  const conn = resolveDbConnection(url, ssl);
  return {
    type: 'postgres',
    url: conn.url,
    ssl: conn.ssl ? { rejectUnauthorized: true } : false,
    extra: { enableChannelBinding: conn.enableChannelBinding },
    entities: ENTITIES,
    migrations: [__dirname + '/migrations/*.{ts,js}'],
    // Schema changes only ever happen through reviewed migrations.
    synchronize: false,
    migrationsRun: false,
    logging: ['error', 'warn'],
  };
}

// Default export consumed by the TypeORM CLI (migration:generate / run): needs the direct connection.
export default new DataSource(buildDataSourceOptions(directDatabaseUrl()));
