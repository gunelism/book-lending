import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Loan, Member } from '../entities';
import { MembersResolver } from './members.resolver';
import { MembersService } from './members.service';

@Module({
  imports: [TypeOrmModule.forFeature([Member, Loan])],
  providers: [MembersService, MembersResolver],
})
export class MembersModule {}
