import { Controller, Get } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { SkipThrottle } from '@nestjs/throttler';
import { DataSource } from 'typeorm';
import { Public } from '../auth/decorators';

@Controller('api/health')
export class HealthController {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  @Public()
  @SkipThrottle()
  @Get()
  async health() {
    await this.ds.query('SELECT 1');
    return { status: 'ok' };
  }
}
