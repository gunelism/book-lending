import { Field, Int, ObjectType } from '@nestjs/graphql';
import { Column, Entity, Index, OneToMany } from 'typeorm';
import { BaseEntity } from './base.entity';
import type { Book } from './book.entity';

@Entity('authors')
@Index(['lastName', 'firstName'])
@Index('IDX_authors_first_name_trgm', { synchronize: false })
@Index('IDX_authors_last_name_trgm', { synchronize: false })
@ObjectType()
export class Author extends BaseEntity {
  @Field()
  @Column({ type: 'varchar', length: 100 })
  firstName: string;

  @Field()
  @Column({ type: 'varchar', length: 100 })
  lastName: string;

  @Field(() => String, { nullable: true })
  @Column({ type: 'text', nullable: true })
  bio: string | null;

  @Field(() => Int, { nullable: true })
  @Column({ type: 'int', nullable: true })
  birthYear: number | null;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', length: 80, nullable: true })
  nationality: string | null;

  @OneToMany('Book', (book: Book) => book.author)
  books: Book[];
}
