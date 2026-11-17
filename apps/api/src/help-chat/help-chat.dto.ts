import { Field, InputType, ObjectType, registerEnumType } from '@nestjs/graphql';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsEnum, IsOptional, IsString, Length, ValidateNested } from 'class-validator';
import { Clean } from '../common/sanitize';
import { FormName } from '../forms/form-registry';

export enum ChatRole {
  USER = 'user',
  ASSISTANT = 'assistant',
}
registerEnumType(ChatRole, { name: 'ChatRole' });

/** Earlier turns of the same conversation, so follow-up questions make sense. */
@InputType()
export class ChatTurnInput {
  @Field(() => ChatRole)
  @IsEnum(ChatRole)
  role: ChatRole;

  @Field()
  @Clean()
  @IsString()
  @Length(1, 4000)
  content: string;
}

@InputType()
export class AskHelpInput {
  @Field(() => FormName, { nullable: true, description: 'The form the user is looking at, if any' })
  @IsOptional()
  @IsEnum(FormName)
  form?: FormName;

  @Field({ description: 'The question, e.g. "What does Replacement cost mean?"' })
  @Clean()
  @IsString()
  @Length(1, 500, { message: 'question must be between 1 and 500 characters' })
  question: string;

  @Field(() => [ChatTurnInput], { nullable: true })
  @IsOptional()
  @ArrayMaxSize(8, { message: 'at most 8 earlier turns can be sent' })
  @ValidateNested({ each: true })
  @Type(() => ChatTurnInput)
  history?: ChatTurnInput[];
}

@ObjectType()
export class HelpAnswer {
  @Field()
  answer: string;
}

@ObjectType()
export class HelpChatStatus {
  @Field()
  enabled: boolean;

  @Field()
  model: string;
}
