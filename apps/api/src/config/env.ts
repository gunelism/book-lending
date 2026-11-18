import { plainToInstance, Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  MinLength,
  validateSync,
} from 'class-validator';

const toBool = ({ value }: { value: unknown }) =>
  value === undefined || value === '' ? undefined : String(value).toLowerCase() === 'true';

/**
 * Every setting the API reads. Validated once at boot so a missing secret
 * fails fast instead of surfacing as a confusing runtime error.
 */
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
  SESSION_SECRET: string;

  @IsString()
  @MinLength(32, { message: 'CSRF_SECRET must be at least 32 characters' })
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

export function validateEnv(raw: Record<string, unknown>): Env {
  const env = plainToInstance(Env, raw, { enableImplicitConversion: false, exposeDefaultValues: true });
  const errors = validateSync(env, { skipMissingProperties: false, whitelist: false });
  if (errors.length) {
    const details = errors.map((e) => Object.values(e.constraints ?? {}).join(', ')).join('\n  - ');
    throw new Error(`Invalid environment configuration:\n  - ${details}`);
  }
  return env;
}
