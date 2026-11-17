import { ArgsType, Field, InputType, Int, ObjectType } from '@nestjs/graphql';
import {
  ArrayMaxSize,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { PASSWORD_RULES } from '../auth/password';
import { Type } from 'class-transformer';
import { ListArgs, Paginated } from '../common/pagination';
import { Clean, CleanLower } from '../common/sanitize';
import { Role, User } from '../entities';

@InputType()
export class CreateUserInput {
  @Field()
  @CleanLower()
  @IsEmail()
  @MaxLength(254)
  email: string;

  @Field()
  @Clean()
  @IsString()
  @Length(1, 120)
  name: string;

  @Field(() => Role)
  @IsEnum(Role)
  role: Role;

  @Field()
  @IsString()
  @Length(PASSWORD_RULES.minLength, PASSWORD_RULES.maxLength, { message: PASSWORD_RULES.message })
  @Matches(PASSWORD_RULES.pattern, { message: PASSWORD_RULES.message })
  password: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

@InputType()
export class UpdateUserInput {
  @Field({ nullable: true })
  @Clean()
  @IsOptional()
  @IsString()
  @Length(1, 120)
  name?: string;

  @Field(() => Role, { nullable: true })
  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @Field({ nullable: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  /** Set a new password (also signs the user out everywhere). */
  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @Length(PASSWORD_RULES.minLength, PASSWORD_RULES.maxLength, { message: PASSWORD_RULES.message })
  @Matches(PASSWORD_RULES.pattern, { message: PASSWORD_RULES.message })
  password?: string;
}

@InputType()
export class UserFilter {
  @Field(() => [Int], { nullable: true })
  @IsOptional()
  @ArrayMaxSize(500)
  @IsInt({ each: true })
  ids?: number[];

  @Field({ nullable: true })
  @Clean()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @Field(() => Role, { nullable: true })
  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @Field({ nullable: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

@ObjectType()
export class UserPage extends Paginated(User) {}

@ArgsType()
export class UserListArgs extends ListArgs {
  @Field(() => UserFilter, { nullable: true })
  @IsOptional()
  @ValidateNested()
  @Type(() => UserFilter)
  filter?: UserFilter;
}
