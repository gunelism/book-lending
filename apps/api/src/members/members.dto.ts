import { ArgsType, Field, InputType, Int, ObjectType, PartialType } from '@nestjs/graphql';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsBoolean,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ListArgs, Paginated } from '../common/pagination';
import { Clean, CleanLower } from '../common/sanitize';
import { Member } from '../entities';

@InputType()
export class CreateMemberInput {
  /** Generated automatically when omitted. */
  @Field({ nullable: true })
  @Clean()
  @IsOptional()
  @Matches(/^M\d{7}$/, { message: 'cardNumber must look like M1234567' })
  cardNumber?: string;

  @Field()
  @Clean()
  @IsString()
  @Length(1, 100)
  firstName: string;

  @Field()
  @Clean()
  @IsString()
  @Length(1, 100)
  lastName: string;

  @Field()
  @CleanLower()
  @IsEmail({}, { message: 'email must be a valid email address' })
  @MaxLength(254)
  email: string;

  @Field({ nullable: true })
  @Clean()
  @IsOptional()
  @Matches(/^\+?[\d\s().-]{6,32}$/, { message: 'phone may only contain digits, spaces and + ( ) . -' })
  phone?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

@InputType()
export class UpdateMemberInput extends PartialType(CreateMemberInput) {}

@InputType()
export class MemberFilter {
  @Field(() => [Int], { nullable: true })
  @IsOptional()
  @ArrayMaxSize(500)
  @IsInt({ each: true })
  ids?: number[];

  /** Searches name, email and card number. */
  @Field({ nullable: true })
  @Clean()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @Field({ nullable: true, description: 'Only members with at least one overdue loan' })
  @IsOptional()
  @IsBoolean()
  hasOverdue?: boolean;

  @Field({ nullable: true, description: 'Only members with unpaid fines' })
  @IsOptional()
  @IsBoolean()
  hasUnpaidFines?: boolean;
}

@InputType()
export class BulkMemberActiveInput {
  @Field(() => [Int])
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @IsInt({ each: true })
  ids: number[];

  @Field()
  @IsBoolean()
  isActive: boolean;
}

@ObjectType()
export class MemberPage extends Paginated(Member) {}

@ArgsType()
export class MemberListArgs extends ListArgs {
  @Field(() => MemberFilter, { nullable: true })
  @IsOptional()
  @ValidateNested()
  @Type(() => MemberFilter)
  filter?: MemberFilter;
}
