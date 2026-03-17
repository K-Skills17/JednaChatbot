import { Job } from 'bullmq';
import { prisma } from '../../config/database';
import { env } from '../../config/env';
import { logger } from '../../utils/logger';
import { sendMessage } from '../whatsapp/message.sender';
import { getProvider, getModelForTier } from '../../ai/ai.router';
import { buildSystemPrompt } from '../../ai/prompts/system.prompt';
import { normalizeBrazilianPhone, cleanPhone } from '../../utils/phone.utils';
import { calculateFormLeadScore, buildScoredFirstMessage, FormLeadScore } from './form-lead-scoring';

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
  logger.info({ leadgenId, fields }, 'Facebook lead raw fields from Graph API');
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

  // 4. Calculate lead score from form dropdown answers
  // Facebook field names vary — find them by keyword matching
  const noShowValue = findFieldByKeywords(fields, ['faltas', 'cancelamentos', 'no_show']);
  const ticketValue = findFieldByKeywords(fields, ['ticket_medio', 'ticket_médio', 'ticket']);
  logger.info({ leadgenId, noShowValue, ticketValue }, 'Facebook lead scoring fields resolved');
  const formScoring = calculateFormLeadScore(noShowValue, ticketValue);

  const qualificationData: Record<string, any> = {
    source: 'facebook_lead_ad',
    formId,
    adId: job.data.adId ?? null,
    rawFields: fields,
  };

  // Attach scoring data if available
  if (formScoring) {
    qualificationData.formScoring = {
      noShowsPerMonth: formScoring.noShowsPerMonth,
      averageTicket: formScoring.averageTicket,
      monthlyLoss: formScoring.monthlyLoss,
      annualLoss: formScoring.annualLoss,
      signalLevel: formScoring.signalLevel,
      icpSignal: formScoring.icpSignal,
      priority: formScoring.priority,
      tier: formScoring.tier,
    };
    logger.info(
      { leadgenId, tier: formScoring.tier, monthlyLoss: formScoring.monthlyLoss, leadScore: formScoring.leadScore },
      'Facebook form lead scored',
    );
  }

  // 5. Upsert contact
  const initialLeadScore = formScoring?.leadScore ?? 0;
  const initialLeadStatus = formScoring
    ? (formScoring.tier === 'nurture' ? 'new' : 'qualifying')
    : 'new';

  const contact = await prisma.contact.upsert({
    where: { tenantId_phone: { tenantId: tenant.id, phone: normalizedPhone } },
    update: {
      lastContactAt: new Date(),
      name: name ?? undefined,
      email: email ?? undefined,
      tags: { push: 'facebook-lead' },
      leadScore: initialLeadScore,
      qualificationData,
    },
    create: {
      tenantId: tenant.id,
      phone: normalizedPhone,
      name,
      email,
      leadStatus: initialLeadStatus,
      leadScore: initialLeadScore,
      tags: ['facebook-lead'],
      qualificationData,
    },
  });

  // 6. Create a new conversation
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
          ...(formScoring ? {
            formScoring: {
              noShowsPerMonth: formScoring.noShowsPerMonth,
              averageTicket: formScoring.averageTicket,
              monthlyLoss: formScoring.monthlyLoss,
              annualLoss: formScoring.annualLoss,
              tier: formScoring.tier,
              priority: formScoring.priority,
            },
          } : {}),
          ...fields,
        },
        qualificationComplete: false,
        messageCount: 0,
      },
    },
  });

  // 7. Build first message — use scored template if form data available, otherwise AI-generated
  const aiConfig = tenant.aiConfig as Record<string, any>;
  const clinicName = findFieldByKeywords(fields, ['clinica', 'consultorio', 'clinic']) ?? null;

  const firstMessage = formScoring
    ? buildScoredFirstMessage(name, clinicName, formScoring)
    : await craftFirstMessage(tenant, contact, fields, aiConfig);

  // 8. Send via WhatsApp
  await sendMessage({
    tenantId: tenant.id,
    conversationId: conversation.id,
    instanceName: tenant.evolutionInstanceId,
    phone: normalizedPhone,
    text: firstMessage,
  });

  // 9. Update contact status
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
  // First: look for any tenant (active or onboarding) with a matching facebookPageId
  const allTenants = await prisma.tenant.findMany({
    where: { status: { in: ['active', 'onboarding'] } },
  });

  for (const tenant of allTenants) {
    const aiConfig = tenant.aiConfig as Record<string, any>;
    if (aiConfig?.facebookPageId === pageId) {
      return tenant;
    }
  }

  // Fallback: if only one tenant exists, use it (common for single-business setups)
  if (allTenants.length === 1) {
    logger.info('Single tenant found — auto-linking Facebook leads to it');
    return allTenants[0];
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
    `[SISTEMA] Este é um novo lead que acabou de preencher um formulário no Facebook.`,
  ];

  if (name) parts.push(`Nome: ${name}`);

  // Include any extra fields from the form (e.g., interest, budget, message)
  for (const [key, value] of Object.entries(fields)) {
    if (['phone_number', 'phone', 'full_name', 'first_name', 'last_name', 'email'].includes(key)) continue;
    parts.push(`${key}: ${value}`);
  }

  parts.push('');
  parts.push('Envie uma primeira mensagem acolhedora e personalizada para este lead no WhatsApp. IMPORTANTE: Mencione que ele(a) preencheu o formulário no Facebook para que saiba de onde estamos entrando em contato. Pergunte como pode ajudar.');

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
  return `${greeting} Tudo bem? Aqui é da ${businessName}. Vi que você preencheu nosso formulário no Facebook e demonstrou interesse nos nossos serviços. Como posso te ajudar? 😊`;
}

// ── Field Matching ──────────────────────────────────────────────

/**
 * Find a field value by searching for keywords in field names.
 * Facebook sends field names as slugified versions of the full question text,
 * e.g. "quantas_faltas_ou_cancelamentos_você_tem_por_mês?_(média)"
 *
 * Handles accented characters (e.g., "médio" matches "medio") and punctuation.
 */
function findFieldByKeywords(fields: Record<string, string>, keywords: string[]): string | undefined {
  // 1. Exact match on field name
  for (const keyword of keywords) {
    if (fields[keyword]) return fields[keyword];
  }

  // 2. Fuzzy match — normalize both sides and check if the field name contains the keyword
  const normalizeStr = (s: string) =>
    s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

  const normalizedKeywords = keywords.map(normalizeStr);

  for (const [fieldName, value] of Object.entries(fields)) {
    const normalizedField = normalizeStr(fieldName);
    for (const nk of normalizedKeywords) {
      if (normalizedField.includes(nk)) {
        return value;
      }
    }
  }

  return undefined;
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
