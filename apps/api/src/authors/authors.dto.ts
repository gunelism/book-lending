import { ArgsType, Field, InputType, Int, ObjectType, PartialType } from '@nestjs/graphql';
import { ArrayMaxSize, IsInt, IsOptional, IsString, Length, Max, MaxLength, Min , ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ListArgs, Paginated } from '../common/pagination';
import { Clean } from '../common/sanitize';
import { Author } from '../entities';

@InputType()
export class CreateAuthorInput {
  @Field({ description: "Given name, as printed on the book." })
  @Clean()
  @IsString()
  @Length(1, 100)
  firstName: string;

  @Field({ description: "Family name. The author list is sorted by it." })
  @Clean()
  @IsString()
  @Length(1, 100)
  lastName: string;

  @Field({ description: "Short biography. Optional plain text.", nullable: true })
  @Clean()
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  bio?: string;

  @Field(() => Int, { description: "Year of birth, if known. Optional.", nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1000)
  @Max(new Date().getFullYear())
  birthYear?: number;

  @Field({ description: "Used to filter the author list. Optional.", nullable: true })
  @Clean()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  nationality?: string;
}

@InputType()
export class UpdateAuthorInput extends PartialType(CreateAuthorInput) {}

@InputType()
export class AuthorFilter {
  @Field(() => [Int], { nullable: true })
  @IsOptional()
  @ArrayMaxSize(500)
  @IsInt({ each: true })
  ids?: number[];

  /** Searches first + last name. */
  @Field({ nullable: true })
  @Clean()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @Field({ nullable: true })
  @Clean()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  nationality?: string;
}

@ObjectType()
export class AuthorPage extends Paginated(Author) {}

@ArgsType()
export class AuthorListArgs extends ListArgs {
  @Field(() => AuthorFilter, { nullable: true })
  @IsOptional()
  @ValidateNested()
  @Type(() => AuthorFilter)
  filter?: AuthorFilter;
}
