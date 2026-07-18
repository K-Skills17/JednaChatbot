import crypto from 'crypto';
import { prisma } from '../config/database';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { sendMessage } from '../modules/whatsapp/message.sender';
import { getProvider, getModelForTier } from './ai.router';
import { buildSystemPrompt } from './prompts/system.prompt';
import { buildQualificationPrompt } from './prompts/qualification.prompt';
import { bookingService } from '../modules/booking/booking.service';
import { campaignService } from '../modules/campaign/campaign.service';
import { notificationService } from '../modules/notification/notification.service';
import { reviewService } from '../modules/review/review.service';
import { parseEnvelope, ConciergeEnvelope } from '../concierge/envelope';
import { runComplianceGate, SAFE_HANDOFF_REPLY, ComplianceResult } from '../concierge/compliance';
import { scoreQualification, QualificationRules, QualificationData } from '../concierge/qualification';
import { redactPhi } from '../utils/phi-redact';
import {
  MessageJobData,
  AiMessage,
  AiAction,
  ConversationContext,
  ModelTier,
} from './ai.types';

// ── Plan Limits ──────────────────────────────────────────────
const PLAN_LIMITS: Record<string, { messagesPerMonth: number | null; aiCostMonthlyUsd: number | null }> = {
  starter:    { messagesPerMonth: 1000,  aiCostMonthlyUsd: 50 },
  pro:        { messagesPerMonth: 10000, aiCostMonthlyUsd: 500 },
  enterprise: { messagesPerMonth: null,  aiCostMonthlyUsd: null },
};

const DEFAULT_CONTEXT: ConversationContext = {
  state: 'greeting',
  extractedData: {},
  qualificationComplete: false,
  messageCount: 0,
};

const MAX_HISTORY_MESSAGES = 20;

// TCPA-required opt-out keywords — checked BEFORE AI
const OPT_OUT_KEYWORDS = ['stop', 'unsubscribe', 'cancel', 'quit', 'end'];

/** Main entry point — processes a single inbound message through the AI engine */
export async function processMessage(job: MessageJobData): Promise<void> {
  const { tenantId, contactId, conversationId, phone, text, messageType } = job;
  const channel: string = (job as any).channel ?? 'sms';

  // 1. Load tenant
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant || tenant.status !== 'active') {
    logger.warn({ tenantId }, 'Skipping message for inactive/missing tenant');
    return;
  }

  // 1b. Check plan limits
  const limitExceeded = await checkPlanLimits(tenant);
  if (limitExceeded) {
    logger.warn({ tenantId, plan: tenant.plan, reason: limitExceeded }, 'Plan limit exceeded');
    await sendMessage({
      tenantId,
      conversationId,
      instanceName: tenant.evolutionInstanceId ?? undefined,
      phone,
      channel,
      text: "We've reached our monthly message limit. Please call the office directly — we'd love to help you.",
    });
    return;
  }

  // 2. Load contact
  const contact = await prisma.contact.findUnique({ where: { id: contactId } });
  if (!contact) {
    logger.warn({ contactId }, 'Contact not found');
    return;
  }

  // 3. Check opt-out
  if (contact.optedOut) {
    logger.info({ phone }, 'Ignoring message from opted-out contact');
    return;
  }

  if (text && isOptOut(text)) {
    await handleOptOut(tenantId, contactId, conversationId, phone, channel, tenant.evolutionInstanceId);
    await insertEvent(tenantId, contactId, 'opt_out', { phone });
    return;
  }

  // 4. Load conversation
  const conversation = await prisma.conversation.findUnique({ where: { id: conversationId } });
  if (!conversation || conversation.status === 'closed') {
    logger.warn({ conversationId }, 'Conversation not found or closed');
    return;
  }

  // 5. Parse existing context or create default
  const rawContext = conversation.context as Record<string, any> | null;
  const context: ConversationContext = rawContext
    ? { ...DEFAULT_CONTEXT, ...rawContext }
    : { ...DEFAULT_CONTEXT };

  // 5b. Check human takeover
  if (rawContext?.humanTakeoverUntil) {
    const takeoverEnd = new Date(rawContext.humanTakeoverUntil);
    if (takeoverEnd > new Date()) {
      logger.info({ phone, humanTakeoverUntil: rawContext.humanTakeoverUntil }, 'Skipping AI — human operator active');
      return;
    }
    const { humanTakeoverUntil: _, ...cleanContext } = rawContext;
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { context: cleanContext },
    });
  }

  // 5c. Intercept review responses
  if (context.state === 'awaiting_review' && context.pendingReviewId && text) {
    const handled = await handleReviewResponse(tenant, contact, context, conversationId, phone, channel, text);
    if (handled) {
      await incrementMessageCount(tenantId);
      return;
    }
  }

  // 6. Handle non-text messages
  const aiConfig = tenant.aiConfig as Record<string, any>;
  const effectiveText = resolveMessageText(text, messageType);

  // 7. Load recent conversation history (with PHI redaction for AI context)
  const history = await loadHistory(conversationId);

  // 8. Build system prompt
  const systemPrompt = buildSystemPrompt(
    {
      businessName: tenant.businessName,
      timezone: tenant.timezone,
      businessHours: tenant.businessHours as { start: string; end: string; days: number[] },
      aiConfig: {
        systemPrompt: aiConfig.systemPrompt,
        qualificationCriteria: aiConfig.qualificationCriteria ?? [],
        businessDescription: aiConfig.businessDescription,
        services: aiConfig.services,
        faq: aiConfig.faq,
        targetAudience: aiConfig.targetAudience,
        tone: aiConfig.tone,
        greeting: aiConfig.greeting,
        closingMessage: aiConfig.closingMessage,
        escalationRules: aiConfig.escalationRules,
        forbiddenTopics: aiConfig.forbiddenTopics,
        painPoints: aiConfig.painPoints,
        dreamOutcome: aiConfig.dreamOutcome,
        uniqueMechanism: aiConfig.uniqueMechanism,
        socialProof: aiConfig.socialProof,
        scarcity: aiConfig.scarcity,
        urgency: aiConfig.urgency,
        leadMagnet: aiConfig.leadMagnet,
        referralIncentive: aiConfig.referralIncentive,
      },
    },
    {
      name: contact.name,
      phone: contact.phone,
      leadScore: contact.leadScore,
      leadStatus: contact.leadStatus,
      qualificationData: contact.qualificationData as Record<string, any> | null,
    },
    context,
  );

  // 9. Select model tier and provider
  const providerName: 'claude' | 'openai' = aiConfig.model ?? env.AI_PRIMARY_PROVIDER;
  const tier: ModelTier = 'fast';
  const provider = getProvider(providerName);
  const model = getModelForTier(providerName, tier);

  // 10. Call AI
  const aiResponse = await provider.chat({
    systemPrompt,
    messages: [...history, { role: 'user', content: effectiveText }],
    model,
    temperature: aiConfig.temperature ?? 0.7,
  });

  // 11. Parse structured response via envelope parser (safe degradation on malformed JSON)
  const envelope = parseEnvelope(aiResponse.text);

  // 12. Run compliance gate unconditionally (TCPA / dental board — not optional)
  let finalReply = envelope.reply;
  let action = envelope.action;
  let handoffReason = envelope.handoff_reason;

  const complianceResult = runComplianceGate(envelope.reply, envelope.compliance_flag);
  if (!complianceResult.passed) {
    finalReply = SAFE_HANDOFF_REPLY;
    action = 'handoff';
    handoffReason = handoffReason ?? 'compliance';
    logger.warn(
      { phone, flaggedTerms: complianceResult.flaggedTerms },
      'Compliance gate blocked outbound message',
    );
  }

  // 13. Substitute {{PLACEHOLDER}} tokens with env-driven values
  finalReply = substitutePlaceholders(finalReply, aiConfig);

  // 14. Enforce 300-character SMS limit
  if (channel === 'sms' && finalReply.length > 300) {
    finalReply = finalReply.slice(0, 297) + '...';
    logger.warn({ phone, originalLength: envelope.reply.length }, 'Reply truncated to 300 chars for SMS');
  }

  // 15. Build the legacy AiAction from the envelope
  const aiAction = envelopeToAction(envelope, finalReply, action);

  // 16. If qualification decision, run smart model for scoring
  if (
    aiAction.nextState === 'qualified' &&
    !context.qualificationComplete
  ) {
    const qualResult = await runQualificationEvaluation(tenant, contact, context, history, providerName);
    if (qualResult) {
      aiAction.leadScore = qualResult.leadScore;
      aiAction.leadStatus = qualResult.leadStatus as any;
      aiAction.qualificationReasoning = qualResult.reasoning;
    }
  }

  // 16b. Run deterministic qualification scoring if tenant has qualification rules
  const qualRules = (tenant as any).qualificationRules as QualificationRules | null;
  if (qualRules && envelope.qualification && Object.keys(envelope.qualification).length > 0) {
    const existingQual = (contact.qualificationData as Partial<QualificationData>) ?? {};
    const merged: Partial<QualificationData> = { ...existingQual };
    for (const [k, v] of Object.entries(envelope.qualification)) {
      if (v !== null && v !== undefined) (merged as any)[k] = v;
    }
    const { score, qualified } = scoreQualification(merged, qualRules);
    aiAction.leadScore = score;
    if (qualified && !aiAction.leadStatus) {
      aiAction.leadStatus = 'qualified';
    }
    aiAction.extractedData = { ...aiAction.extractedData, ...merged };
  }

  // 17. Create booking if AI confirmed a date/time
  if (aiAction.bookingDate && aiAction.bookingTime && action === 'book') {
    try {
      const scheduledAt = parseBookingDateTime(aiAction.bookingDate, aiAction.bookingTime, tenant.timezone);
      if (scheduledAt) {
        await bookingService.create({
          tenantId,
          contactId,
          scheduledAt,
          appointmentType: context.extractedData?.appointmentType ?? undefined,
          notes: `Booked via chatbot. ${context.extractedData?.notes ?? ''}`.trim(),
        });
        aiAction.leadStatus = 'booked';
      }
    } catch (err) {
      logger.error({ err }, 'Failed to create booking from AI action');
    }
  } else if (action === 'book' && !aiAction.bookingDate) {
    const qualData = envelope.qualification as Partial<QualificationData>;
    const preferredDay = qualData.preferred_day as string | undefined;
    const preferredPeriod = qualData.preferred_period as string | undefined;
    if (preferredDay || preferredPeriod) {
      try {
        await prisma.booking.create({
          data: {
            id: crypto.randomUUID(),
            tenantId,
            contactId,
            appointmentType: context.extractedData?.appointmentType ?? 'consultation',
            preferredDay: preferredDay ?? null,
            preferredPeriod: preferredPeriod ?? null,
            status: 'requested',
            notes: `Booked via chatbot. ${envelope.handoff_summary ?? ''}`.trim(),
          },
        });
        aiAction.leadStatus = 'booked';
      } catch (err) {
        logger.error({ err }, 'Failed to create preference-based booking');
      }
    }
  }

  // 18. Send reply (channel-aware)
  await sendMessage({
    tenantId,
    conversationId,
    instanceName: tenant.evolutionInstanceId ?? undefined,
    phone,
    channel,
    text: finalReply,
  });

  // 19. Update outbound message with AI metadata and cost tracking
  const costUsd = calculateAiCost(model, aiResponse.inputTokens, aiResponse.outputTokens);
  await updateLastOutboundMessage(conversationId, model, aiResponse.totalTokens, costUsd);
  await trackTenantAiCost(tenantId, costUsd);

  // 20. Log compliance audit (every outbound, always — defensible legal record)
  const lastMsg = await prisma.message.findFirst({
    where: { conversationId, direction: 'outbound' },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  });
  await prisma.complianceAudit.create({
    data: {
      id: crypto.randomUUID(),
      messageId: lastMsg?.id ?? null,
      conversationId,
      tenantId,
      outboundText: finalReply,
      model,
      checks: complianceResult.checks as any,
      passed: complianceResult.passed,
      flaggedTerms: complianceResult.flaggedTerms,
    },
  });

  // 21. Create handoff record if escalating
  if (action === 'handoff' || action === 'book') {
    const summary = envelope.handoff_summary
      ?? (action === 'book'
        ? `Wants to book. ${(envelope.qualification as any)?.treatment_need ?? ''}`.trim()
        : `Handed off (${handoffReason ?? 'n/a'}).`);

    await prisma.handoff.create({
      data: {
        id: crypto.randomUUID(),
        leadId: contactId,
        conversationId,
        tenantId,
        reason: action === 'book' ? 'booking' : (handoffReason ?? 'user_request'),
        summary,
      },
    });

    // Notify practice staff via Telegram
    const handoffNumber = (tenant as any).handoffNumber as string | null;
    if (handoffNumber || env.TELEGRAM_BOT_WEBHOOK) {
      try {
        await notificationService.notifyEscalation(
          tenantId,
          contact.name ?? '',
          phone,
          handoffReason ?? undefined,
          { extractedData: context.extractedData, messageCount: context.messageCount },
        );
      } catch (err) {
        logger.error({ err }, 'Failed to notify practice on handoff');
      }
    }
  }

  // 22. Log event
  await insertEvent(tenantId, contactId, action, {
    stage: envelope.stage,
    score: aiAction.leadScore,
    qualified: aiAction.leadStatus === 'qualified' || aiAction.leadStatus === 'booked',
    compliancePassed: complianceResult?.passed ?? true,
  });

  // 23. Apply side effects (update conversation, contact, notifications)
  await applySideEffects(tenantId, conversationId, contactId, phone, context, aiAction, envelope.stage);

  // 24. Increment monthly message counter for plan enforcement
  await incrementMessageCount(tenantId);

  logger.info(
    {
      phone, model, tokens: aiResponse.totalTokens,
      state: aiAction.nextState ?? context.state,
      action, stage: envelope.stage,
      compliancePassed: complianceResult?.passed ?? true,
      chars: finalReply.length,
    },
    'Message processed successfully',
  );
}

// ── Helpers ─────────────────────────────────────────────────

/** Substitute {{PLACEHOLDER}} tokens with env-driven values */
function substitutePlaceholders(text: string, aiConfig: Record<string, any>): string {
  const vars: Record<string, string> = {
    CALENDLY_URL: env.CALENDLY_URL ?? aiConfig.calendlyUrl ?? '[booking link — set CALENDLY_URL env var]',
    PRACTICE_PHONE: aiConfig.phone ?? '[call the office]',
    PRACTICE_URL: aiConfig.website ?? '',
    PRACTICE_NAME: env.PRACTICE_NAME ?? aiConfig.businessName ?? 'the practice',
  };

  return text.replace(/\{\{(\w+)\}\}/g, (_match, key) => vars[key] ?? _match);
}

/** Convert a ConciergeEnvelope to the legacy AiAction format */
function envelopeToAction(
  envelope: ConciergeEnvelope,
  finalReply: string,
  action: string,
): AiAction {
  const stageToState: Record<string, string> = {
    greeting: 'greeting',
    discovery: 'qualifying',
    qualifying: 'qualifying',
    value: 'qualified',
    booking: 'booking',
    handoff: 'closed',
    closing: 'closed',
  };

  return {
    replyText: finalReply,
    nextState: (stageToState[envelope.stage] ?? undefined) as any,
    extractedData: envelope.extractedData ?? envelope.qualification as Record<string, any>,
    leadScore: envelope.leadScore,
    leadStatus: envelope.leadStatus as any,
    shouldEscalate: action === 'handoff',
    qualificationReasoning: envelope.qualificationReasoning,
    bookingDate: envelope.bookingDate,
    bookingTime: envelope.bookingTime,
  };
}

async function insertEvent(
  tenantId: string,
  leadId: string | null,
  type: string,
  payload?: Record<string, unknown>,
): Promise<void> {
  try {
    await prisma.event.create({
      data: {
        id: crypto.randomUUID(),
        tenantId,
        leadId: leadId ?? undefined,
        type,
        payload: (payload ?? undefined) as any,
      },
    });
  } catch (err) {
    logger.error({ err }, 'Failed to insert event');
  }
}

function isOptOut(text: string): boolean {
  const normalized = text.toLowerCase().trim();
  return OPT_OUT_KEYWORDS.some((kw) => normalized === kw || normalized.startsWith(kw + ' '));
}

async function handleOptOut(
  tenantId: string,
  contactId: string,
  conversationId: string,
  phone: string,
  channel: string,
  evolutionInstanceId: string | null,
): Promise<void> {
  await prisma.contact.update({
    where: { id: contactId },
    data: { optedOut: true, optedOutAt: new Date() },
  });

  await prisma.conversation.update({
    where: { id: conversationId },
    data: { status: 'closed', closedAt: new Date() },
  });

  await sendMessage({
    tenantId,
    conversationId,
    instanceName: evolutionInstanceId ?? undefined,
    phone,
    channel,
    text: 'You have been unsubscribed and will not receive any more messages. Reply START to re-subscribe anytime.',
  });

  logger.info({ phone }, 'Contact opted out');
}

function resolveMessageText(text: string | null, messageType: string): string {
  if (text) return text;
  switch (messageType) {
    case 'audio': return '[Contact sent a voice message]';
    case 'image': return '[Contact sent an image]';
    case 'document': return '[Contact sent a document]';
    default: return '[Contact sent a non-text message]';
  }
}

async function loadHistory(conversationId: string): Promise<AiMessage[]> {
  const messages = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: 'desc' },
    take: MAX_HISTORY_MESSAGES,
    select: { direction: true, content: true },
  });

  return messages
    .reverse()
    .filter((m) => m.content)
    .map((m) => ({
      role: (m.direction === 'inbound' ? 'user' : 'assistant') as 'user' | 'assistant',
      content: redactPhi(m.content!),
    }));
}

function parseBookingDateTime(dateStr: string, timeStr: string, timezone: string): Date | null {
  try {
    const isoStr = `${dateStr}T${timeStr}:00`;
    const localDate = new Date(isoStr);
    if (isNaN(localDate.getTime())) return null;

    const inTz = new Date(localDate.toLocaleString('en-US', { timeZone: timezone }));
    const inUtc = new Date(localDate.toLocaleString('en-US', { timeZone: 'UTC' }));
    const offsetMs = inUtc.getTime() - inTz.getTime();

    const utcDate = new Date(localDate.getTime() + offsetMs);
    if (isNaN(utcDate.getTime())) return null;
    return utcDate;
  } catch {
    return null;
  }
}

async function runQualificationEvaluation(
  tenant: any,
  contact: any,
  context: ConversationContext,
  history: AiMessage[],
  providerName: 'claude' | 'openai',
): Promise<{ leadScore: number; leadStatus: string; reasoning: string } | null> {
  try {
    const provider = getProvider(providerName);
    const model = getModelForTier(providerName, 'smart');

    const summary = history
      .map((m) => `${m.role === 'user' ? 'Patient' : 'Assistant'}: ${m.content}`)
      .join('\n');

    const prompt = buildQualificationPrompt({
      businessName: tenant.businessName,
      criteria: (tenant.aiConfig as any).qualificationCriteria ?? [],
      contactName: contact.name,
      extractedData: context.extractedData,
      conversationSummary: summary,
    });

    const response = await provider.chat({
      systemPrompt: 'You are a lead qualification evaluator. Respond only with JSON.',
      messages: [{ role: 'user', content: prompt }],
      model,
      temperature: 0.3,
    });

    const jsonMatch = response.text.match(/```json\s*([\s\S]*?)\s*```/);
    const parsed = JSON.parse(jsonMatch ? jsonMatch[1] : response.text);

    return {
      leadScore: parsed.leadScore,
      leadStatus: parsed.leadStatus,
      reasoning: parsed.reasoning,
    };
  } catch (err) {
    logger.error({ err }, 'Qualification evaluation failed');
    return null;
  }
}

async function updateLastOutboundMessage(
  conversationId: string,
  model: string,
  tokens: number,
  costUsd: number,
): Promise<void> {
  const lastMsg = await prisma.message.findFirst({
    where: { conversationId, direction: 'outbound' },
    orderBy: { createdAt: 'desc' },
  });

  if (lastMsg) {
    await prisma.message.update({
      where: { id: lastMsg.id },
      data: { aiModelUsed: model, aiTokensUsed: tokens, aiCostUsd: costUsd },
    });
  }
}

function calculateAiCost(model: string, inputTokens: number, outputTokens: number): number {
  const pricing: Record<string, { input: number; output: number }> = {
    'claude-3-5-sonnet-20241022': { input: 3.0, output: 15.0 },
    'claude-3-5-haiku-20241022':  { input: 1.0, output: 5.0 },
    'claude-sonnet-4-6':          { input: 3.0, output: 15.0 },
    'claude-haiku-4-5-20251001':  { input: 1.0, output: 5.0 },
    'gpt-4o-mini':                { input: 0.15, output: 0.60 },
    'gpt-4o':                     { input: 2.50, output: 10.0 },
  };
  const rates = pricing[model] ?? { input: 3.0, output: 15.0 };
  return (inputTokens * rates.input + outputTokens * rates.output) / 1_000_000;
}

async function trackTenantAiCost(tenantId: string, costUsd: number): Promise<void> {
  const currentMonth = new Date().toISOString().slice(0, 7);
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { costResetMonth: true, monthlyAiCostUsd: true },
  });
  if (!tenant) return;

  if (tenant.costResetMonth !== currentMonth) {
    await prisma.tenant.update({
      where: { id: tenantId },
      data: { monthlyAiCostUsd: costUsd, costResetMonth: currentMonth },
    });
  } else {
    await prisma.tenant.update({
      where: { id: tenantId },
      data: { monthlyAiCostUsd: { increment: costUsd } },
    });
  }
}

async function checkPlanLimits(tenant: {
  plan: string;
  messagesThisMonth: number;
  messageMonthStart: string | null;
  monthlyAiCostUsd: number;
  costResetMonth: string | null;
}): Promise<string | null> {
  const limits = PLAN_LIMITS[tenant.plan] ?? PLAN_LIMITS.starter;
  const currentMonth = new Date().toISOString().slice(0, 7);

  if (limits.messagesPerMonth !== null) {
    const count = tenant.messageMonthStart === currentMonth ? tenant.messagesThisMonth : 0;
    if (count >= limits.messagesPerMonth) {
      return `messages: ${count}/${limits.messagesPerMonth}`;
    }
  }

  if (limits.aiCostMonthlyUsd !== null) {
    const cost = tenant.costResetMonth === currentMonth ? tenant.monthlyAiCostUsd : 0;
    if (cost >= limits.aiCostMonthlyUsd) {
      return `ai_cost: $${cost.toFixed(2)}/$${limits.aiCostMonthlyUsd}`;
    }
  }

  return null;
}

async function incrementMessageCount(tenantId: string): Promise<void> {
  const currentMonth = new Date().toISOString().slice(0, 7);
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { messageMonthStart: true },
  });
  if (!tenant) return;

  if (tenant.messageMonthStart !== currentMonth) {
    await prisma.tenant.update({
      where: { id: tenantId },
      data: { messagesThisMonth: 1, messageMonthStart: currentMonth },
    });
  } else {
    await prisma.tenant.update({
      where: { id: tenantId },
      data: { messagesThisMonth: { increment: 1 } },
    });
  }
}

async function applySideEffects(
  tenantId: string,
  conversationId: string,
  contactId: string,
  phone: string,
  currentContext: ConversationContext,
  action: AiAction,
  stage?: string,
): Promise<void> {
  const updatedContext: ConversationContext = {
    ...currentContext,
    state: action.nextState ?? currentContext.state,
    extractedData: {
      ...currentContext.extractedData,
      ...(action.extractedData ?? {}),
    },
    qualificationComplete:
      action.leadStatus === 'qualified' || action.leadStatus === 'lost'
        ? true
        : currentContext.qualificationComplete,
    messageCount: currentContext.messageCount + 1,
  };

  const conversationUpdate: Record<string, any> = {
    context: updatedContext,
    lastMessageAt: new Date(),
  };

  if (stage) conversationUpdate.stage = stage;

  if (action.nextState === 'closed') {
    conversationUpdate.status = 'closed';
    conversationUpdate.closedAt = new Date();
  }
  if (action.shouldEscalate) {
    conversationUpdate.status = 'escalated';
  }

  await prisma.conversation.update({
    where: { id: conversationId },
    data: conversationUpdate,
  });

  const contactUpdate: Record<string, any> = {};

  if (action.leadScore != null) contactUpdate.leadScore = action.leadScore;
  if (action.leadStatus) contactUpdate.leadStatus = action.leadStatus;
  if (action.qualificationReasoning || action.extractedData) {
    const existing =
      ((
        await prisma.contact.findUnique({
          where: { id: contactId },
          select: { qualificationData: true },
        })
      )?.qualificationData as Record<string, any>) ?? {};

    contactUpdate.qualificationData = {
      ...existing,
      ...(action.extractedData ?? {}),
      ...(action.qualificationReasoning
        ? { _reasoning: action.qualificationReasoning }
        : {}),
    };
  }

  if (Object.keys(contactUpdate).length > 0) {
    contactUpdate.lastContactAt = new Date();
    await prisma.contact.update({
      where: { id: contactId },
      data: contactUpdate,
    });
  }

  if (action.leadStatus === 'qualified' || action.leadStatus === 'booked') {
    await trackCampaignFunnel(contactId, action.leadStatus);
  }

  try {
    const contactName = action.extractedData?.name ?? '';

    if (action.shouldEscalate) {
      await notificationService.notifyEscalation(tenantId, contactName as string, phone);
    }

    if (action.leadStatus === 'qualified' && currentContext.messageCount <= 2) {
      await notificationService.notifyNewLead(tenantId, contactName as string, phone);
    }
  } catch (err) {
    logger.error({ err }, 'Failed to send notification');
  }
}

// ── Review Response Handling ─────────────────────────────────

function parseRating(text: string): number | null {
  const normalized = text.toLowerCase().trim();

  const directNum = normalized.match(/^(\d)$/);
  if (directNum) {
    const n = parseInt(directNum[1], 10);
    if (n >= 1 && n <= 5) return n;
  }

  const wordMap: Record<string, number> = {
    one: 1, two: 2, three: 3, four: 4, five: 5,
  };
  for (const [word, val] of Object.entries(wordMap)) {
    if (normalized === word || normalized.includes(`${word} star`)) {
      return val;
    }
  }

  const patternMatch = normalized.match(/(\d)\s*(?:star|out of)/);
  if (patternMatch) {
    const n = parseInt(patternMatch[1], 10);
    if (n >= 1 && n <= 5) return n;
  }

  const slashMatch = normalized.match(/(\d)\s*\/\s*5/);
  if (slashMatch) {
    const n = parseInt(slashMatch[1], 10);
    if (n >= 1 && n <= 5) return n;
  }

  return null;
}

async function handleReviewResponse(
  tenant: any,
  contact: any,
  context: ConversationContext,
  conversationId: string,
  phone: string,
  channel: string,
  text: string,
): Promise<boolean> {
  const rating = parseRating(text);
  if (rating === null) return false;

  const reviewId = context.pendingReviewId!;
  const contactName = contact.name ?? '';

  try {
    await reviewService.recordResponse(reviewId, rating, text);
  } catch (err) {
    logger.error({ err, reviewId }, 'Failed to record review response');
    return false;
  }

  let replyText: string;
  const reviewConfig = (tenant.reviewConfig as { googleUrl?: string; facebookUrl?: string } | null) ?? {};
  const externalLink = reviewConfig.googleUrl || reviewConfig.facebookUrl;

  if (rating >= 4) {
    replyText = `Thank you${contactName ? `, ${contactName}` : ''}! We're so glad to hear that. `;
    if (externalLink) {
      replyText += `If you have a moment, a quick review would mean the world to us: ${externalLink}`;
    } else {
      replyText += `Your feedback keeps our team motivated!`;
    }
  } else if (rating === 3) {
    replyText = `Thank you for the feedback${contactName ? `, ${contactName}` : ''}! We always want to improve — anything specific we could do better?`;
  } else {
    replyText = `We're sorry your experience wasn't great${contactName ? `, ${contactName}` : ''}. Our team will follow up to make things right. Thank you for letting us know.`;

    try {
      await notificationService.notifyEscalation(tenant.id, contactName, phone);
    } catch (err) {
      logger.error({ err }, 'Failed to send escalation for low review');
    }
  }

  await sendMessage({
    tenantId: tenant.id,
    conversationId,
    instanceName: tenant.evolutionInstanceId ?? undefined,
    phone,
    channel,
    text: replyText,
  });

  await prisma.conversation.update({
    where: { id: conversationId },
    data: {
      context: {
        ...context,
        state: 'closed' as const,
        pendingReviewId: undefined,
      },
      lastMessageAt: new Date(),
    },
  });

  logger.info(
    { phone, rating, reviewId, tier: rating >= 4 ? 'promoter' : rating === 3 ? 'passive' : 'detractor' },
    'Review response captured',
  );

  return true;
}

async function trackCampaignFunnel(
  contactId: string,
  newStatus: 'qualified' | 'booked',
): Promise<void> {
  try {
    const campaignContacts = await prisma.campaignContact.findMany({
      where: { contactId, status: 'replied' },
    });

    for (const cc of campaignContacts) {
      if (newStatus === 'qualified') {
        await campaignService.incrementQualifiedCount(cc.campaignId);
      } else if (newStatus === 'booked') {
        await campaignService.incrementBookedCount(cc.campaignId);
      }
    }
  } catch (err) {
    logger.error({ err, contactId, newStatus }, 'Failed to track campaign funnel');
  }
}
