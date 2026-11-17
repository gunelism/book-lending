import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Author, Book } from '../entities';
import { AuthorsResolver } from './authors.resolver';
import { AuthorsService } from './authors.service';

@Module({
  imports: [TypeOrmModule.forFeature([Author, Book])],
  providers: [AuthorsService, AuthorsResolver],
  exports: [AuthorsService],
})
export class AuthorsModule {}
