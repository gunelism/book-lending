import { Field, Int, ObjectType } from '@nestjs/graphql';
import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { BaseEntity } from './base.entity';
import { CopyCondition, CopyStatus } from './enums';
import type { Book } from './book.entity';
import type { Loan } from './loan.entity';

/** A physical copy of a book on the shelf. Loans are made against copies. */
@Entity('book_copies')
@Index(['bookId', 'status'])
@Index('IDX_copies_barcode_trgm', { synchronize: false })
@ObjectType()
export class BookCopy extends BaseEntity {
  @Field(() => Int)
  @Column({ type: 'int' })
  bookId: number;

  @ManyToOne('Book', (book: Book) => book.copies, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'bookId' })
  book: Book;

  @Field()
  @Column({ type: 'varchar', length: 32, unique: true })
  barcode: string;

  @Field(() => CopyCondition)
  @Column({ type: 'enum', enum: CopyCondition, enumName: 'copy_condition', default: CopyCondition.GOOD })
  condition: CopyCondition;

  @Field(() => CopyStatus)
  @Index()
  @Column({ type: 'enum', enum: CopyStatus, enumName: 'copy_status', default: CopyStatus.AVAILABLE })
  status: CopyStatus;

  @Field()
  @Column({ type: 'timestamptz', default: () => 'now()' })
  acquiredAt: Date;

  @OneToMany('Loan', (loan: Loan) => loan.copy)
  loans: Loan[];
}
