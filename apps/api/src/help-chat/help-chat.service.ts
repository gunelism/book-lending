import { BadRequestException, HttpStatus, Injectable } from '@nestjs/common';
import { ServiceUnavailableError } from '../common/errors';
import { User } from '../entities';
import { FormName } from '../forms/form-registry';
import { FormDefinition, FormsService } from '../forms/forms.service';
import { AskHelpInput, ChatRole, HelpAnswer, HelpChatStatus } from './help-chat.dto';
import { LlmClient } from './llm.client';

const MAX_REQUESTS_PER_MINUTE = 10;

const SYSTEM_PROMPT = `You are the help assistant in the staff admin of a library lending app. Staff ask what form fields mean and how to fill forms in.

Answer ONLY from the form definitions below: each field's help text, type, whether it is required, its allowed options and its validation rules, plus each form's purpose. If the answer is not there, say you don't know and suggest asking an administrator. Never invent fields, rules or features.
Use the field labels the user sees (e.g. "Replacement cost (€)"), not internal names. Be brief: 1–4 sentences or a short list, plain text, no markdown headings. Give a concrete example value when it helps.`;

/** Compact, readable form definition (fewer tokens than JSON, which matters on free tiers). */
function renderForm(form: FormDefinition): string {
  const lines = [`FORM "${form.title}" — ${form.purpose}`];
  for (const f of form.fields) {
    const facts = [
      f.required ? 'required' : 'optional',
      f.type,
      f.options ? `options: ${f.options.join(', ')}` : null,
      ...f.rules,
    ].filter(Boolean);
    lines.push(`- ${f.label} [${facts.join('; ')}]: ${f.help}`);
  }
  return lines.join('\n');
}

/**
 * "How do I fill this out?" help chat. Deliberately small: one completion per
 * question, grounded in the real form definitions (field help text +
 * validation rules from the API schema), no tools, agents or vector store.
 */
@Injectable()
export class HelpChatService {
  /** userId -> request timestamps in the last minute (simple per-user rate limit). */
  private readonly recent = new Map<number, number[]>();

  constructor(
    private readonly forms: FormsService,
    private readonly llm: LlmClient,
  ) {}

  status(): HelpChatStatus {
    return { enabled: this.llm.enabled, model: this.llm.model };
  }

  /** The system prompt: the current form in full, other forms more briefly. */
  buildContext(current?: FormName): string {
    const all = this.forms.all();
    const parts = [SYSTEM_PROMPT];
    if (current) {
      parts.push(`The user is on the "${this.forms.get(current).title}" form.\n\n${renderForm(this.forms.get(current))}`);
      parts.push(`Other forms in the admin: ${all.filter((f) => f.name !== current).map((f) => `${f.title} (${f.fields.map((x) => x.label).join(', ')})`).join('; ')}.`);
    } else {
      parts.push(`The user is not on a specific form. All forms:\n\n${all.map(renderForm).join('\n\n')}`);
    }
    return parts.join('\n\n');
  }

  async ask(input: AskHelpInput, user: User): Promise<HelpAnswer> {
    if (!this.llm.enabled) {
      throw new ServiceUnavailableError('ASSISTANT_DISABLED', 'The help assistant is not configured (no AI_API_KEY set).');
    }
    const history = input.history ?? [];
    const alternates = history.length % 2 === 0 && history.every((t, i) => t.role === (i % 2 ? ChatRole.ASSISTANT : ChatRole.USER));
    if (!alternates) throw new BadRequestException('history must alternate user / assistant turns, starting with the user');
    this.checkRateLimit(user.id);

    const answer = await this.llm.complete([
      { role: 'system', content: this.buildContext(input.form) },
      ...history.map((t) => ({ role: t.role, content: t.content })),
      { role: 'user', content: input.question },
    ]);
    return { answer };
  }

  private checkRateLimit(userId: number) {
    const now = Date.now();
    const hits = (this.recent.get(userId) ?? []).filter((t) => now - t < 60_000);
    if (hits.length >= MAX_REQUESTS_PER_MINUTE) {
      throw new ServiceUnavailableError('TOO_MANY_REQUESTS', 'Too many questions in a minute — please wait a moment.', HttpStatus.TOO_MANY_REQUESTS);
    }
    hits.push(now);
    this.recent.set(userId, hits);
  }
}
