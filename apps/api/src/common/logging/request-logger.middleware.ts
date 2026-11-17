import { Logger } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { newRequestId } from './request-context';

const logger = new Logger('HTTP');

/** Health checks run every few seconds; they only appear in the log at debug level, or when they fail. */
const QUIET_PATHS = new Set(['/api/health']);

/**
 * Access log: one line per request, written when the response is sent.
 *
 *   POST /graphql mutation checkout → 200 · 38 ms · user 12 · req 3f9c2a1b7d04
 *   POST /graphql mutation checkout → 200 [BUSINESS_RULE_VIOLATION] · 21 ms · user 12 · req …
 *   POST /auth/login → 401 · 95 ms · ip 172.18.0.1 · req …
 *
 * Level follows the outcome: errors (5xx) → error, client errors (4xx or a GraphQL error) → warn, otherwise log.
 * Bodies, variables, cookies and headers are never logged (they can hold passwords and session ids).
 */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const started = process.hrtime.bigint();
  req.log = { id: newRequestId(), errors: [] };
  res.setHeader('X-Request-Id', req.log.id);

  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - started) / 1e6;
    const info = req.log!;
    const path = req.originalUrl.split('?')[0];
    const user = (req as any).user?.id ?? req.session?.userId;
    const parts = [
      `${req.method} ${path}${info.operation ? ` ${info.operation}` : ''} → ${res.statusCode}${info.errors.length ? ` [${[...new Set(info.errors)].join(', ')}]` : ''}`,
      `${ms.toFixed(0)} ms`,
      user ? `user ${user}` : `ip ${req.ip}`,
      `req ${info.id}`,
    ];
    const line = parts.join(' · ');

    if (res.statusCode >= 500 || info.errors.includes('INTERNAL_SERVER_ERROR')) logger.error(line);
    else if (res.statusCode >= 400 || info.errors.length) logger.warn(line);
    else if (QUIET_PATHS.has(path)) logger.debug(line);
    else logger.log(line);
  });
  next();
}
