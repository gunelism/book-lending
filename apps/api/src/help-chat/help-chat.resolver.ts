import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { CurrentUser } from '../auth/decorators';
import { User } from '../entities';
import { AskHelpInput, HelpAnswer, HelpChatStatus } from './help-chat.dto';
import { HelpChatService } from './help-chat.service';

/** Available to every signed-in staff role (global guard); CSRF-protected like all mutations. */
@Resolver()
export class HelpChatResolver {
  constructor(private readonly service: HelpChatService) {}

  @Query(() => HelpChatStatus)
  helpChatStatus() {
    return this.service.status();
  }

  @Mutation(() => HelpAnswer)
  askHelp(@Args('input') input: AskHelpInput, @CurrentUser() user: User) {
    return this.service.ask(input, user);
  }
}
