/**
 * Turns a Postgres URL (local, Neon, or any managed provider) into the options node-postgres needs.
 *
 * Neon's URLs (written to .env by `neon deploy` / `neon env pull`) end in
 * `?sslmode=require&channel_binding=require`:
 *  - sslmode: any value except `disable` turns TLS on, so DATABASE_SSL=true isn't needed for them.
 *    `require` / `prefer` / `verify-ca` are rewritten to `verify-full`. node-postgres already treats
 *    them that way (certificate and hostname checked); naming it explicitly keeps that strict
 *    behaviour across pg upgrades and silences pg's per-start "SECURITY WARNING".
 *  - channel_binding=require: node-postgres ignores the URL parameter; it needs
 *    `enableChannelBinding` (SCRAM-SHA-256-PLUS, which binds the login to the TLS connection).
 */
export interface DbConnection {
  url: string;
  ssl: boolean;
  enableChannelBinding: boolean;
}

const VERIFY_FULL_ALIASES = new Set(['require', 'prefer', 'verify-ca']);

export function resolveDbConnection(rawUrl: string, sslFlag = false): DbConnection {
  const url = new URL(rawUrl);
  const params = url.searchParams;

  const sslmode = params.get('sslmode');
  if (sslmode && VERIFY_FULL_ALIASES.has(sslmode)) params.set('sslmode', 'verify-full');
  const ssl = sslFlag || (!!sslmode && sslmode !== 'disable');

  const enableChannelBinding = params.get('channel_binding') === 'require';
  params.delete('channel_binding');

  return { url: url.toString(), ssl, enableChannelBinding };
}

/** Migrations, the seed (which drops and rebuilds the schema) and the TypeORM CLI need a direct
 *  connection: Neon's pooled one goes through PgBouncer in transaction mode, which has no session
 *  state. `neon env pull` provides it as DATABASE_URL_UNPOOLED; elsewhere DATABASE_URL is direct already. */
export function directDatabaseUrl(env: { DATABASE_URL?: string; DATABASE_URL_UNPOOLED?: string } = process.env): string | undefined {
  return env.DATABASE_URL_UNPOOLED || env.DATABASE_URL;
}
