import { ArgsType, Field, InputType, Int, ObjectType } from '@nestjs/graphql';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsBoolean,
  IsDate,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ListArgs, Paginated } from '../common/pagination';
import { Clean } from '../common/sanitize';
import { Loan, LoanDisplayStatus } from '../entities';

/** Lend a copy. Identify the copy by exactly one of copyId, barcode or bookId (any available copy). */
@InputType()
export class CheckoutInput {
  @Field(() => Int, { description: "Who is borrowing. Only active members in good standing can borrow; the New loan form shows live whether the chosen member is allowed, and why not." })
  @IsInt()
  @Min(1)
  memberId: number;

  @Field(() => Int, { description: "A specific physical copy by internal id (for integrations; the admin form uses Book or Barcode instead).", nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  copyId?: number;

  @Field({ description: "Scan or type the barcode sticker on the copy (e.g. LIB000000042) to lend that exact copy. Fill in Barcode OR Book, not both.", nullable: true })
  @Clean()
  @IsOptional()
  @Matches(/^[A-Z0-9-]{4,32}$/, { message: 'barcode has an invalid format' })
  barcode?: string;

  @Field(() => Int, { description: "Lend any available copy of this book; the copy in the best condition is picked automatically. Fill in Book OR Barcode, not both. Only books with a copy on the shelf are listed.", nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  bookId?: number;

  @Field({ description: "Optional. Leave empty for the standard 14-day loan. If you set it, it must be in the future and at most 60 days away.", nullable: true })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  dueDate?: Date;
}

@InputType()
export class LoanFilter {
  @Field(() => [Int], { nullable: true })
  @IsOptional()
  @ArrayMaxSize(500)
  @IsInt({ each: true })
  ids?: number[];

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  memberId?: number;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  copyId?: number;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  bookId?: number;

  /** Filters on the displayed status, including the computed OVERDUE. */
  @Field(() => LoanDisplayStatus, { nullable: true })
  @IsOptional()
  @IsEnum(LoanDisplayStatus)
  status?: LoanDisplayStatus;

  /** Searches member name / card number, book title and copy barcode. */
  @Field({ nullable: true })
  @Clean()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @Field({ nullable: true })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  loanedFrom?: Date;

  @Field({ nullable: true })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  loanedTo?: Date;

  @Field({ nullable: true, description: 'Only loans with an outstanding fine' })
  @IsOptional()
  @IsBoolean()
  unpaidFine?: boolean;
}

@InputType()
export class LoanIdsInput {
  @Field(() => [Int])
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @IsInt({ each: true })
  ids: number[];
}

@ObjectType()
export class LoanPage extends Paginated(Loan) {}

@ArgsType()
export class LoanListArgs extends ListArgs {
  @Field(() => LoanFilter, { nullable: true })
  @IsOptional()
  @ValidateNested()
  @Type(() => LoanFilter)
  filter?: LoanFilter;
}
