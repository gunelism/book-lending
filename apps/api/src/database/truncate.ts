import { DataSource } from 'typeorm';

/**
 * Empties every entity table and resets the id sequences (seed + e2e tests).
 *
 * Raw SQL on purpose: TypeORM's repository.clear() truncates a single table
 * without CASCADE, which Postgres refuses for tables referenced by foreign
 * keys. The table list comes from TypeORM's entity metadata.
 */
export async function truncateAll(ds: DataSource): Promise<void> {
  const tables = ds.entityMetadatas.map((m) => `"${m.tableName}"`).join(', ');
  await ds.query(`TRUNCATE ${tables} RESTART IDENTITY CASCADE`);
}
