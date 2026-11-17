import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ServiceUnavailableError } from '../common/errors';
import { Env } from '../config/env';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * Minimal client for any OpenAI-compatible Chat Completions endpoint
 * (Groq, Gemini, OpenRouter, a self-hosted Ollama…). Plain fetch, no SDK:
 * switching provider is only AI_BASE_URL + AI_MODEL + AI_API_KEY.
 */
@Injectable()
export class LlmClient {
  private readonly logger = new Logger(LlmClient.name);
  readonly model: string;
  private readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly timeoutMs: number;
  private readonly reasoningEffort?: string;

  constructor(config: ConfigService<Env, true>) {
    this.model = config.get('AI_MODEL', { infer: true });
    this.baseUrl = config.get('AI_BASE_URL', { infer: true }).replace(/\/+$/, '');
    this.apiKey = config.get('AI_API_KEY', { infer: true }) || undefined;
    this.timeoutMs = config.get('AI_TIMEOUT_MS', { infer: true });
    this.reasoningEffort = config.get('AI_REASONING_EFFORT', { infer: true }) || undefined;
  }

  get enabled(): boolean {
    return !!this.apiKey;
  }

  async complete(messages: ChatMessage[]): Promise<string> {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        // The key is read from the environment on the server only; never logged or sent to the browser.
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
        // max_tokens leaves room for a reasoning model's hidden thinking; low effort keeps answers fast.
        body: JSON.stringify({
          model: this.model,
          messages,
          temperature: 0.2,
          max_tokens: 1500,
          ...(this.reasoningEffort ? { reasoning_effort: this.reasoningEffort } : {}),
        }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err: any) {
      const timedOut = err?.name === 'TimeoutError';
      this.logger.warn(`AI provider ${timedOut ? 'timed out' : `unreachable: ${err?.message ?? err}`}`);
      throw new ServiceUnavailableError(
        'ASSISTANT_UNAVAILABLE',
        timedOut ? 'The help assistant took too long to answer. Please try again.' : 'The help assistant is unavailable right now. The rest of the admin works normally.',
      );
    }

    if (!res.ok) {
      // Provider details go to the log only, never to the client.
      const detail = (await res.text().catch(() => '')).slice(0, 300);
      this.logger.warn(`AI provider returned HTTP ${res.status}: ${detail}`);
      if (res.status === 401 || res.status === 403) {
        throw new ServiceUnavailableError('ASSISTANT_MISCONFIGURED', 'The help assistant is misconfigured (API key rejected). Ask an admin to check AI_API_KEY.');
      }
      // Unknown or retired model (providers retire models regularly), or a wrong AI_BASE_URL.
      if (res.status === 404 || (res.status === 400 && /model/i.test(detail))) {
        this.logger.warn(`Model "${this.model}" is not available at ${this.baseUrl}: set AI_MODEL to a current model of your provider.`);
        throw new ServiceUnavailableError('ASSISTANT_MISCONFIGURED', 'The help assistant is misconfigured (model not available). Ask an admin to check AI_MODEL.');
      }
      if (res.status === 429) {
        throw new ServiceUnavailableError('ASSISTANT_BUSY', 'The help assistant has hit its free-tier limit. Please try again in a minute.');
      }
      throw new ServiceUnavailableError('ASSISTANT_UNAVAILABLE', 'The help assistant is unavailable right now. The rest of the admin works normally.');
    }

    const body: any = await res.json().catch(() => null);
    const text = body?.choices?.[0]?.message?.content;
    if (typeof text !== 'string' || !text.trim()) {
      this.logger.warn(`AI provider returned no text (finish_reason=${body?.choices?.[0]?.finish_reason})`);
      throw new ServiceUnavailableError('ASSISTANT_UNAVAILABLE', 'The help assistant returned no answer. Please try rephrasing.');
    }
    return text.trim();
  }
}
