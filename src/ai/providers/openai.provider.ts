import OpenAI from 'openai';
import { env } from '../../config/env';
import { AiProvider, AiChatRequest, AiChatResponse } from '../ai.types';

export class OpenAiProvider implements AiProvider {
  private client: OpenAI;

  constructor() {
    if (!env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is required for OpenAI provider');
    }
    this.client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  }

  async chat(request: AiChatRequest): Promise<AiChatResponse> {
    const response = await this.client.chat.completions.create({
      model: request.model,
      max_tokens: request.maxTokens ?? 1024,
      temperature: request.temperature,
      messages: [
        { role: 'system' as const, content: request.systemPrompt },
        ...request.messages.map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        })),
      ],
    });

    const text = response.choices[0]?.message?.content ?? '';
    const usage = response.usage;

    return {
      text,
      model: response.model,
      inputTokens: usage?.prompt_tokens ?? 0,
      outputTokens: usage?.completion_tokens ?? 0,
      totalTokens: usage?.total_tokens ?? 0,
    };
  }
}
