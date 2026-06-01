import { stores } from './mock-prisma';

export interface TestFixtures {
  tenant: any;
  contact: any;
  conversation: any;
}

/**
 * Seed minimal data for a conversation test.
 * Returns IDs and objects for the tenant, contact, and conversation.
 */
export function seedConversation(overrides?: {
  tenantOverrides?: Record<string, any>;
  contactOverrides?: Record<string, any>;
  conversationOverrides?: Record<string, any>;
}): TestFixtures {
  const tenantId = 'tenant-1';
  const contactId = 'contact-1';
  const conversationId = 'conv-1';

  const tenant = {
    id: tenantId,
    businessName: 'Clinica Teste',
    whatsappNumber: '5511999999999',
    evolutionInstanceId: 'test-instance',
    timezone: 'America/Sao_Paulo',
    businessHours: { start: '08:00', end: '18:00', days: [1, 2, 3, 4, 5] },
    aiConfig: {
      tone: 'friendly',
      qualificationCriteria: [],
      businessDescription: 'Clinica odontologica',
    },
    bookingConfig: null,
    notificationConfig: null,
    reviewConfig: null,
    status: 'active',
    plan: 'pro',
    stripeCustomerId: null,
    apiKey: 'test-key',
    monthlyAiCostUsd: 0,
    aiCostLimitUsd: null,
    costResetMonth: null,
    messagesThisMonth: 0,
    messageMonthStart: null,
    complianceEnabled: true,
    qualificationRules: null,
    handoffNumber: null,
    assessmentDesc: null,
    toneNotes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...(overrides?.tenantOverrides ?? {}),
  };
  stores.tenants.set(tenantId, tenant);

  const contact = {
    id: contactId,
    tenantId,
    phone: '5511988887777',
    name: 'Ana Silva',
    email: null,
    channel: 'whatsapp',
    leadScore: 0,
    leadStatus: 'new',
    qualificationData: null,
    tags: [],
    firstContactAt: new Date(),
    lastContactAt: null,
    optedOut: false,
    optedOutAt: null,
    createdAt: new Date(),
    ...(overrides?.contactOverrides ?? {}),
  };
  stores.contacts.set(contactId, contact);

  const conversation = {
    id: conversationId,
    tenantId,
    contactId,
    channel: 'whatsapp',
    status: 'active',
    stage: 'saudacao',
    context: {
      state: 'greeting',
      extractedData: {},
      qualificationComplete: false,
      messageCount: 0,
    },
    startedAt: new Date(),
    lastMessageAt: null,
    closedAt: null,
    ...(overrides?.conversationOverrides ?? {}),
  };
  stores.conversations.set(conversationId, conversation);

  return { tenant, contact, conversation };
}

/**
 * Seed a pre-existing tenant with NULL concierge fields (pre-merge simulation).
 */
export function seedPreMergeTenant(): TestFixtures {
  return seedConversation({
    tenantOverrides: {
      complianceEnabled: null,
      qualificationRules: null,
      handoffNumber: null,
      assessmentDesc: null,
      toneNotes: null,
    },
  });
}
