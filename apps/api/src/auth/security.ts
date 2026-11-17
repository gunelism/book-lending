import { INestApplication } from '@nestjs/common';
import connectPgSimple from 'connect-pg-simple';
import cookieParser from 'cookie-parser';
import { doubleCsrf } from 'csrf-csrf';
import type { NextFunction, Request, Response } from 'express';
import session from 'express-session';
import helmet from 'helmet';
import { Pool } from 'pg';
import { Env } from '../config/env';

export const SESSION_MAX_AGE_MS = 8 * 60 * 60 * 1000; // one working day

export interface SecurityHandles {
  generateCsrfToken: (req: Request, res: Response, opts?: { overwrite?: boolean }) => string;
  sessionCookieName: string;
  csrfCookieName: string;
  pool: Pool;
}

let handles: SecurityHandles | undefined;
export function security(): SecurityHandles {
  if (!handles) throw new Error('configureSecurity() has not run');
  return handles;
}

/**
 * HTTP-level security, shared by main.ts and the e2e tests:
 *  - helmet security headers
 *  - server-side sessions in Postgres (HttpOnly, Secure, SameSite cookies)
 *  - double-submit CSRF tokens on every state-changing request (GraphQL
 *    mutations, uploads, login, logout)
 */
export function configureSecurity(app: INestApplication, env: Env): SecurityHandles {
  const express = app.getHttpAdapter().getInstance();
  // Behind exactly one reverse proxy (Caddy), so req.ip / req.secure are trustworthy.
  express.set('trust proxy', 1);
  express.disable('x-powered-by');

  app.use(
    helmet({
      // The API only serves JSON and images; lock everything else down.
      contentSecurityPolicy:
        env.NODE_ENV === 'production'
          ? { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"], imgSrc: ["'self'"] } }
          : false,
      crossOriginResourcePolicy: { policy: 'same-origin' },
    }),
  );

  // __Host- cookies are bound to this exact origin, HTTPS-only, path=/.
  const prefix = env.COOKIE_SECURE ? '__Host-' : '';
  const sessionCookieName = `${prefix}lib.sid`;
  const csrfCookieName = `${prefix}lib.csrf`;

  app.use(cookieParser());

  const pool = new Pool({
    connectionString: env.DATABASE_URL,
    ssl: env.DATABASE_SSL ? { rejectUnauthorized: true } : undefined,
    max: 5,
  });
  const PgStore = connectPgSimple(session);
  const store = new PgStore({ pool, tableName: 'session', createTableIfMissing: false });
  // Release the session store's timer and connections when the app shuts down.
  const close = app.close.bind(app);
  app.close = async () => {
    await close();
    store.close();
    await pool.end();
  };
  app.use(
    session({
      name: sessionCookieName,
      secret: env.SESSION_SECRET,
      store,
      resave: false,
      saveUninitialized: false,
      rolling: true,
      proxy: true,
      cookie: {
        httpOnly: true,
        secure: env.COOKIE_SECURE,
        sameSite: 'lax',
        path: '/',
        maxAge: SESSION_MAX_AGE_MS,
      },
    }),
  );

  const { doubleCsrfProtection, generateCsrfToken } = doubleCsrf({
    getSecret: () => env.CSRF_SECRET,
    // Token is bound to the session, so a token stolen from one session is useless in another.
    getSessionIdentifier: (req) => req.session?.id ?? '',
    cookieName: csrfCookieName,
    cookieOptions: { sameSite: 'strict', secure: env.COOKIE_SECURE, httpOnly: true, path: '/' },
    ignoredMethods: ['GET', 'HEAD', 'OPTIONS'],
    getCsrfTokenFromRequest: (req) => req.headers['x-csrf-token'],
  });

  app.use((req: Request, res: Response, next: NextFunction) => {
    doubleCsrfProtection(req, res, (err?: unknown) => {
      if (!err) return next();
      req.log?.errors.push('CSRF_INVALID');
      res.status(403).json({ statusCode: 403, code: 'CSRF_INVALID', message: 'Invalid or missing CSRF token. Reload the page and try again.', requestId: req.log?.id });
    });
  });

  handles = { generateCsrfToken, sessionCookieName, csrfCookieName, pool };
  return handles;
}
