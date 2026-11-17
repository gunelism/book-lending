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
  @Field({ description: "The staff member's sign-in email. Must be unique." })
  @CleanLower()
  @IsEmail()
  @MaxLength(254)
  email: string;

  @Field({ description: "Display name shown in the admin." })
  @Clean()
  @IsString()
  @Length(1, 120)
  name: string;

  @Field(() => Role, { description: "Admin: everything, including catalogue edits, deletions, staff accounts and waiving fines. Librarian: lending, returns, renewals and members; the catalogue is read-only." })
  @IsEnum(Role)
  role: Role;

  @Field({ description: "At least 12 characters, with an upper-case letter, a lower-case letter and a digit. Stored only as an argon2id hash." })
  @IsString()
  @Length(PASSWORD_RULES.minLength, PASSWORD_RULES.maxLength, { message: PASSWORD_RULES.message })
  @Matches(PASSWORD_RULES.pattern, { message: PASSWORD_RULES.message })
  password: string;

  @Field({ description: "Inactive staff cannot sign in, and their open sessions end immediately. New GitHub sign-ups start inactive until an admin activates them.", nullable: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

@InputType()
export class UpdateUserInput {
  @Field({ description: "Display name shown in the admin.", nullable: true })
  @Clean()
  @IsOptional()
  @IsString()
  @Length(1, 120)
  name?: string;

  @Field(() => Role, { description: "Admin: everything, including catalogue edits, deletions, staff accounts and waiving fines. Librarian: lending, returns, renewals and members; the catalogue is read-only. You cannot change your own role.", nullable: true })
  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @Field({ description: "Inactive staff cannot sign in, and their open sessions end immediately. You cannot deactivate yourself.", nullable: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  /** Set a new password (also signs the user out everywhere). */
  @Field({ description: "Leave empty to keep the current password. A new one needs 12+ characters with upper-case, lower-case and a digit, and signs the user out everywhere.", nullable: true })
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
