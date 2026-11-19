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

  it('keeps its decision when validated again after ConfigModule copied the results into process.env', () => {
    const first = resolveStorageEnv({ ...LOCAL_KEYS, ...NEON });
    const processEnvAfterConfigModule = { ...LOCAL_KEYS, ...NEON, S3_ENDPOINT: first.S3_ENDPOINT, STORAGE_SOURCE: first.STORAGE_SOURCE };

    expect(resolveStorageEnv(processEnvAfterConfigModule)).toMatchObject({ STORAGE_SOURCE: 'neon', S3_ENDPOINT: NEON.AWS_ENDPOINT_URL_S3 });
    expect(validateEnv({ ...BASE, ...processEnvAfterConfigModule }).STORAGE_SOURCE).toBe('neon');
  });

  it('falls back to the local container when neither is configured', () => {
    expect(resolveStorageEnv({ ...LOCAL_KEYS, S3_ENDPOINT: '', AWS_ENDPOINT_URL_S3: '' })).toMatchObject({
      STORAGE_SOURCE: 'local',
      S3_ENDPOINT: 'http://minio:9000',
      S3_ACCESS_KEY: 'library',
    });
  });
});
