import { INestApplication, ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { configureSecurity } from './auth/security';
import { validateEnv } from './config/env';

/** Everything main.ts and the e2e tests both need, so the tests exercise the real stack. */
export function configureApp(app: INestApplication): void {
  const env = validateEnv(process.env);

  (app as NestExpressApplication).useBodyParser('json', { limit: '200kb' });
  configureSecurity(app, env);

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true, // runs the @Clean() sanitisers and type coercion
      whitelist: true, // strips unknown properties…
      forbidNonWhitelisted: true, // …and rejects requests that send them
    }),
  );
  app.enableShutdownHooks();
}
