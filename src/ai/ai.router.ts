import { env } from '../config/env';
import { AiProvider, ModelTier } from './ai.types';
import { ClaudeProvider } from './providers/claude.provider';
import { OpenAiProvider } from './providers/openai.provider';

let claudeProvider: ClaudeProvider | null = null;
let openaiProvider: OpenAiProvider | null = null;

/** Get the AI provider for a given provider name */
export function getProvider(providerName: 'claude' | 'openai'): AiProvider {
  if (providerName === 'claude') {
    if (!claudeProvider) claudeProvider = new ClaudeProvider();
    return claudeProvider;
  }
  if (!openaiProvider) openaiProvider = new OpenAiProvider();
  return openaiProvider;
}

/** Get the model string for a given tier and provider */
export function getModelForTier(
  providerName: 'claude' | 'openai',
  tier: ModelTier,
): string {
  if (providerName === 'claude') {
    return tier === 'fast' ? env.AI_PRIMARY_MODEL : env.AI_QUALIFICATION_MODEL;
  }
  return tier === 'fast' ? 'gpt-4o-mini' : 'gpt-4o';
}
