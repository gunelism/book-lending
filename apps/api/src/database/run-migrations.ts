import { DataSource } from 'typeorm';
import { directDatabaseUrl } from './connection';
import { buildDataSourceOptions } from './data-source';

/** Applies pending migrations. Runs on container start before the API boots, over the direct
 *  (non-pooled) connection when one is configured. */
async function main() {
  const ds = new DataSource(buildDataSourceOptions(directDatabaseUrl()));
  await ds.initialize();
  const applied = await ds.runMigrations({ transaction: 'each' });
  console.log(applied.length ? `Applied ${applied.length} migration(s): ${applied.map((m) => m.name).join(', ')}` : 'Database schema is up to date.');
  await ds.destroy();
}

/** Turns the most common setup mistakes into an actionable message. */
function hint(err: any): string | null {
  if (err?.code === 'ENOTFOUND' && err?.hostname === 'postgres') {
    return [
      'DATABASE_URL points at the local "postgres" container, but that container is not running.',
      'Either:',
      '  - use the local containers: add  COMPOSE_PROFILES=local-services  to .env, then `docker compose up --build`, or',
      '  - use Neon: run `npx neon@latest deploy` (it writes DATABASE_URL and DATABASE_URL_UNPOOLED to .env) — see DEPLOYMENT.md.',
    ].join('\n');
  }
  if (err?.code === 'ENOTFOUND') return `Database host "${err.hostname}" could not be resolved. Check DATABASE_URL in .env.`;
  if (err?.code === 'ECONNREFUSED') return 'The database refused the connection. Is it running, and is DATABASE_URL correct?';
  if (err?.code === '28P01') return 'The database rejected the username/password in DATABASE_URL.';
  return null;
}

main().catch((err) => {
  const help = hint(err);
  if (help) console.error(`\nCannot start: ${help}\n`);
  console.error('Migration failed:', err?.message ?? err);
  process.exit(1);
});
