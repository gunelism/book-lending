import { resolveStorageEnv, validateEnv } from './env';

const BASE = {
  DATABASE_URL: 'postgresql://library:x@localhost:5432/library',
  S3_ENDPOINT: 'http://silo:9000',
  S3_BUCKET: 'library-covers',
  S3_ACCESS_KEY: 'library',
  S3_SECRET_KEY: 'k9Vq2mXr7LpT4wZs',
  SESSION_SECRET: 'Qm3vX8rT1pL6wZ2sK9yB4nF7hJ0cD5gA',
  CSRF_SECRET: 'Zp4kW9sM2xQ7vR1tL8yN3bH6jF0cG5dE',
};

describe('validateEnv secrets', () => {
  it('accepts real random secrets', () => {
    expect(() => validateEnv(BASE)).not.toThrow();
  });

  it('refuses the example values that used to ship in .env.example', () => {
    expect(() => validateEnv({ ...BASE, SESSION_SECRET: 'change-me-to-a-long-random-string-at-least-32-chars' })).toThrow(
      'SESSION_SECRET is still an example value',
    );
  });

  it('refuses missing or short secrets', () => {
    expect(() => validateEnv({ ...BASE, CSRF_SECRET: '' })).toThrow('CSRF_SECRET must be at least 32 characters');
  });
});

describe('resolveStorageEnv: one complete storage source, never a mix', () => {
  const NEON = {
    AWS_ENDPOINT_URL_S3: 'https://storage.eu-central-1.aws.neon.tech',
    AWS_ACCESS_KEY_ID: 'neon-key',
    AWS_SECRET_ACCESS_KEY: 'neon-secret',
    AWS_REGION: 'eu-central-1',
  };
  const LOCAL_KEYS = { S3_ACCESS_KEY: 'library', S3_SECRET_KEY: 'local-secret', S3_FORCE_PATH_STYLE: 'false' };

  it('uses Neon Object Storage when `neon deploy` wrote the AWS_* vars, ignoring leftover local S3 keys', () => {
    expect(resolveStorageEnv({ ...LOCAL_KEYS, ...NEON, S3_ENDPOINT: '' })).toMatchObject({
      STORAGE_SOURCE: 'neon',
      S3_ENDPOINT: NEON.AWS_ENDPOINT_URL_S3,
      S3_ACCESS_KEY: 'neon-key',
      S3_SECRET_KEY: 'neon-secret',
      S3_REGION: 'eu-central-1',
      S3_FORCE_PATH_STYLE: 'true', // Neon requires path-style
    });
  });

  it('lets an explicit S3_ENDPOINT (R2, AWS S3…) win over Neon', () => {
    const env = resolveStorageEnv({ ...NEON, ...LOCAL_KEYS, S3_ENDPOINT: 'https://acc.r2.cloudflarestorage.com' });
    expect(env).toMatchObject({ STORAGE_SOURCE: 's3', S3_ENDPOINT: 'https://acc.r2.cloudflarestorage.com', S3_ACCESS_KEY: 'library' });
  });

  it.each([
    ['docker compose passes S3_ENDPOINT as an empty string', ''],
    ['S3_ENDPOINT was absent, so ConfigModule copied in the resolved endpoint', 'https://storage.eu-central-1.aws.neon.tech'],
  ])('gives the same answer when validated again after ConfigModule copied its results into process.env (%s)', (_case, s3Endpoint) => {
    const processEnv = { ...BASE, ...LOCAL_KEYS, ...NEON, S3_ENDPOINT: s3Endpoint };
    const first = validateEnv(processEnv);
    // ConfigModule.assignVariablesToProcess: copies validated keys that are absent from process.env
    const afterCopy: Record<string, unknown> = { ...processEnv };
    for (const [k, v] of Object.entries(first)) if (!(k in afterCopy)) afterCopy[k] = String(v);

    const second = validateEnv(afterCopy);
    expect([first.STORAGE_SOURCE, second.STORAGE_SOURCE]).toEqual(['neon', 'neon']);
    expect(second.S3_ENDPOINT).toBe(NEON.AWS_ENDPOINT_URL_S3);
    expect(second.S3_ACCESS_KEY).toBe('neon-key');
  });

  it('falls back to the local container when neither is configured', () => {
    expect(resolveStorageEnv({ ...LOCAL_KEYS, S3_ENDPOINT: '', AWS_ENDPOINT_URL_S3: '' })).toMatchObject({
      STORAGE_SOURCE: 'local',
      S3_ENDPOINT: 'http://minio:9000',
      S3_ACCESS_KEY: 'library',
    });
  });
});
