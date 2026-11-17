import { DataSource } from 'typeorm';
import { buildDataSourceOptions } from './data-source';

/** Applies pending migrations. Runs on container start before the API boots. */
async function main() {
  const ds = new DataSource(buildDataSourceOptions());
  await ds.initialize();
  const applied = await ds.runMigrations({ transaction: 'each' });
  console.log(applied.length ? `Applied ${applied.length} migration(s): ${applied.map((m) => m.name).join(', ')}` : 'Database schema is up to date.');
  await ds.destroy();
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
