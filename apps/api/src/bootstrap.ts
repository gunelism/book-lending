import { INestApplication, ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { serveAdmin } from './admin-static';
import { configureSecurity } from './auth/security';
import { AllExceptionsFilter } from './common/logging/all-exceptions.filter';
import { requestLogger } from './common/logging/request-logger.middleware';
import { validateEnv } from './config/env';

/** Everything main.ts and the e2e tests both need, so the tests exercise the real stack. */
export function configureApp(app: INestApplication): void {
  const env = validateEnv(process.env);

  // First, so every request is logged, including ones rejected by CSRF, auth or the rate limiter.
  app.use(requestLogger);
  (app as NestExpressApplication).useBodyParser('json', { limit: '200kb' });
  // One-container deploys (Render): the API also serves the admin. Unset with docker compose (Caddy serves it).
  serveAdmin(app, env.ADMIN_DIR);
  configureSecurity(app, env);

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true, // runs the @Clean() sanitisers and type coercion
      whitelist: true, // strips unknown properties…
      forbidNonWhitelisted: true, // …and rejects requests that send them
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableShutdownHooks();
}
