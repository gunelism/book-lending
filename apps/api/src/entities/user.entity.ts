import { Field, Int, ObjectType } from '@nestjs/graphql';
import { Column, Entity } from 'typeorm';
import { BaseEntity } from './base.entity';
import { Role } from './enums';

/** Staff accounts that log into the admin panel. */
@Entity('users')
@ObjectType()
export class User extends BaseEntity {
  @Field()
  @Column({ type: 'varchar', length: 254, unique: true })
  email: string;

  @Field()
  @Column({ type: 'varchar', length: 120 })
  name: string;

  /** argon2id hash. Null for accounts that only sign in through GitHub. */
  @Column({ type: 'varchar', nullable: true, select: false })
  passwordHash: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true, unique: true })
  githubId: string | null;

  @Field(() => Role)
  @Column({ type: 'enum', enum: Role, enumName: 'role', default: Role.LIBRARIAN })
  role: Role;

  @Field()
  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @Field(() => Date, { nullable: true })
  @Column({ type: 'timestamptz', nullable: true })
  lastLoginAt: Date | null;
}
