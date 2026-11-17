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

  logger.log(`Database: ${dbHost} (${dbLocal ? 'LOCAL container' : 'managed'}${env.DATABASE_SSL ? ', TLS' : ''})`);
  logger.log(`Object storage: ${s3Host}, bucket "${env.S3_BUCKET}" (${s3Local ? 'LOCAL container' : 'managed'})`);
  logger.log(`Help chat: ${env.AI_API_KEY ? `enabled (${env.AI_MODEL} via ${host(env.AI_BASE_URL)})` : 'disabled (no AI_API_KEY)'}`);

  if (env.NODE_ENV === 'production' && (dbLocal || s3Local)) {
    logger.warn(
      'Running on LOCAL stand-in services. For a real deployment set DATABASE_URL (+ DATABASE_SSL=true) to a managed Postgres ' +
        'and S3_ENDPOINT / S3_ACCESS_KEY / S3_SECRET_KEY / S3_BUCKET to a managed object store — see DEPLOYMENT.md.',
    );
  }
}
