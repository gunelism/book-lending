import { Field, Int, ObjectType } from '@nestjs/graphql';
import { Column, Entity, Index, OneToMany } from 'typeorm';
import { BaseEntity } from './base.entity';
import type { Loan } from './loan.entity';

@Entity('members')
@Index(['lastName', 'firstName'])
@Index('IDX_members_name_trgm', { synchronize: false })
@Index('IDX_members_email_trgm', { synchronize: false })
@ObjectType()
export class Member extends BaseEntity {
  @Field()
  @Column({ type: 'varchar', length: 20, unique: true })
  cardNumber: string;

  @Field()
  @Column({ type: 'varchar', length: 100 })
  firstName: string;

  @Field()
  @Column({ type: 'varchar', length: 100 })
  lastName: string;

  @Field()
  @Column({ type: 'varchar', length: 254, unique: true })
  email: string;

  @Field(() => String, { nullable: true })
  @Column({ type: 'varchar', length: 32, nullable: true })
  phone: string | null;

  @Field()
  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @Field()
  @Column({ type: 'timestamptz', default: () => 'now()' })
  joinedAt: Date;

  @OneToMany('Loan', (loan: Loan) => loan.member)
  loans: Loan[];
}
