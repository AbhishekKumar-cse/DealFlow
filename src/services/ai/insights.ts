// src/services/ai/insights.ts — High-level AI insight services.
// Each function takes structured facts produced by deterministic engines
// and returns an optional natural-language explanation. If AI fails, the
// caller falls back to deterministic content.
// Server-only — imported only by route handlers.

import { aiChat, parseJsonResponse } from './ai-provider';
import { z } from 'zod';
import { db } from '@/lib/db';
import { evaluateQuoteRisk } from '@/application/risk/risk-service';
import { appConfig } from '@/lib/config';

export interface QuoteRiskFacts {
  quoteId: string;
  quoteNumber: string;
  customerName: string;
  customerTier: string;
  totalCents: number;
  totalDiscountPct: number;
  estimatedMarginPct: number;
  riskScore: number;
  riskBand: string;
  violations: number;
  reasons: string[];
}

export interface QuoteRiskExplanation {
  summary: string;
  customerFacingSummary: string;
  recommendations: string[];
}

const RiskExplanationSchema = z.object({
  summary: z.string(),
  customerFacingSummary: z.string(),
  recommendations: z.array(z.string()),
});

/** Build a natural-language explanation of the quote risk. */
export async function explainQuoteRisk(quoteId: string): Promise<QuoteRiskExplanation> {
  // Gather deterministic facts.
  const quote = await db.quote.findUnique({
    where: { id: quoteId },
    include: { customer: true, lines: true },
  });
  if (!quote) throw new Error('Quote not found');

  // Use persisted risk snapshot if present, else re-evaluate (non-persisting).
  let riskSnapshot: any = null;
  if (quote.riskSnapshot) {
    try {
      riskSnapshot = JSON.parse(quote.riskSnapshot);
    } catch {
      // fall through
    }
  }
  if (!riskSnapshot) {
    const evaluated = await evaluateQuoteRisk(quoteId, { persist: false });
    riskSnapshot = evaluated;
  }

  const facts: QuoteRiskFacts = {
    quoteId: quote.id,
    quoteNumber: quote.number,
    customerName: quote.customer.name,
    customerTier: quote.customer.tier,
    totalCents: quote.totalCents,
    totalDiscountPct:
      quote.subtotalCents > 0
        ? Math.round((quote.discountCents / quote.subtotalCents) * 100)
        : 0,
    estimatedMarginPct: quote.estimatedMarginPct,
    riskScore: riskSnapshot.score ?? quote.riskScore ?? 0,
    riskBand: riskSnapshot.band ?? quote.riskBand ?? 'SAFE',
    violations: riskSnapshot.violations ?? 0,
    reasons: riskSnapshot.reasons ?? [],
  };

  try {
    const system = `You are DealFlow360's risk explainer. You receive structured facts about a quote and produce a clear, business-friendly explanation. You NEVER calculate or override risk — you only explain the facts. Customer-facing text must never mention internal formulas, thresholds, or audit details. Return strict JSON.`;
    const user = `Facts:\n${JSON.stringify(facts, null, 2)}\n\nReturn JSON with keys: "summary" (1-2 sentences for internal staff), "customerFacingSummary" (1 sentence, customer-safe), "recommendations" (array of 2-3 short action items).`;
    const raw = await aiChat(
      [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      { temperature: appConfig.ai.riskTemperature, maxTokens: appConfig.ai.riskMaxTokens },
    );
    return parseJsonResponse(raw, RiskExplanationSchema);
  } catch {
    // Deterministic fallback.
    return {
      summary: `Quote ${facts.quoteNumber} for ${facts.customerName} (${facts.customerTier}) has a risk score of ${facts.riskScore}/100 in the ${facts.riskBand} band with ${facts.violations} discount violation(s).`,
      customerFacingSummary: 'Your quote is under review. We will respond shortly.',
      recommendations: facts.reasons.slice(0, 3),
    };
  }
}

export interface DealSummary {
  quoteId: string;
  quoteNumber: string;
  customerName: string;
  status: string;
  totalCents: number;
  lineCount: number;
  topProduct: string;
  riskBand: string;
  riskScore: number;
}

export interface DealSummaryResult {
  oneLiner: string;
  highlights: string[];
  nextSteps: string[];
}

const DealSummarySchema = z.object({
  oneLiner: z.string(),
  highlights: z.array(z.string()),
  nextSteps: z.array(z.string()),
});

export async function summarizeDeal(quoteId: string): Promise<DealSummaryResult> {
  const quote = await db.quote.findUnique({
    where: { id: quoteId },
    include: { customer: true, lines: true, approvals: true, fulfillmentOrders: true, invoices: true },
  });
  if (!quote) throw new Error('Quote not found');

  const facts: DealSummary = {
    quoteId: quote.id,
    quoteNumber: quote.number,
    customerName: quote.customer.name,
    status: quote.status,
    totalCents: quote.totalCents,
    lineCount: quote.lines.length,
    topProduct: quote.lines[0]?.productName ?? '—',
    riskBand: quote.riskBand ?? '—',
    riskScore: quote.riskScore ?? 0,
  };

  try {
    const system = `You are DealFlow360's deal summarizer. Given structured facts about a quote, produce a one-liner, key highlights, and recommended next steps. Be concise and action-oriented. Return strict JSON.`;
    const user = `Facts:\n${JSON.stringify(facts, null, 2)}\n\nReturn JSON with keys: "oneLiner" (one sentence), "highlights" (3 short bullet strings), "nextSteps" (2-3 short action strings).`;
    const raw = await aiChat(
      [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      { temperature: appConfig.ai.summaryTemperature, maxTokens: appConfig.ai.summaryMaxTokens },
    );
    return parseJsonResponse(raw, DealSummarySchema);
  } catch {
    return {
      oneLiner: `${facts.quoteNumber} for ${facts.customerName}: ${facts.lineCount} line(s), total $${(facts.totalCents / 100).toFixed(2)} — ${facts.status.replace('_', ' ')}.`,
      highlights: [
        `Status: ${facts.status.replace('_', ' ')}`,
        `Risk: ${facts.riskBand} (${facts.riskScore}/100)`,
        `Top product: ${facts.topProduct}`,
      ],
      nextSteps: [
        facts.status === 'PENDING_MANAGER' || facts.status === 'PENDING_FINANCE'
          ? 'Approve or return the quote.'
          : 'Review the quote and confirm if approved.',
      ],
    };
  }
}

export interface TalkingPointsResult {
  opening: string;
  valueProps: string[];
  closing: string;
}

const TalkingPointsSchema = z.object({
  opening: z.string(),
  valueProps: z.array(z.string()),
  closing: z.string(),
});

export async function generateTalkingPoints(quoteId: string): Promise<TalkingPointsResult> {
  const quote = await db.quote.findUnique({
    where: { id: quoteId },
    include: { customer: true, lines: { include: { product: true } } },
  });
  if (!quote) throw new Error('Quote not found');

  const productNames = quote.lines.map((l) => l.productName).join(', ');
  const facts = {
    customerName: quote.customer.name,
    customerTier: quote.customer.tier,
    totalCents: quote.totalCents,
    totalDiscountPct:
      quote.subtotalCents > 0
        ? Math.round((quote.discountCents / quote.subtotalCents) * 100)
        : 0,
    products: productNames,
    marginPct: quote.estimatedMarginPct,
  };

  try {
    const system = `You are DealFlow360's sales coach. Given structured facts about a deal, produce sales talking points the rep can use in a customer conversation. Be specific, friendly, and concise. Return strict JSON.`;
    const user = `Facts:\n${JSON.stringify(facts, null, 2)}\n\nReturn JSON with keys: "opening" (one friendly opening line), "valueProps" (3 short value proposition strings tied to the products/discount), "closing" (one closing line encouraging the next step).`;
    const raw = await aiChat(
      [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      { temperature: appConfig.ai.talkingPointsTemperature, maxTokens: appConfig.ai.talkingPointsMaxTokens },
    );
    return parseJsonResponse(raw, TalkingPointsSchema);
  } catch {
    return {
      opening: `Hi ${facts.customerName}, thanks for the conversation today. I've put together a proposal that I think fits your priorities.`,
      valueProps: [
        `Includes ${facts.products} configured for your team's scale.`,
        `Pricing reflects a ${facts.totalDiscountPct}% discount as a Gold-tier partner.`,
        `Projected margin is healthy at ${facts.marginPct}%, which keeps us sustainable for ongoing support.`,
      ],
      closing: `Could we review this together on a quick call this week?`,
    };
  }
}
