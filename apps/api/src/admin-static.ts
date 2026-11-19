import { INestApplication, Logger } from '@nestjs/common';
import * as express from 'express';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

/** Paths the API owns; everything else is the admin single-page app. */
const API_PATH = /^\/(graphql|api|auth)(\/|$)/;

/**
 * Same headers Caddy adds in the docker-compose setup (docker/caddy/Caddyfile), for the one-container
 * deploy (Render and similar) where the platform terminates HTTPS and there is no Caddy.
 */
const SPA_HEADERS: Record<string, string> = {
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://avatars.githubusercontent.com; " +
    "font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self' https://github.com",
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
};

/**
 * Serves the built admin (ADMIN_DIR) from the API process. Registered before sessions and CSRF,
 * so loading the page and its assets never touches the database.
 *  - /assets/* have content-hashed names → cached for a year
 *  - any other GET that isn't an API path → index.html (client-side routing), never cached
 */
export function serveAdmin(app: INestApplication, dir: string | undefined): void {
  if (!dir) return;
  if (!existsSync(join(dir, 'index.html'))) {
    Logger.warn(`ADMIN_DIR=${dir} has no index.html: the admin is not served by the API`, 'AdminStatic');
    return;
  }
  const setSpaHeaders = (res: express.Response) => {
    for (const [k, v] of Object.entries(SPA_HEADERS)) res.setHeader(k, v);
  };

  app.use(
    express.static(dir, {
      index: false,
      setHeaders: (res, path) => {
        setSpaHeaders(res);
        res.setHeader('Cache-Control', path.includes(`${join(dir, 'assets')}`) ? 'public, max-age=31536000, immutable' : 'no-cache');
      },
    }),
  );
  app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
    if ((req.method !== 'GET' && req.method !== 'HEAD') || API_PATH.test(req.path)) return next();
    setSpaHeaders(res);
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(join(dir, 'index.html'));
  });
  Logger.log(`Serving the admin from ${dir}`, 'AdminStatic');
}
