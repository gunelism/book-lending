import { Field, Int, ObjectType } from '@nestjs/graphql';
import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from './base.entity';
import { LoanStatus } from './enums';
import type { BookCopy } from './book-copy.entity';
import type { Member } from './member.entity';

@Entity('loans')
@Index(['memberId', 'status'])
@Index(['status', 'dueDate'])
/** A copy can have at most ONE active loan: the database itself prevents double-lending. */
@Index('UQ_loans_one_active_per_copy', ['copyId'], { unique: true, where: `"status" = 'ACTIVE'` })
@Check('CHK_loans_renew_count', `"renewCount" >= 0`)
@Check('CHK_loans_fine', `"fineCents" >= 0`)
@Check('CHK_loans_due_after_loan', `"dueDate" > "loanedAt"`)
@Check('CHK_loans_returned_state', `("status" = 'RETURNED') = ("returnedAt" IS NOT NULL)`)
@ObjectType()
export class Loan extends BaseEntity {
  @Field(() => Int)
  @Index()
  @Column({ type: 'int' })
  copyId: number;

  @ManyToOne('BookCopy', (copy: BookCopy) => copy.loans, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'copyId' })
  copy: BookCopy;

  @Field(() => Int)
  @Column({ type: 'int' })
  memberId: number;

  @ManyToOne('Member', (member: Member) => member.loans, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'memberId' })
  member: Member;

  @Field()
  @Index()
  @Column({ type: 'timestamptz', default: () => 'now()' })
  loanedAt: Date;

  @Field()
  @Column({ type: 'timestamptz' })
  dueDate: Date;

  @Field(() => Date, { nullable: true })
  @Column({ type: 'timestamptz', nullable: true })
  returnedAt: Date | null;

  @Field(() => Int)
  @Column({ type: 'int', default: 0 })
  renewCount: number;

  @Field(() => LoanStatus)
  @Column({ type: 'enum', enum: LoanStatus, enumName: 'loan_status', default: LoanStatus.ACTIVE })
  status: LoanStatus;

  /** Fine charged when the loan was closed (late return or lost copy). */
  @Field(() => Int)
  @Column({ type: 'int', default: 0 })
  fineCents: number;

  @Field()
  @Column({ type: 'boolean', default: false })
  finePaid: boolean;
}
