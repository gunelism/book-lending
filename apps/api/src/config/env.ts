import { plainToInstance, Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MinLength,
  validateSync,
} from 'class-validator';

const toBool = ({ value }: { value: unknown }) =>
  value === undefined || value === '' ? undefined : String(value).toLowerCase() === 'true';

/**
 * Every setting the API reads. Validated once at boot so a missing secret
 * fails fast instead of surfacing as a confusing runtime error.
 */

/** Rejects the example values once shipped in .env.example ("change-me-…"): a known secret is no secret. */
function NotPlaceholder() {
  return Matches(/^(?!.*change-?me)/i, { message: ({ property }) => `${property} is still an example value: generate one with  openssl rand -base64 48` });
}

export class Env {
  @IsIn(['development', 'production', 'test'])
  NODE_ENV: 'development' | 'production' | 'test' = 'development';

  /** Minimum log level: error, warn, log (default; one line per request) or debug (adds health checks). */
  @IsIn(['fatal', 'error', 'warn', 'log', 'debug', 'verbose'])
  LOG_LEVEL = 'log';

  /** pretty (default, readable in `docker compose logs`) or json (one object per line, for log services). */
  @IsIn(['pretty', 'json'])
  LOG_FORMAT = 'pretty';

  @Transform(({ value }) => Number(value))
  @IsInt()
  PORT = 3000;

  /** App traffic. On Neon this is the pooled (-pooler) URL that `neon deploy` / `neon env pull` writes. */
  @IsString()
  DATABASE_URL: string;

  /** Direct (non-pooled) URL for migrations and the seed; written by Neon next to DATABASE_URL. Optional elsewhere. */
  @IsOptional()
  @IsString()
  DATABASE_URL_UNPOOLED?: string;

  /** Forces TLS. Not needed when the URL has ?sslmode=require (as Neon's do): that turns TLS on by itself. */
  @Transform(toBool)
  @IsBoolean()
  DATABASE_SSL = false;

  /** Where covers are stored: an explicit S3_* store, else Neon Object Storage (AWS_* vars from `neon deploy`), else the local container. */
  @IsIn(['s3', 'neon', 'local'])
  STORAGE_SOURCE: 's3' | 'neon' | 'local' = 'local';

  @IsUrl({ require_tld: false, require_protocol: true })
  S3_ENDPOINT: string;

  @IsString()
  S3_REGION = 'us-east-1';

  @IsString()
  S3_ACCESS_KEY: string;

  @IsString()
  S3_SECRET_KEY: string;

  @IsString()
  S3_BUCKET: string;

  @Transform(toBool)
  @IsBoolean()
  S3_FORCE_PATH_STYLE = true;

  @IsString()
  @MinLength(32, { message: 'SESSION_SECRET must be at least 32 characters' })
  @NotPlaceholder()
  SESSION_SECRET: string;

  @IsString()
  @MinLength(32, { message: 'CSRF_SECRET must be at least 32 characters' })
  @NotPlaceholder()
  CSRF_SECRET: string;

  /** Secure cookies require HTTPS. Only the automated tests turn this off. */
  @Transform(toBool)
  @IsBoolean()
  COOKIE_SECURE = true;

  /** Public origin of the app, used for OAuth redirects. */
  @IsUrl({ require_tld: false, require_protocol: true })
  PUBLIC_URL = 'https://localhost';

  @IsOptional()
  @IsString()
  GITHUB_CLIENT_ID?: string;

  @IsOptional()
  @IsString()
  GITHUB_CLIENT_SECRET?: string;

  /**
   * Help chat: any OpenAI-compatible Chat Completions endpoint. Defaults to
   * Groq's free tier; Gemini, OpenRouter or a self-hosted Ollama work by
   * changing AI_BASE_URL + AI_MODEL. Without a key the chat shows as disabled.
   */
  @IsOptional()
  @IsString()
  AI_API_KEY?: string;

  @IsUrl({ require_tld: false, require_protocol: true })
  AI_BASE_URL = 'https://api.groq.com/openai/v1';

  @IsString()
  AI_MODEL = 'openai/gpt-oss-20b';

  /** Sent as `reasoning_effort` when set (reasoning models such as gpt-oss); empty = not sent. */
  @IsOptional()
  @IsIn(['', 'low', 'medium', 'high'])
  AI_REASONING_EFFORT = 'low';

  @Transform(({ value }) => Number(value))
  @IsInt()
  AI_TIMEOUT_MS = 20_000;
}

/**
 * Picks ONE complete set of object-storage settings, so values from two stores never mix:
 *  1. S3_ENDPOINT set           → that store, with the S3_* keys (any S3-compatible service)
 *  2. AWS_ENDPOINT_URL_S3 set   → Neon Object Storage: `neon deploy` writes these AWS-standard vars
 *                                 for the buckets declared in neon.ts. Neon requires path-style URLs.
 *  3. neither                   → the local storage container (docker compose profile local-services)
 */
export function resolveStorageEnv(raw: Record<string, unknown>): Record<string, unknown> {
  const has = (k: string) => typeof raw[k] === 'string' && raw[k] !== '';
  // Already decided: Nest's ConfigModule copies the validated values (S3_ENDPOINT, STORAGE_SOURCE…)
  // back into process.env, so a second validation must keep the decision, not re-derive it from the copies.
  if (has('STORAGE_SOURCE')) return raw;
  if (has('S3_ENDPOINT')) return { ...raw, STORAGE_SOURCE: 's3' };
  if (has('AWS_ENDPOINT_URL_S3')) {
    return {
      ...raw,
      STORAGE_SOURCE: 'neon',
      S3_ENDPOINT: raw.AWS_ENDPOINT_URL_S3,
      S3_ACCESS_KEY: raw.AWS_ACCESS_KEY_ID,
      S3_SECRET_KEY: raw.AWS_SECRET_ACCESS_KEY,
      S3_REGION: has('AWS_REGION') ? raw.AWS_REGION : raw.S3_REGION,
      S3_FORCE_PATH_STYLE: 'true',
    };
  }
  return { ...raw, STORAGE_SOURCE: 'local', S3_ENDPOINT: 'http://minio:9000' };
}

export function validateEnv(raw: Record<string, unknown>): Env {
  raw = resolveStorageEnv(raw);
  const env = plainToInstance(Env, raw, { enableImplicitConversion: false, exposeDefaultValues: true });
  const errors = validateSync(env, { skipMissingProperties: false, whitelist: false });
  if (errors.length) {
    const details = errors.map((e) => Object.values(e.constraints ?? {}).join(', ')).join('\n  - ');
    throw new Error(`Invalid environment configuration:\n  - ${details}`);
  }
  return env;
}
