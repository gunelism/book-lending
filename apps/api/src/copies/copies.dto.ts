import { ArgsType, Field, InputType, Int, ObjectType } from '@nestjs/graphql';
import { ArrayMaxSize, ArrayMinSize, IsEnum, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min , ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ListArgs, Paginated } from '../common/pagination';
import { Clean } from '../common/sanitize';
import { BookCopy, CopyCondition, CopyStatus } from '../entities';

/** Statuses staff may set by hand. ON_LOAN is only ever set by a checkout. */
export const MANUAL_COPY_STATUSES = [CopyStatus.AVAILABLE, CopyStatus.MAINTENANCE, CopyStatus.LOST] as const;

@InputType()
export class AddCopiesInput {
  @Field(() => Int, { description: "The book these physical copies belong to." })
  @IsInt()
  @Min(1)
  bookId: number;

  @Field(() => Int, { description: "How many identical copies to add at once. Each gets its own generated barcode.", defaultValue: 1 })
  @IsInt()
  @Min(1)
  @Max(50)
  count = 1;

  @Field(() => CopyCondition, { description: "Physical state of the new copies: New, Good, Fair or Poor.", defaultValue: CopyCondition.NEW })
  @IsEnum(CopyCondition)
  condition: CopyCondition = CopyCondition.NEW;
}

@InputType()
export class UpdateCopyInput {
  @Field(() => CopyCondition, { description: "Physical state: New, Good, Fair or Poor. When lending by book, the best-condition copy is chosen first.", nullable: true })
  @IsOptional()
  @IsEnum(CopyCondition)
  condition?: CopyCondition;

  @Field(() => CopyStatus, { description: "Available = on the shelf. Maintenance = out for repair, cannot be lent. Lost = gone. On loan is set only by checkout and return, never by hand; a copy that is on loan cannot be changed here.", nullable: true })
  @IsOptional()
  @IsIn(MANUAL_COPY_STATUSES, { message: 'status can only be set to AVAILABLE, MAINTENANCE or LOST by hand' })
  status?: CopyStatus;
}

@InputType()
export class BulkCopyStatusInput {
  @Field(() => [Int])
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @IsInt({ each: true })
  ids: number[];

  @Field(() => CopyStatus)
  @IsIn([CopyStatus.AVAILABLE, CopyStatus.MAINTENANCE], { message: 'bulk status must be AVAILABLE or MAINTENANCE' })
  status: CopyStatus;
}

@InputType()
export class CopyFilter {
  @Field(() => [Int], { nullable: true })
  @IsOptional()
  @ArrayMaxSize(500)
  @IsInt({ each: true })
  ids?: number[];

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  bookId?: number;

  @Field(() => CopyStatus, { nullable: true })
  @IsOptional()
  @IsEnum(CopyStatus)
  status?: CopyStatus;

  @Field(() => CopyCondition, { nullable: true })
  @IsOptional()
  @IsEnum(CopyCondition)
  condition?: CopyCondition;

  /** Searches barcode and book title. */
  @Field({ nullable: true })
  @Clean()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;
}

@ObjectType()
export class CopyPage extends Paginated(BookCopy) {}

@ArgsType()
export class CopyListArgs extends ListArgs {
  @Field(() => CopyFilter, { nullable: true })
  @IsOptional()
  @ValidateNested()
  @Type(() => CopyFilter)
  filter?: CopyFilter;
}
