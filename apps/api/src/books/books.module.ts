import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Author, Book, Loan } from '../entities';
import { BooksResolver } from './books.resolver';
import { BooksService } from './books.service';
import { CoversController } from './covers.controller';
import { CoversService } from './covers.service';

@Module({
  imports: [TypeOrmModule.forFeature([Book, Author, Loan])],
  controllers: [CoversController],
  providers: [BooksService, BooksResolver, CoversService],
  exports: [BooksService],
})
export class BooksModule {}
