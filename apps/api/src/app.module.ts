import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { GraphQLModule } from '@nestjs/graphql';
import { ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { join } from 'node:path';
import { AuthModule } from './auth/auth.module';
import { AuthorsModule } from './authors/authors.module';
import { BooksModule } from './books/books.module';
import { depthLimit } from './common/depth-limit';
import { formatGraphQLError } from './common/errors';
import { Env, validateEnv } from './config/env';
import { CopiesModule } from './copies/copies.module';
import { buildDataSourceOptions } from './database/data-source';
import { HealthController } from './health/health.controller';
import { LoadersModule } from './loaders/loaders.module';
import { LoadersService } from './loaders/loaders.service';
import { LoansModule } from './loans/loans.module';
import { MembersModule } from './members/members.module';
import { StorageModule } from './storage/storage.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, validate: validateEnv }),

    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        buildDataSourceOptions(config.get('DATABASE_URL', { infer: true }), config.get('DATABASE_SSL', { infer: true })),
    }),

    GraphQLModule.forRootAsync<ApolloDriverConfig>({
      driver: ApolloDriver,
      imports: [LoadersModule],
      inject: [ConfigService, LoadersService],
      useFactory: (config: ConfigService<Env, true>, loaders: LoadersService) => {
        const isProd = config.get('NODE_ENV', { infer: true }) === 'production';
        return {
          path: '/graphql',
          autoSchemaFile: isProd ? true : join(process.cwd(), 'schema.gql'),
          sortSchema: true,
          // Schema exploration is a development convenience only.
          introspection: !isProd,
          playground: false,
          graphiql: !isProd,
          // Apollo's own CSRF guard (blocks "simple" cross-site requests) on top of our token check.
          csrfPrevention: true,
          validationRules: [depthLimit(6)],
          formatError: formatGraphQLError,
          // Fresh DataLoaders per request: batching without cross-user caching.
          context: ({ req, res }: { req: unknown; res: unknown }) => ({ req, res, loaders: loaders.create() }),
        };
      },
    }),

    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        throttlers: [{ name: 'default', ttl: 60_000, limit: 60 }],
        skipIf: () => config.get('NODE_ENV', { infer: true }) === 'test',
      }),
    }),

    StorageModule,
    AuthModule,
    UsersModule,
    AuthorsModule,
    BooksModule,
    CopiesModule,
    MembersModule,
    LoansModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
