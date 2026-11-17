import { randomBytes } from 'node:crypto';

// Test defaults. In Docker (`docker compose --profile local-services --profile test run --rm api-test`)
// most come from docker-compose.yml; values already set are never overridden.
// Secrets are generated per run — nothing secret is hardcoded in the repo.
const defaults: Record<string, string> = {
  NODE_ENV: 'test',
  COOKIE_SECURE: 'false',
  PUBLIC_URL: 'http://localhost',
  S3_BUCKET: 'library-covers-test',
  SESSION_SECRET: randomBytes(32).toString('hex'),
  CSRF_SECRET: randomBytes(32).toString('hex'),
};
for (const [k, v] of Object.entries(defaults)) if (!process.env[k]) process.env[k] = v;

if (!process.env.DATABASE_URL?.includes('test')) {
  // Safety net: the e2e suite truncates tables, so never point it at real data.
  throw new Error(`Refusing to run e2e tests against "${process.env.DATABASE_URL}" — use a database whose name contains "test".`);
}
