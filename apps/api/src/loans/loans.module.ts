import { Module } from '@nestjs/common';
import { LoansResolver } from './loans.resolver';
import { LoansService } from './loans.service';

@Module({
  providers: [LoansService, LoansResolver],
  exports: [LoansService],
})
export class LoansModule {}
