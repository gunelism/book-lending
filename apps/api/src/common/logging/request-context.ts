import { randomBytes } from 'node:crypto';

/** Per-request facts the access log and error handlers share (kept on the Express request object). */
export interface RequestLogInfo {
  /** Short random id: sent back as X-Request-Id and shown to users as an error reference. */
  id: string;
  /** e.g. "mutation checkout" — set by the GraphQL plugin, since every GraphQL call is POST /graphql. */
  operation?: string;
  /** Error codes of the request (GraphQL errors arrive with HTTP 200, so the status alone hides them). */
  errors: string[];
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      log?: RequestLogInfo;
    }
  }
}

export const newRequestId = () => randomBytes(6).toString('hex');
