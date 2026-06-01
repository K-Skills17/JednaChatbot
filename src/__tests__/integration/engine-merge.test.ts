/**
 * Integration tests for the concierge merge — T1-T5 + C.
 *
 * Strategy:
 * - Mock prisma (in-memory stores)
 * - Mock AI provider (returns exact strings)
 * - Mock/spy message sender (assert what would be sent)
 * - Mock external services (booking, notification, review, campaign, queue)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mockPrisma, resetStores, stores } from './helpers/mock-prisma';
import { seedConversation, seedPreMergeTenant, TestFixtures } from './helpers/seed';

// ── Module mocks (must be before imports) ─────────────────
vi.mock('../../config/database', () => ({ prisma: mockPrisma }));

const mockSendMessage = vi.fn().mockResolvedValue(undefined);
vi.mock('../../modules/whatsapp/message.sender', () => ({
  sendMessage: (...args: any[]) => mockSendMessage(...args),
}));

const mockAiChat = vi.fn();
vi.mock('../../ai/ai.router', () => ({
  getProvider: () => ({ chat: mockAiChat }),
  getModelForTier: () => 'claude-haiku-4-5-20251001',
}));

vi.mock('../../modules/booking/booking.service', () => ({
  bookingService: {
    create: vi.fn().mockResolvedValue({ id: 'booking-1' }),
  },
}));

vi.mock('../../modules/campaign/campaign.service', () => ({
  campaignService: {
    incrementQualifiedCount: vi.fn(),
    incrementBookedCount: vi.fn(),
  },
}));

vi.mock('../../modules/notification/notification.service', () => ({
  notificationService: {
    notifyEscalation: vi.fn().mockResolvedValue(undefined),
    notifyNewLead: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../../modules/review/review.service', () => ({
  reviewService: {
    recordResponse: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../../config/env', () => ({
  env: {
    AI_PRIMARY_PROVIDER: 'claude',
    AI_PRIMARY_MODEL: 'claude-haiku-4-5-20251001',
    AI_QUALIFICATION_MODEL: 'claude-sonnet-4-5-20250929',
    DEBOUNCE_MS: 500,
  },
}));

// ── Import after mocks ────────────────────────────────────
import { processMessage } from '../../ai/conversation.engine';
import { SAFE_HANDOFF_REPLY } from '../../concierge/compliance';
import type { MessageJobData } from '../../ai/ai.types';

// ── Helpers ───────────────────────────────────────────────
function makeJob(fixtures: TestFixtures, text: string = 'Oi'): MessageJobData {
  return {
    tenantId: fixtures.tenant.id,
    contactId: fixtures.contact.id,
    conversationId: fixtures.conversation.id,
    phone: fixtures.contact.phone,
    text,
    messageType: 'text',
    senderName: fixtures.contact.name,
  };
}

function makeValidEnvelope(overrides: Record<string, any> = {}): string {
  return JSON.stringify({
    reply: 'Oi! Como posso ajudar?',
    stage: 'descoberta',
    qualification: { nome: 'Ana' },
    action: 'continuar',
    handoff_reason: null,
    handoff_summary: null,
    compliance_flag: false,
    ...overrides,
  });
}

function mockAiReturns(text: string) {
  mockAiChat.mockResolvedValueOnce({
    text,
    model: 'claude-haiku-4-5-20251001',
    inputTokens: 100,
    outputTokens: 50,
    totalTokens: 150,
  });
}

// ── Test Suite ────────────────────────────────────────────
describe('Engine merge integration tests', () => {
  beforeEach(() => {
    resetStores();
    vi.clearAllMocks();
  });

  // ═══════════════════════════════════════════════════════
  // T1 — Envelope end-to-end + graceful degradation
  // ═══════════════════════════════════════════════════════
  describe('T1 — Envelope', () => {
    it('T1a — valid envelope: reply is sent, stage updated, qualification merged', async () => {
      const fixtures = seedConversation();
      mockAiReturns(makeValidEnvelope());

      await processMessage(makeJob(fixtures));

      // Reply sent
      expect(mockSendMessage).toHaveBeenCalledTimes(1);
      const sendCall = mockSendMessage.mock.calls[0][0];
      expect(sendCall.text).toBe('Oi! Como posso ajudar?');

      // Conversation stage updated
      const conv = stores.conversations.get('conv-1');
      expect(conv.stage).toBe('descoberta');

      // Qualification data merged onto contact
      const contact = stores.contacts.get('contact-1');
      expect(contact.qualificationData).toMatchObject({ nome: 'Ana' });

      // No errors, no handoffs
      expect(stores.handoffs.size).toBe(0);
    });

    it('T1b — malformed AI response: fallback handoff, garbled text never sent', async () => {
      const fixtures = seedConversation();
      mockAiReturns('Claro! Aqui vai: { reply: \'oi\'');

      await processMessage(makeJob(fixtures));

      // Safe fallback sent, NOT the garbled text
      expect(mockSendMessage).toHaveBeenCalledTimes(1);
      const sentText = mockSendMessage.mock.calls[0][0].text;
      expect(sentText).not.toContain('Claro!');
      expect(sentText).not.toContain("reply: 'oi'");

      // Handoff created (because action = encaminhar from fallback)
      expect(stores.handoffs.size).toBe(1);
      const handoff = [...stores.handoffs.values()][0];
      expect(handoff.reason).toBeTruthy();
    });

    it('T1b2 — non-JSON prose: fallback handoff', async () => {
      const fixtures = seedConversation();
      mockAiReturns('Posso te ajudar com implantes. Quando gostaria de vir?');

      await processMessage(makeJob(fixtures));

      expect(mockSendMessage).toHaveBeenCalledTimes(1);
      const sentText = mockSendMessage.mock.calls[0][0].text;
      // Should NOT send the raw prose
      expect(sentText).not.toContain('Posso te ajudar com implantes');
      expect(stores.handoffs.size).toBe(1);
    });

    it('T1c — code-fenced envelope: parses successfully', async () => {
      const fixtures = seedConversation();
      const fenced = '```json\n' + makeValidEnvelope({ reply: 'Tudo bem!' }) + '\n```';
      mockAiReturns(fenced);

      await processMessage(makeJob(fixtures));

      expect(mockSendMessage).toHaveBeenCalledTimes(1);
      expect(mockSendMessage.mock.calls[0][0].text).toBe('Tudo bem!');
      expect(stores.handoffs.size).toBe(0);
    });
  });

  // ═══════════════════════════════════════════════════════
  // T2 — Compliance gate fires pre-send
  // ═══════════════════════════════════════════════════════
  describe('T2 — Compliance gate', () => {
    it('T2a — prohibited term blocked: safe text sent, ComplianceAudit.passed=false', async () => {
      const fixtures = seedConversation();
      mockAiReturns(makeValidEnvelope({
        reply: 'Nos garantimos o melhor resultado para voce!',
      }));

      await processMessage(makeJob(fixtures));

      // Safe text sent, NOT the prohibited text
      expect(mockSendMessage).toHaveBeenCalledTimes(1);
      const sentText = mockSendMessage.mock.calls[0][0].text;
      expect(sentText).not.toContain('garantimos');
      expect(sentText).toContain('equipe');

      // ComplianceAudit row: passed = false
      expect(stores.complianceAudits.size).toBe(1);
      const audit = [...stores.complianceAudits.values()][0];
      expect(audit.passed).toBe(false);
      expect(audit.flaggedTerms).toContain('garantia');

      // Handoff created (forced to encaminhar)
      expect(stores.handoffs.size).toBe(1);
    });

    it('T2a — R$ price blocked', async () => {
      const fixtures = seedConversation();
      mockAiReturns(makeValidEnvelope({
        reply: 'O implante custa R$ 5.000 por unidade.',
      }));

      await processMessage(makeJob(fixtures));

      const sentText = mockSendMessage.mock.calls[0][0].text;
      expect(sentText).not.toContain('R$');
      const audit = [...stores.complianceAudits.values()][0];
      expect(audit.passed).toBe(false);
      expect(audit.flaggedTerms).toContain('preco_tratamento');
    });

    it('T2a — desconto blocked', async () => {
      const fixtures = seedConversation();
      mockAiReturns(makeValidEnvelope({
        reply: 'Temos desconto especial esse mes!',
      }));

      await processMessage(makeJob(fixtures));

      const audit = [...stores.complianceAudits.values()][0];
      expect(audit.passed).toBe(false);
      expect(audit.flaggedTerms).toContain('desconto');
    });

    it('T2a — melhor clinica blocked', async () => {
      const fixtures = seedConversation();
      mockAiReturns(makeValidEnvelope({
        reply: 'Somos a melhor clinica da regiao!',
      }));

      await processMessage(makeJob(fixtures));

      const audit = [...stores.complianceAudits.values()][0];
      expect(audit.passed).toBe(false);
      expect(audit.flaggedTerms).toContain('superlativo_melhor');
    });

    it('T2a — 100% blocked', async () => {
      const fixtures = seedConversation();
      mockAiReturns(makeValidEnvelope({
        reply: 'Sucesso em 100% dos casos!',
      }));

      await processMessage(makeJob(fixtures));

      const audit = [...stores.complianceAudits.values()][0];
      expect(audit.passed).toBe(false);
      expect(audit.flaggedTerms).toContain('cem_por_cento');
    });

    it('T2b — model self-flag: blocked even with clean text', async () => {
      const fixtures = seedConversation();
      mockAiReturns(makeValidEnvelope({
        reply: 'Vamos agendar sua avaliacao?',
        compliance_flag: true,
      }));

      await processMessage(makeJob(fixtures));

      const sentText = mockSendMessage.mock.calls[0][0].text;
      expect(sentText).not.toBe('Vamos agendar sua avaliacao?');

      const audit = [...stores.complianceAudits.values()][0];
      expect(audit.passed).toBe(false);
    });

    it('T2c — clean reply: sent normally, ComplianceAudit.passed=true', async () => {
      const fixtures = seedConversation();
      mockAiReturns(makeValidEnvelope({
        reply: 'A avaliacao e o primeiro passo para entender o melhor caminho.',
      }));

      await processMessage(makeJob(fixtures));

      const sentText = mockSendMessage.mock.calls[0][0].text;
      expect(sentText).toBe('A avaliacao e o primeiro passo para entender o melhor caminho.');

      // Audit row written with passed = true
      expect(stores.complianceAudits.size).toBe(1);
      const audit = [...stores.complianceAudits.values()][0];
      expect(audit.passed).toBe(true);
    });

    it('T2 — audit row written on EVERY outbound (pass and fail)', async () => {
      // Pass
      const f1 = seedConversation();
      mockAiReturns(makeValidEnvelope({ reply: 'Tudo bem!' }));
      await processMessage(makeJob(f1));
      expect(stores.complianceAudits.size).toBe(1);

      // Fail (same conversation, different message)
      mockAiReturns(makeValidEnvelope({ reply: 'Nos garantimos!' }));
      await processMessage(makeJob(f1, 'Obrigado'));
      expect(stores.complianceAudits.size).toBe(2);

      const audits = [...stores.complianceAudits.values()];
      expect(audits.filter(a => a.passed).length).toBe(1);
      expect(audits.filter(a => !a.passed).length).toBe(1);
    });
  });

  // ═══════════════════════════════════════════════════════
  // T3 — Idempotent webhooks (tested at message creation level)
  // ═══════════════════════════════════════════════════════
  describe('T3 — Idempotent webhooks', () => {
    it('T3 — duplicate whatsappMessageId rejected by unique constraint', async () => {
      const fixtures = seedConversation();

      // First insert succeeds
      await mockPrisma.message.create({
        data: {
          conversationId: fixtures.conversation.id,
          tenantId: fixtures.tenant.id,
          direction: 'inbound',
          messageType: 'text',
          content: 'Oi',
          whatsappMessageId: 'WAMID_TEST_1',
        },
      });
      expect(stores.messages.size).toBe(1);

      // Second insert with same whatsappMessageId throws P2002
      await expect(
        mockPrisma.message.create({
          data: {
            conversationId: fixtures.conversation.id,
            tenantId: fixtures.tenant.id,
            direction: 'inbound',
            messageType: 'text',
            content: 'Oi again',
            whatsappMessageId: 'WAMID_TEST_1',
          },
        }),
      ).rejects.toThrow();

      // Still only one message
      expect(stores.messages.size).toBe(1);
    });

    it('T3 — different whatsappMessageIds accepted', async () => {
      const fixtures = seedConversation();

      await mockPrisma.message.create({
        data: {
          conversationId: fixtures.conversation.id,
          tenantId: fixtures.tenant.id,
          direction: 'inbound',
          messageType: 'text',
          content: 'Oi',
          whatsappMessageId: 'WAMID_A',
        },
      });

      await mockPrisma.message.create({
        data: {
          conversationId: fixtures.conversation.id,
          tenantId: fixtures.tenant.id,
          direction: 'inbound',
          messageType: 'text',
          content: 'Tudo bem?',
          whatsappMessageId: 'WAMID_B',
        },
      });

      expect(stores.messages.size).toBe(2);
    });
  });

  // ═══════════════════════════════════════════════════════
  // T4 — Debounce (structural verification)
  // ═══════════════════════════════════════════════════════
  describe('T4 — Debounce', () => {
    it('T4 — debounce collects all messages: AI sees full history from DB', async () => {
      const fixtures = seedConversation();

      // Simulate 3 messages already stored in the conversation (as debounce would collect)
      const msgs = ['Oi', 'quero implante', 'quanto custa?'];
      for (let i = 0; i < msgs.length; i++) {
        await mockPrisma.message.create({
          data: {
            conversationId: fixtures.conversation.id,
            tenantId: fixtures.tenant.id,
            direction: 'inbound',
            messageType: 'text',
            content: msgs[i],
            whatsappMessageId: `WAMID_${i}`,
            createdAt: new Date(Date.now() + i * 1000),
          },
        });
      }

      mockAiReturns(makeValidEnvelope({ reply: 'Entendi, posso ajudar!' }));

      // Process the turn once (after debounce window)
      await processMessage(makeJob(fixtures, 'quanto custa?'));

      // AI was called exactly once
      expect(mockAiChat).toHaveBeenCalledTimes(1);

      // The AI call's messages array includes all 3 inbound messages from history
      const aiCallArgs = mockAiChat.mock.calls[0][0];
      const userMessages = aiCallArgs.messages.filter((m: any) => m.role === 'user');
      // History has 3 msgs + the current effectiveText
      expect(userMessages.length).toBeGreaterThanOrEqual(3);
      expect(userMessages.map((m: any) => m.content)).toContain('Oi');
      expect(userMessages.map((m: any) => m.content)).toContain('quero implante');
    });
  });

  // ═══════════════════════════════════════════════════════
  // T5 — Backward-compatibility smoke
  // ═══════════════════════════════════════════════════════
  describe('T5 — Backward-compatibility', () => {
    it('T5a — booking path: Booking row created with preferredDay/Period', async () => {
      const fixtures = seedConversation({
        conversationOverrides: {
          context: {
            state: 'booking',
            extractedData: {},
            qualificationComplete: true,
            messageCount: 5,
          },
        },
      });

      mockAiReturns(makeValidEnvelope({
        reply: 'Confirmado para terca de manha!',
        stage: 'agendamento',
        action: 'agendar',
        qualification: { dia_preferido: 'terca', periodo_preferido: 'manha' },
      }));

      await processMessage(makeJob(fixtures, 'Pode ser terca de manha'));

      // Booking created with preference fields
      expect(stores.bookings.size).toBe(1);
      const booking = [...stores.bookings.values()][0];
      expect(booking.preferredDay).toBe('terca');
      expect(booking.preferredPeriod).toBe('manha');
      expect(booking.status).toBe('solicitado');
    });

    it('T5b — handoff notification: sender called with handoffNumber', async () => {
      const fixtures = seedConversation({
        tenantOverrides: { handoffNumber: '5511900001111' },
      });

      mockAiReturns(makeValidEnvelope({
        reply: 'Vou te conectar com a equipe.',
        action: 'encaminhar',
        stage: 'encaminhamento',
        handoff_reason: 'user_request',
        handoff_summary: 'Paciente quer falar com humano.',
      }));

      await processMessage(makeJob(fixtures, 'Quero falar com alguem'));

      // Handoff record created
      expect(stores.handoffs.size).toBe(1);

      // Two sends: one to patient, one to handoff number
      expect(mockSendMessage).toHaveBeenCalledTimes(2);
      const calls = mockSendMessage.mock.calls;
      const handoffCall = calls.find((c: any) => c[0].phone === '5511900001111');
      expect(handoffCall).toBeTruthy();
      expect(handoffCall![0].text).toContain('Novo lead');
    });

    it('T5b2 — no handoff notification when handoffNumber is null', async () => {
      const fixtures = seedConversation({ tenantOverrides: { handoffNumber: null } });

      mockAiReturns(makeValidEnvelope({
        reply: 'Vou te encaminhar.',
        action: 'encaminhar',
        stage: 'encaminhamento',
      }));

      await processMessage(makeJob(fixtures, 'Quero falar com alguem'));

      // Only one send (to patient), no handoff notification
      expect(mockSendMessage).toHaveBeenCalledTimes(1);
    });

    it('T5c — event logging: Event row written for each action', async () => {
      const fixtures = seedConversation();

      // continuar
      mockAiReturns(makeValidEnvelope({ action: 'continuar' }));
      await processMessage(makeJob(fixtures, 'Oi'));
      expect(stores.events.size).toBeGreaterThanOrEqual(1);
      const event = [...stores.events.values()].pop();
      expect(event.type).toBe('continuar');

      // encaminhar
      mockAiReturns(makeValidEnvelope({ action: 'encaminhar', reply: 'Vou encaminhar.', stage: 'encaminhamento' }));
      await processMessage(makeJob(fixtures, 'Quero um humano'));
      const events = [...stores.events.values()];
      expect(events.some(e => e.type === 'encaminhar')).toBe(true);
    });

    it('T5c — opt_out event logged', async () => {
      const fixtures = seedConversation();

      // Opt-out via keyword
      await processMessage(makeJob(fixtures, 'sair'));

      const events = [...stores.events.values()];
      expect(events.some(e => e.type === 'opt_out')).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════
  // C — Migration-safety checks
  // ═══════════════════════════════════════════════════════
  describe('C — Migration safety', () => {
    it('C1 — pre-existing tenant with NULL concierge fields: no crash', async () => {
      const fixtures = seedPreMergeTenant();

      mockAiReturns(makeValidEnvelope());

      // Should NOT throw
      await expect(processMessage(makeJob(fixtures))).resolves.not.toThrow();

      // Reply was sent
      expect(mockSendMessage).toHaveBeenCalledTimes(1);
    });

    it('C2 — complianceEnabled=null: gate still fires, prohibited text blocked', async () => {
      const fixtures = seedConversation({
        tenantOverrides: { complianceEnabled: null },
      });

      mockAiReturns(makeValidEnvelope({
        reply: 'Nos garantimos o melhor!',
      }));

      await processMessage(makeJob(fixtures));

      const sentText = mockSendMessage.mock.calls[0][0].text;
      expect(sentText).not.toContain('garantimos');
      expect(stores.complianceAudits.size).toBe(1);
      expect([...stores.complianceAudits.values()][0].passed).toBe(false);
    });

    it('C2b — complianceEnabled=false: gate still fires, prohibited text blocked', async () => {
      const fixtures = seedConversation({
        tenantOverrides: { complianceEnabled: false },
      });

      mockAiReturns(makeValidEnvelope({
        reply: 'Temos desconto especial!',
      }));

      await processMessage(makeJob(fixtures));

      const sentText = mockSendMessage.mock.calls[0][0].text;
      expect(sentText).not.toContain('desconto');
      expect(stores.complianceAudits.size).toBe(1);
      expect([...stores.complianceAudits.values()][0].passed).toBe(false);
      expect([...stores.complianceAudits.values()][0].flaggedTerms).toContain('desconto');
    });

    it('C2c — complianceEnabled=true: gate fires (same as any other tenant)', async () => {
      const fixtures = seedConversation({
        tenantOverrides: { complianceEnabled: true },
      });

      mockAiReturns(makeValidEnvelope({
        reply: 'Nos garantimos o melhor!',
      }));

      await processMessage(makeJob(fixtures));

      const sentText = mockSendMessage.mock.calls[0][0].text;
      expect(sentText).not.toContain('garantimos');
      expect(stores.complianceAudits.size).toBe(1);
      expect([...stores.complianceAudits.values()][0].passed).toBe(false);
    });

    it('C2d — clean reply passes through regardless of complianceEnabled value', async () => {
      const fixtures = seedConversation({
        tenantOverrides: { complianceEnabled: false },
      });

      mockAiReturns(makeValidEnvelope({
        reply: 'A avaliacao e o primeiro passo.',
      }));

      await processMessage(makeJob(fixtures));

      const sentText = mockSendMessage.mock.calls[0][0].text;
      expect(sentText).toBe('A avaliacao e o primeiro passo.');
      expect(stores.complianceAudits.size).toBe(1);
      expect([...stores.complianceAudits.values()][0].passed).toBe(true);
    });

    it('C3 — new Prisma models have safe defaults (nullable fields)', () => {
      // Verify schema design: all new Tenant fields are optional
      const fixtures = seedPreMergeTenant();
      const t = fixtures.tenant;
      expect(t.complianceEnabled).toBeNull();
      expect(t.qualificationRules).toBeNull();
      expect(t.handoffNumber).toBeNull();
      expect(t.assessmentDesc).toBeNull();
      expect(t.toneNotes).toBeNull();

      // Conversation.stage has a default
      const c = fixtures.conversation;
      expect(c.stage).toBe('saudacao');
    });
  });
});
