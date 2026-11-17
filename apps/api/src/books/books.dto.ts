import { ArgsType, Field, InputType, Int, ObjectType, PartialType } from '@nestjs/graphql';
import {
  ArrayMaxSize,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ListArgs, Paginated } from '../common/pagination';
import { Clean } from '../common/sanitize';
import { Book, Genre } from '../entities';

const CURRENT_YEAR = new Date().getFullYear();

@InputType()
export class CreateBookInput {
  @Field({ description: "The title as printed on the cover, including any subtitle after a colon." })
  @Clean()
  @IsString()
  @Length(1, 300)
  title: string;

  /** ISBN-10 or ISBN-13, digits with optional hyphens. Checksum verified in the service. */
  @Field({ description: "The edition's ISBN, from the back cover or copyright page. ISBN-13 (e.g. 978-0-306-40615-7) or ISBN-10; hyphens and spaces are optional. The check digit is verified, so a mistyped ISBN is rejected. Must be unique: one catalogue entry per edition." })
  @Clean()
  @Matches(/^(97[89][- ]?)?\d{1,5}[- ]?\d{1,7}[- ]?\d{1,7}[- ]?[\dX]$/, { message: 'isbn must be a valid ISBN-10 or ISBN-13' })
  isbn: string;

  @Field(() => Int, { description: "Year this edition was published, from the copyright page. Optional.", nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1450)
  @Max(CURRENT_YEAR + 1)
  publishedYear?: number;

  @Field(() => Genre, { description: "Main shelf category, used to filter the catalogue. Pick the closest one." })
  @IsEnum(Genre)
  genre: Genre;

  @Field({ description: "Short blurb for staff. Optional plain text.", nullable: true })
  @Clean()
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @Field(() => Int, { description: "What a member is charged if they lose a copy. Stored in euro cents; the admin form takes euros (enter 25 for EUR 25.00). Defaults to EUR 25.00.", nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100_000)
  replacementCostCents?: number;

  @Field(() => Int, { description: "The book's author. Pick an existing author; if they are missing, create them first under Authors." })
  @IsInt()
  @Min(1)
  authorId: number;
}

@InputType()
export class UpdateBookInput extends PartialType(CreateBookInput) {}

@InputType()
export class BookFilter {
  @Field(() => [Int], { nullable: true })
  @IsOptional()
  @ArrayMaxSize(500)
  @IsInt({ each: true })
  ids?: number[];

  /** Searches title, ISBN and author name. */
  @Field({ nullable: true })
  @Clean()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  authorId?: number;

  @Field(() => Genre, { nullable: true })
  @IsOptional()
  @IsEnum(Genre)
  genre?: Genre;

  /** true = at least one copy on the shelf; false = none available. */
  @Field({ nullable: true })
  @IsOptional()
  @IsBoolean()
  available?: boolean;

  @Field({ nullable: true })
  @IsOptional()
  @IsBoolean()
  hasCover?: boolean;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  publishedFrom?: number;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  publishedTo?: number;
}

@ObjectType()
export class BookPage extends Paginated(Book) {}

@ArgsType()
export class BookListArgs extends ListArgs {
  @Field(() => BookFilter, { nullable: true })
  @IsOptional()
  @ValidateNested()
  @Type(() => BookFilter)
  filter?: BookFilter;
}
