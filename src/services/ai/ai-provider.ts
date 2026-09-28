// src/services/ai/ai-provider.ts — Isolated AI provider abstraction.
// Wraps z-ai-web-dev-sdk so the rest of the app is provider-agnostic.
// AI is NEVER authoritative — it only explains/summarizes deterministic
// facts produced by the engines. All AI responses are Zod-validated.
//
// This file is imported only from server-side modules (route handlers
// and other server-only services) — the SDK must never run in the browser.

import ZAI from 'z-ai-web-dev-sdk';
import { z } from 'zod';
import { appConfig } from '@/lib/config';

export interface AiChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AiChatOptions {
  temperature?: number;
  maxTokens?: number;
}

/**
 * Call the AI chat completion endpoint. Returns the assistant text.
 * Throws on failure so callers can fall back to deterministic content.
 */
export async function aiChat(
  messages: AiChatMessage[],
  options: AiChatOptions = {},
): Promise<string> {
  if (!appConfig.ai.enabled) throw new Error('AI provider is disabled by configuration.');
  const sdk = await ZAI.create();
  const res = await sdk.chat.completions.create({
    messages,
    temperature: options.temperature ?? appConfig.ai.defaultTemperature,
    max_tokens: options.maxTokens ?? appConfig.ai.defaultMaxTokens,
  });
  const content = res.choices?.[0]?.message?.content;
  if (!content) throw new Error('AI returned empty content');
  return content.trim();
}

/** Parse a JSON code block from an LLM response. */
export function parseJsonResponse<T>(raw: string, schema: z.ZodType<T>): T {
  // Strip ```json fences if present.
  let cleaned = raw.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/```$/i, '').trim();
  }
  const json = JSON.parse(cleaned);
  return schema.parse(json);
}

/** Flag used by AI UI to label content. */
export const AI_LABEL = 'AI Insight';
