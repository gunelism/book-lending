import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Book, BookCopy, Loan } from '../entities';
import { CopiesResolver } from './copies.resolver';
import { CopiesService } from './copies.service';

@Module({
  imports: [TypeOrmModule.forFeature([BookCopy, Book, Loan])],
  providers: [CopiesService, CopiesResolver],
})
export class CopiesModule {}
