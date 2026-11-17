import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Session, User } from '../entities';
import { UsersResolver } from './users.resolver';
import { UsersService } from './users.service';

@Module({
  imports: [TypeOrmModule.forFeature([User, Session])],
  providers: [UsersService, UsersResolver],
  exports: [UsersService],
})
export class UsersModule {}
