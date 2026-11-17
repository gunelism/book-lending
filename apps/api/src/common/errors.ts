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

export interface ErrorInfo {
  status: number;
  code: string;
  message: string;
  /** true = a normal outcome (bad input, business rule, not signed in…) logged as a warning; false = a bug or outage, logged with its stack. */
  expected: boolean;
}

export const INTERNAL_MESSAGE = 'Something went wrong on our side. Please try again.';

/** One place that decides what any thrown error means, for GraphQL, REST and the logs. */
export function describeError(err: unknown): ErrorInfo {
  const original: any = (err as any)?.originalError ?? err;

  if (original instanceof HttpException) {
    const status = original.getStatus();
    const body: any = original.getResponse();
    let message: string = typeof body === 'string' ? body : body?.message ?? original.message;
    if (Array.isArray(message)) message = message.join('; ');
    // 5xx HttpExceptions are deliberate (e.g. storage or AI provider down): already logged where they happen.
    return { status, code: body?.code ?? STATUS_TO_CODE[status] ?? 'BAD_REQUEST', message, expected: true };
  }

  const db = fromDatabaseError(original);
  if (db) return { status: db.code === 'CONFLICT' ? 409 : 400, code: db.code, message: db.message, expected: true };

  // GraphQL parse / validation errors (unknown field, wrong variable type…) are the client's mistake and safe to show.
  const gqlCode = (err as any)?.extensions?.code as string | undefined;
  if (gqlCode && gqlCode !== 'INTERNAL_SERVER_ERROR' && !(err as any)?.originalError) {
    return { status: 400, code: gqlCode, message: (err as any).message, expected: true };
  }

  return { status: 500, code: 'INTERNAL_SERVER_ERROR', message: INTERNAL_MESSAGE, expected: false };
}

/**
 * Turns any thrown error into a safe GraphQL error. Unexpected errors never
 * reach the client: they get a generic message plus a reference (the request
 * id, added by the logging plugin) that matches the server log entry.
 */
export function formatGraphQLError(formatted: GraphQLFormattedError, error: unknown): GraphQLFormattedError {
  const info = describeError(error);
  return { message: info.message, path: formatted.path, extensions: { code: info.code } };
}
