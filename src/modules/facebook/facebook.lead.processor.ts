import { Job } from 'bullmq';
import { prisma } from '../../config/database';
import { env } from '../../config/env';
import { logger } from '../../utils/logger';
import { sendMessage } from '../whatsapp/message.sender';
import { getProvider, getModelForTier } from '../../ai/ai.router';
import { buildSystemPrompt } from '../../ai/prompts/system.prompt';
import { normalizeBrazilianPhone, cleanPhone } from '../../utils/phone.utils';

/**
 * Facebook Lead Job Data — enqueued by the webhook handler
 */
export interface FacebookLeadJobData {
  leadgenId: string;
  pageId: string;
  formId: string;
  adId?: string;
  createdTime: number;
}

/**
 * Process a Facebook Lead Ad submission:
 * 1. Fetch lead details from Facebook Graph API
 * 2. Find matching tenant by Facebook Page ID (stored in tenant.aiConfig.facebookPageId)
 * 3. Create/upsert the contact
 * 4. Use Claude to craft a personalized first WhatsApp message
 * 5. Send it via Evolution API
 */
export async function facebookLeadProcessor(job: Job<FacebookLeadJobData>): Promise<void> {
  const { leadgenId, pageId, formId } = job.data;

  logger.info({ leadgenId, pageId }, 'Processing Facebook lead');

  // 1. Fetch lead details from Facebook Graph API
  const leadData = await fetchLeadFromFacebook(leadgenId);
  if (!leadData) {
    logger.error({ leadgenId }, 'Could not fetch lead data from Facebook');
    throw new Error(`Failed to fetch lead ${leadgenId} from Facebook`);
  }

  // 2. Extract fields from the lead form
  const fields = parseLeadFields(leadData.field_data);
  const phone = fields.phone_number ?? fields.phone ?? null;
  const name = fields.full_name ?? fields.first_name ?? null;
  const email = fields.email ?? null;

  if (!phone) {
    logger.warn({ leadgenId, fields }, 'Facebook lead has no phone number — skipping');
    return;
  }

  // Normalize the phone for Brazilian format
  const normalizedPhone = normalizeBrazilianPhone(phone) ?? cleanPhone(phone);

  // 3. Find the tenant linked to this Facebook Page
  const tenant = await findTenantByFacebookPage(pageId);
  if (!tenant) {
    logger.warn({ pageId }, 'No active tenant found for Facebook Page ID');
    return;
  }

  if (!tenant.evolutionInstanceId) {
    logger.warn({ tenantId: tenant.id }, 'Tenant has no WhatsApp instance configured');
    return;
  }

  // 4. Upsert contact
  const contact = await prisma.contact.upsert({
    where: { tenantId_phone: { tenantId: tenant.id, phone: normalizedPhone } },
    update: {
      lastContactAt: new Date(),
      name: name ?? undefined,
      email: email ?? undefined,
      tags: { push: 'facebook-lead' },
      qualificationData: {
        source: 'facebook_lead_ad',
        formId,
        adId: job.data.adId ?? null,
        rawFields: fields,
      },
    },
    create: {
      tenantId: tenant.id,
      phone: normalizedPhone,
      name,
      email,
      leadStatus: 'new',
      tags: ['facebook-lead'],
      qualificationData: {
        source: 'facebook_lead_ad',
        formId,
        adId: job.data.adId ?? null,
        rawFields: fields,
      },
    },
  });

  // 5. Create a new conversation
  const conversation = await prisma.conversation.create({
    data: {
      tenantId: tenant.id,
      contactId: contact.id,
      status: 'active',
      context: {
        state: 'greeting',
        extractedData: {
          nome: name,
          email,
          source: 'facebook_lead_ad',
          ...fields,
        },
        qualificationComplete: false,
        messageCount: 0,
      },
    },
  });

  // 6. Use Claude to craft the first message
  const aiConfig = tenant.aiConfig as Record<string, any>;
  const firstMessage = await craftFirstMessage(tenant, contact, fields, aiConfig);

  // 7. Send via WhatsApp
  await sendMessage({
    tenantId: tenant.id,
    conversationId: conversation.id,
    instanceName: tenant.evolutionInstanceId,
    phone: normalizedPhone,
    text: firstMessage,
  });

  // 8. Update contact status
  await prisma.contact.update({
    where: { id: contact.id },
    data: { leadStatus: 'qualifying', lastContactAt: new Date() },
  });

  logger.info(
    { tenantId: tenant.id, phone: normalizedPhone, leadgenId },
    'Facebook lead processed — first message sent via WhatsApp',
  );
}

// ── Facebook Graph API ──────────────────────────────────────────

async function fetchLeadFromFacebook(leadgenId: string): Promise<FacebookLeadResponse | null> {
  const token = env.FACEBOOK_PAGE_ACCESS_TOKEN;
  if (!token) {
    logger.error('FACEBOOK_PAGE_ACCESS_TOKEN not configured — cannot fetch lead data');
    return null;
  }

  try {
    const url = `https://graph.facebook.com/v19.0/${leadgenId}?access_token=${token}`;
    const response = await fetch(url);

    if (!response.ok) {
      const errorBody = await response.text();
      logger.error({ status: response.status, body: errorBody }, 'Facebook Graph API error');
      return null;
    }

    return (await response.json()) as FacebookLeadResponse;
  } catch (err) {
    logger.error({ err, leadgenId }, 'Failed to fetch lead from Facebook Graph API');
    return null;
  }
}

// ── Tenant Lookup ───────────────────────────────────────────────

async function findTenantByFacebookPage(pageId: string): Promise<any | null> {
  // Look for tenant where aiConfig.facebookPageId matches
  const tenants = await prisma.tenant.findMany({
    where: { status: 'active' },
  });

  for (const tenant of tenants) {
    const aiConfig = tenant.aiConfig as Record<string, any>;
    if (aiConfig?.facebookPageId === pageId) {
      return tenant;
    }
  }

  // Fallback: if only one active tenant exists, use it (common for single-business setups)
  if (tenants.length === 1) {
    logger.info('Single tenant found — auto-linking Facebook leads to it');
    return tenants[0];
  }

  return null;
}

// ── AI First Message Crafting ───────────────────────────────────

async function craftFirstMessage(
  tenant: any,
  contact: any,
  leadFields: Record<string, string>,
  aiConfig: Record<string, any>,
): Promise<string> {
  try {
    const providerName: 'claude' | 'openai' = aiConfig.model ?? env.AI_PRIMARY_PROVIDER;
    const provider = getProvider(providerName);
    const model = getModelForTier(providerName, 'fast');

    const context = {
      state: 'greeting' as const,
      extractedData: { nome: contact.name, ...leadFields },
      qualificationComplete: false,
      messageCount: 0,
    };

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
        },
      },
      {
        name: contact.name,
        phone: contact.phone,
        leadScore: 0,
        leadStatus: 'new',
        qualificationData: null,
      },
      context,
    );

    // Build a contextual user message describing the lead
    const leadContext = buildLeadContextMessage(contact.name, leadFields);

    const aiResponse = await provider.chat({
      systemPrompt,
      messages: [{ role: 'user', content: leadContext }],
      model,
      temperature: aiConfig.temperature ?? 0.7,
    });

    // Try to extract replyText from JSON response, or use raw text
    const replyText = extractReplyText(aiResponse.text);
    return replyText;
  } catch (err) {
    logger.error({ err }, 'AI first message crafting failed — using fallback');
    return buildFallbackMessage(tenant.businessName, contact.name);
  }
}

function buildLeadContextMessage(name: string | null, fields: Record<string, string>): string {
  const parts = [
    `[SISTEMA] Este é um novo lead que acabou de preencher um formulário no Facebook/Instagram.`,
  ];

  if (name) parts.push(`Nome: ${name}`);

  // Include any extra fields from the form (e.g., interest, budget, message)
  for (const [key, value] of Object.entries(fields)) {
    if (['phone_number', 'phone', 'full_name', 'first_name', 'last_name', 'email'].includes(key)) continue;
    parts.push(`${key}: ${value}`);
  }

  parts.push('');
  parts.push('Envie uma primeira mensagem acolhedora e personalizada para este lead no WhatsApp. Mencione que viu o interesse dele(a) e pergunte como pode ajudar. NÃO mencione "Facebook" ou "formulário" — seja natural como se estivesse iniciando uma conversa.');

  return parts.join('\n');
}

function extractReplyText(rawText: string): string {
  try {
    const jsonMatch = rawText.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[1]);
      return parsed.replyText ?? rawText;
    }
    const parsed = JSON.parse(rawText);
    return parsed.replyText ?? rawText;
  } catch {
    return rawText;
  }
}

function buildFallbackMessage(businessName: string, name: string | null): string {
  const greeting = name ? `Olá, ${name}!` : 'Olá!';
  return `${greeting} Tudo bem? Aqui é da ${businessName}. Vi que você demonstrou interesse nos nossos serviços. Como posso te ajudar? 😊`;
}

// ── Field Parsing ───────────────────────────────────────────────

function parseLeadFields(fieldData: Array<{ name: string; values: string[] }>): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const field of fieldData ?? []) {
    if (field.values && field.values.length > 0) {
      fields[field.name] = field.values[0];
    }
  }
  return fields;
}

// ── Types ───────────────────────────────────────────────────────

interface FacebookLeadResponse {
  id: string;
  created_time: string;
  field_data: Array<{
    name: string;
    values: string[];
  }>;
  form_id: string;
  ad_id?: string;
}
