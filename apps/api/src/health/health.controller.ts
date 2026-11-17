import { Controller, Get, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import { DataSource } from 'typeorm';
import { Public } from '../auth/decorators';
import { Env } from '../config/env';
import { StorageService } from '../storage/storage.service';

/**
 * Liveness/readiness for load balancers and uptime checks.
 *  - database down -> 503 (the app can't work)
 *  - storage down  -> 200 "degraded" (everything except cover images works)
 * Only up/down states are exposed, never hosts or error details.
 */
@Controller('api/health')
export class HealthController {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly storage: StorageService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Public()
  @SkipThrottle()
  @Get()
  async health(@Res({ passthrough: true }) res: Response) {
    const database = await this.ds
      .query('SELECT 1')
      .then(() => 'up')
      .catch(() => 'down');
    const storage = (await this.storage.isHealthy()) ? 'up' : 'down';
    const helpChat = this.config.get('AI_API_KEY', { infer: true }) ? 'enabled' : 'disabled';

    const status = database === 'down' ? 'down' : storage === 'down' ? 'degraded' : 'ok';
    if (status === 'down') res.status(503);
    return { status, database, storage, helpChat };
  }
}
