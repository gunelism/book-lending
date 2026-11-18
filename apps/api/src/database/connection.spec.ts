import { directDatabaseUrl, resolveDbConnection } from './connection';

describe('resolveDbConnection', () => {
  it('turns a Neon URL into strict TLS + channel binding, keeping the rest of the URL', () => {
    const conn = resolveDbConnection(
      'postgresql://neondb_owner:p%40ss@ep-cool-dust-a1b2c3-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require',
    );

    expect(conn).toEqual({
      url: 'postgresql://neondb_owner:p%40ss@ep-cool-dust-a1b2c3-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=verify-full',
      ssl: true,
      enableChannelBinding: true,
    });
  });

  it('leaves a local URL without TLS unless DATABASE_SSL forces it', () => {
    const local = 'postgresql://library:secret@postgres:5432/library';

    expect(resolveDbConnection(local)).toEqual({ url: local, ssl: false, enableChannelBinding: false });
    expect(resolveDbConnection(local, true).ssl).toBe(true);
    expect(resolveDbConnection(`${local}?sslmode=disable`).ssl).toBe(false);
  });
});

describe('directDatabaseUrl', () => {
  it('prefers the unpooled URL for migrations, and falls back to DATABASE_URL (local / other providers)', () => {
    expect(directDatabaseUrl({ DATABASE_URL: 'pooled', DATABASE_URL_UNPOOLED: 'direct' })).toBe('direct');
    expect(directDatabaseUrl({ DATABASE_URL: 'only', DATABASE_URL_UNPOOLED: '' })).toBe('only');
  });
});
