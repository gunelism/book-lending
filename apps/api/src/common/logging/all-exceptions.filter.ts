import { ArgumentsHost, Catch, ExceptionFilter, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import { describeError } from '../errors';
import './request-context';

const logger = new Logger('Exceptions');

/**
 * Last line of defence for the REST endpoints (login, cover uploads, health…).
 * Expected errors keep Nest's usual JSON shape; anything unexpected is logged
 * with its stack and answered with a generic message and a reference.
 * GraphQL errors are left to Apollo (formatGraphQLError + the logging plugin).
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    if (host.getType<string>() === 'graphql') throw exception;

    const http = host.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();
    const info = describeError(exception);
    const requestId = req.log?.id;
    req.log?.errors.push(info.code);

    if (!info.expected) {
      const err = exception as Error;
      logger.error(`${req.method} ${req.originalUrl.split('?')[0]} failed (req ${requestId}): ${err?.message ?? err}`, err?.stack);
    }
    if (res.headersSent) return; // e.g. a stream broke halfway; nothing more can be sent

    const message = info.expected ? info.message : `${info.message} (reference ${requestId})`;
    res.status(info.status).json({ statusCode: info.status, code: info.code, message, requestId });
  }
}
