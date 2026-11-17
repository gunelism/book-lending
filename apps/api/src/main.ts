import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { configureApp } from './bootstrap';
import { createLogger } from './common/logging/create-logger';
import { validateEnv } from './config/env';
import { reportServices } from './config/services-report';

// Errors outside any request (a background task, a library callback) would otherwise vanish or kill the process silently.
process.on('unhandledRejection', (reason: any) => {
  Logger.error(`Unhandled promise rejection: ${reason?.message ?? reason}`, reason?.stack, 'Process');
});
process.on('uncaughtException', (err) => {
  Logger.fatal(`Uncaught exception, shutting down: ${err.message}`, err.stack, 'Process');
  process.exit(1); // state may be corrupt; Docker's restart policy brings the API back
});

async function bootstrap() {
  const env = validateEnv(process.env);
  Logger.overrideLogger(createLogger(env.LOG_LEVEL, env.LOG_FORMAT));
  reportServices(env);
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false, logger: createLogger(env.LOG_LEVEL, env.LOG_FORMAT) });
  configureApp(app);
  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port, '0.0.0.0');
  Logger.log(`API listening on :${port} (GraphQL at /graphql)`, 'Bootstrap');
}

bootstrap().catch((err) => {
  Logger.fatal(`API failed to start: ${err?.message ?? err}`, err?.stack, 'Bootstrap');
  process.exit(1);
});
