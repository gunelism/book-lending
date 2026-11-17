import { ConsoleLogger, LogLevel } from '@nestjs/common';

const LEVELS: LogLevel[] = ['fatal', 'error', 'warn', 'log', 'debug', 'verbose'];

/**
 * App-wide logger. LOG_LEVEL picks the minimum level (debug shows health checks too);
 * LOG_FORMAT=json writes one JSON object per line for log services (Better Stack, Datadog, CloudWatch…).
 */
export function createLogger(level = process.env.LOG_LEVEL ?? 'log', format = process.env.LOG_FORMAT ?? 'pretty'): ConsoleLogger {
  const idx = Math.max(LEVELS.indexOf(level as LogLevel), 0);
  return new ConsoleLogger({ logLevels: LEVELS.slice(0, idx + 1), json: format === 'json' });
}
