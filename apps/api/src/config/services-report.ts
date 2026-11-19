import { resolveDbConnection } from '../database/connection';
import { Logger } from '@nestjs/common';
import { Env } from './env';

const LOCAL_HOSTS = new Set(['postgres', 'minio', 'localhost', '127.0.0.1', '::1']);

function host(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return 'unparseable';
  }
}

/**
 * Logs, at startup, which database and object store the API is connected to
 * (hostnames only, never credentials). Running against the local Docker
 * stand-ins is allowed for development but never silent: it is logged as a
 * warning so a deployment can't accidentally run on them unnoticed.
 */
export function reportServices(env: Env, logger = new Logger('Services')): void {
  const dbHost = host(env.DATABASE_URL);
  const s3Host = host(env.S3_ENDPOINT);
  const dbLocal = LOCAL_HOSTS.has(dbHost);
  const s3Local = LOCAL_HOSTS.has(s3Host);

  const db = resolveDbConnection(env.DATABASE_URL, env.DATABASE_SSL);
  const direct = env.DATABASE_URL_UNPOOLED ? host(env.DATABASE_URL_UNPOOLED) : null;
  const pooled = dbHost.includes('-pooler.');
  logger.log(
    `Database: ${dbHost} (${dbLocal ? 'LOCAL container' : 'managed'}${db.ssl ? ', TLS' : ''}${pooled ? ', pooled' : ''})` +
      (direct && direct !== dbHost ? `; migrations via direct ${direct}` : ''),
  );
  if (pooled && !direct) {
    logger.warn('DATABASE_URL is pooled but DATABASE_URL_UNPOOLED is not set: migrations will run through the pooler. Run `npx neon@latest env pull`.');
  }
  const storageKind = env.STORAGE_SOURCE === 'neon' ? 'Neon Object Storage, managed' : s3Local ? 'LOCAL container' : 'managed';
  logger.log(`Object storage: ${s3Host}, bucket "${env.S3_BUCKET}" (${storageKind})`);
  logger.log(`Help chat: ${env.AI_API_KEY ? `enabled (${env.AI_MODEL} via ${host(env.AI_BASE_URL)})` : 'disabled (no AI_API_KEY)'}`);

  if (env.NODE_ENV === 'production' && (dbLocal || s3Local)) {
    logger.warn(
      'Running on LOCAL stand-in services. For a real deployment set DATABASE_URL (`npx neon@latest deploy` writes it) to a managed Postgres ' +
        'and declare the bucket in neon.ts so `neon deploy` adds Neon Object Storage (or set S3_* to another store); see DEPLOYMENT.md.',
    );
  }
}
