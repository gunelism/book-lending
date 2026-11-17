import { Field, Int, ObjectType } from '@nestjs/graphql';
import { Check, Column, Entity, Index, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { BaseEntity } from './base.entity';
import { Genre } from './enums';
import type { Author } from './author.entity';
import type { BookCopy } from './book-copy.entity';

@Entity('books')
@Check('CHK_books_replacement_cost', `"replacementCostCents" >= 0`)
// pg_trgm GIN indexes for fast ILIKE '%term%' search. The operator class can't be
// expressed in a decorator, so they're created in a migration and declared here
// with synchronize: false so TypeORM knows about them and never drops them.
@Index('IDX_books_title_trgm', { synchronize: false })
@Index('IDX_books_isbn_trgm', { synchronize: false })
@ObjectType()
export class Book extends BaseEntity {
  @Field()
  @Column({ type: 'varchar', length: 300 })
  title: string;

  @Field()
  @Column({ type: 'varchar', length: 17, unique: true })
  isbn: string;

  @Field(() => Int, { nullable: true })
  @Column({ type: 'int', nullable: true })
  publishedYear: number | null;

  @Field(() => Genre)
  @Index()
  @Column({ type: 'enum', enum: Genre, enumName: 'genre' })
  genre: Genre;

  @Field(() => String, { nullable: true })
  @Column({ type: 'text', nullable: true })
  description: string | null;

  /** Object-storage key of the cover image — never a local file path. */
  @Column({ type: 'varchar', length: 255, nullable: true })
  coverKey: string | null;

  /** Charged to the member when a copy of this book is lost. */
  @Field(() => Int)
  @Column({ type: 'int', default: 2500 })
  replacementCostCents: number;

  @Field(() => Int)
  @Index()
  @Column({ type: 'int' })
  authorId: number;

  @ManyToOne('Author', (author: Author) => author.books, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'authorId' })
  author: Author;

  @OneToMany('BookCopy', (copy: BookCopy) => copy.book)
  copies: BookCopy[];
}
