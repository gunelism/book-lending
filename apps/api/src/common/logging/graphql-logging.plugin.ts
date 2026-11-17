import type { ApolloDriverConfig } from '@nestjs/apollo';
import { Logger } from '@nestjs/common';
import type { Request } from 'express';
import { describeError } from '../errors';
import './request-context';

// The plugin type of the Apollo copy @nestjs/apollo is built against.
type ApolloPlugin = NonNullable<ApolloDriverConfig['plugins']>[number];

const logger = new Logger('GraphQL');

/**
 * Names each GraphQL request in the access log and logs its errors:
 *  - expected errors (bad input, business rule, not signed in…) → one warning with code and message
 *  - unexpected errors (bugs, database down…) → an error with the stack, the operation and the user;
 *    the client only gets a generic message plus a reference matching the log line.
 */
export function graphqlLoggingPlugin(): ApolloPlugin {
  return {
    async requestDidStart({ contextValue }: { contextValue: unknown }) {
      const req = (contextValue as { req?: Request }).req;
      return {
        async didResolveOperation({ operation }: { operation?: import('graphql').OperationDefinitionNode }) {
          if (!operation) return;
          // Root fields describe the call better than client-chosen operation names (often absent).
          const fields = operation.selectionSet.selections
            .map((s) => (s.kind === 'Field' ? s.name.value : null))
            .filter((n): n is string => !!n && n !== '__typename');
          if (req?.log) req.log.operation = `${operation.operation} ${fields.join(',') || 'anonymous'}`;
        },

        async didEncounterErrors({ errors, operation }: { errors: readonly import('graphql').GraphQLError[]; operation?: import('graphql').OperationDefinitionNode }) {
          for (const err of errors) {
            const info = describeError(err);
            req?.log?.errors.push(info.code);
            const where = `${operation?.operation ?? 'request'} ${err.path?.join('.') ?? ''}`.trim();
            const ref = req?.log ? ` (req ${req.log.id})` : '';
            if (info.expected) {
              logger.warn(`${where}: ${info.code} — ${info.message}${ref}`);
            } else {
              const original: any = err.originalError ?? err;
              const user = (req as any)?.user?.id;
              logger.error(`${where} failed${user ? ` for user ${user}` : ''}${ref}: ${original?.message ?? original}`, original?.stack);
            }
          }
        },

        async willSendResponse({ response }: { response: { body: any } }) {
          // Give users a reference they can report; it matches the request's log lines.
          if (!req?.log || response.body.kind !== 'single') return;
          for (const e of response.body.singleResult.errors ?? []) {
            e.extensions = { ...e.extensions, requestId: req.log.id };
            if (e.extensions.code === 'INTERNAL_SERVER_ERROR') e.message += ` (reference ${req.log.id})`;
          }
        },
      };
    },
  };
}
