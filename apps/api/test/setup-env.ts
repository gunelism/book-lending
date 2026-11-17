// Test defaults. In Docker (`docker compose --profile test run --rm api-test`)
// these come from docker-compose.yml; values already set are never overridden.
const defaults: Record<string, string> = {
  NODE_ENV: 'test',
  COOKIE_SECURE: 'false',
  PUBLIC_URL: 'http://localhost',
  S3_BUCKET: 'library-covers-test',
  SESSION_SECRET: 'test-session-secret-0123456789abcdef0123456789',
  CSRF_SECRET: 'test-csrf-secret-0123456789abcdef0123456789abcd',
};
for (const [k, v] of Object.entries(defaults)) process.env[k] ??= v;

if (!process.env.DATABASE_URL?.includes('test')) {
  // Safety net: the e2e suite truncates tables, so never point it at real data.
  throw new Error(`Refusing to run e2e tests against "${process.env.DATABASE_URL}" — use a database whose name contains "test".`);
}
