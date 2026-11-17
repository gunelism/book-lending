import { Module } from '@nestjs/common';
import { FormsModule } from '../forms/forms.module';
import { HelpChatResolver } from './help-chat.resolver';
import { HelpChatService } from './help-chat.service';
import { LlmClient } from './llm.client';

@Module({
  imports: [FormsModule],
  providers: [LlmClient, HelpChatService, HelpChatResolver],
})
export class HelpChatModule {}
