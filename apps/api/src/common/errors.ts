import { HttpException, HttpStatus } from '@nestjs/common';
import { GraphQLFormattedError } from 'graphql';

/**
 * A business-rule violation (e.g. "member has overdue loans"). Shown to the
 * user as-is; `code` lets clients and tests react to a specific rule.
 */
export class DomainError extends HttpException {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super({ code, message }, HttpStatus.UNPROCESSABLE_ENTITY);
  }
}

export class NotFoundError extends HttpException {
  constructor(entity: string, id: number | string) {
    super({ code: 'NOT_FOUND', message: `${entity} #${id} was not found` }, HttpStatus.NOT_FOUND);
  }
}

/** A dependency (e.g. the AI provider or object storage) is down; the rest of the app keeps working. */
export class ServiceUnavailableError extends HttpException {
  constructor(code: string, message: string, status = HttpStatus.SERVICE_UNAVAILABLE) {
    super({ code, message }, status);
  }
}

const STATUS_TO_CODE: Record<number, string> = {
  400: 'BAD_USER_INPUT',
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  413: 'PAYLOAD_TOO_LARGE',
  422: 'BUSINESS_RULE_VIOLATION',
  429: 'TOO_MANY_REQUESTS',
  503: 'SERVICE_UNAVAILABLE',
};

/** Postgres error codes we translate into friendly messages. */
function fromDatabaseError(err: any): { code: string; message: string } | null {
  if (err?.code === '23505') return { code: 'CONFLICT', message: uniqueMessage(err.detail) };
  if (err?.code === '23503') {
    return { code: 'CONFLICT', message: 'This record is still referenced by other records and cannot be removed.' };
  }
  if (err?.code === '23514') return { code: 'BAD_USER_INPUT', message: 'The change violates a data integrity rule.' };
  return null;
}

function uniqueMessage(detail?: string): string {
  const m = detail?.match(/Key \(([^)]+)\)=\(([^)]*)\)/);
  return m ? `A record with ${m[1]} "${m[2]}" already exists.` : 'A record with these values already exists.';
}

/**
 * Turns any thrown error into a safe GraphQL error. Unknown errors never leak
 * stack traces or SQL in production.
 */
export function formatGraphQLError(formatted: GraphQLFormattedError, error: unknown): GraphQLFormattedError {
  const original: any = (error as any)?.originalError ?? error;

  if (original instanceof HttpException) {
    const status = original.getStatus();
    const body: any = original.getResponse();
    const code = body?.code ?? STATUS_TO_CODE[status] ?? 'BAD_REQUEST';
    let message: string = typeof body === 'string' ? body : body?.message ?? original.message;
    if (Array.isArray(message)) message = message.join('; ');
    return { message, path: formatted.path, extensions: { code } };
  }

  const db = fromDatabaseError(original);
  if (db) return { message: db.message, path: formatted.path, extensions: { code: db.code } };

  // GraphQL parse/validation errors are safe to show.
  const code = formatted.extensions?.code as string | undefined;
  if (code && code !== 'INTERNAL_SERVER_ERROR') return { message: formatted.message, path: formatted.path, extensions: { code } };

  if (process.env.NODE_ENV !== 'production') return formatted;
  console.error(original);
  return { message: 'Internal server error', path: formatted.path, extensions: { code: 'INTERNAL_SERVER_ERROR' } };
}
