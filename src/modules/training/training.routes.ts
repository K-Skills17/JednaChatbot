import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { tenantService } from '../tenant/tenant.service';
import { authMiddleware } from '../../middleware/auth';
import { trainingPageHtml } from './training.page';

export function registerTrainingRoutes(app: FastifyInstance): void {
  // Serve the training dashboard (no auth — page itself handles API key)
  app.get(
    '/train/:tenantId',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { tenantId } = request.params as { tenantId: string };
      return reply.type('text/html').send(trainingPageHtml(tenantId));
    },
  );

  // Download template JSON
  app.get(
    '/api/training/template',
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const template = {
        _instructions: 'Fill in the fields below and upload this file on the training page, or use the web form. Fields marked (Hormozi) are based on the $100M Offers/$100M Leads frameworks for maximum conversion.',
        businessDescription: 'Describe your business in 2-3 sentences. Example: Clinica odontológica especializada em implantes dentários e estética dental, localizada em São Paulo.',
        targetAudience: 'Who are your ideal customers? Example: Adultos de 25-60 anos que buscam tratamentos estéticos dentários.',
        tone: 'friendly',
        greeting: 'Your custom welcome message. Example: Olá! Bem-vindo à Clínica Dental! Como posso ajudar você hoje?',
        closingMessage: 'Your goodbye message. Example: Obrigado pelo contato! Qualquer dúvida, estamos à disposição!',
        services: [
          {
            name: 'Service name',
            description: 'Brief description',
            price: 'R$ 100',
            dreamOutcome: '(Hormozi) The transformation this delivers. Example: Sorriso perfeito em 30 dias sem dor',
            valueStack: ['(Hormozi) Item 1 included', 'Item 2 included', 'Item 3 included'],
            bonuses: ['(Hormozi) Bonus 1 (valor: R$ X)', 'Bonus 2 (valor: R$ Y)'],
            guarantee: '(Hormozi) Risk reversal statement. Example: Se não ficar satisfeito em 30 dias, devolvemos seu dinheiro',
          },
        ],
        faq: [
          { question: 'Common question / objection?', answer: 'Answer that resolves the concern AND moves toward action.' },
        ],
        qualificationCriteria: [
          { label: 'What criterion qualifies a good lead?', weight: 3 },
          { label: 'Another criterion', weight: 2 },
        ],
        forbiddenTopics: ['politics', 'religion', 'competitors'],
        escalationRules: 'When should the bot hand off to a human? Example: When the customer asks for a discount above 20% or complains about a past service.',
        // Hormozi-inspired fields
        painPoints: ['(Hormozi) Common pain 1 of your target audience', 'Common pain 2'],
        dreamOutcome: '(Hormozi) The big transformation your business delivers overall',
        uniqueMechanism: '(Hormozi) What makes your solution different from competitors',
        socialProof: ['(Hormozi) Testimonial or stat 1', 'Case study or number 2'],
        scarcity: '(Hormozi) Real capacity limit. Example: Aceitamos apenas 10 novos clientes por mês',
        urgency: '(Hormozi) Time-based reason to act now. Example: Promoção válida até o final do mês',
        leadMagnet: '(Hormozi) Free value offer. Example: Avaliação gratuita com diagnóstico completo',
        referralIncentive: '(Hormozi) What they get for referring. Example: 10% de desconto para cada indicação',
      };

      return reply
        .header('Content-Disposition', 'attachment; filename="training-template.json"')
        .type('application/json')
        .send(JSON.stringify(template, null, 2));
    },
  );

  // Save training config (authenticated)
  app.post(
    '/api/training/:tenantId',
    { preHandler: authMiddleware },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { tenantId } = request.params as { tenantId: string };
      const body = request.body as Record<string, any>;

      // Load existing config so partial updates don't erase other fields
      const existing = await tenantService.getById(tenantId);
      const existingConfig = (existing?.aiConfig as Record<string, any>) ?? {};
      const aiConfig: Record<string, any> = { ...existingConfig };

      if (body.businessDescription !== undefined) aiConfig.businessDescription = body.businessDescription;
      if (body.targetAudience !== undefined) aiConfig.targetAudience = body.targetAudience;
      if (body.tone !== undefined) aiConfig.tone = body.tone;
      if (body.greeting !== undefined) aiConfig.greeting = body.greeting;
      if (body.closingMessage !== undefined) aiConfig.closingMessage = body.closingMessage;
      if (body.escalationRules !== undefined) aiConfig.escalationRules = body.escalationRules;
      if (body.services !== undefined) aiConfig.services = body.services;
      if (body.faq !== undefined) aiConfig.faq = body.faq;
      if (body.qualificationCriteria !== undefined) aiConfig.qualificationCriteria = body.qualificationCriteria;
      if (body.forbiddenTopics !== undefined) aiConfig.forbiddenTopics = body.forbiddenTopics;
      if (body.systemPrompt !== undefined) aiConfig.systemPrompt = body.systemPrompt;
      // Hormozi-inspired fields
      if (body.painPoints !== undefined) aiConfig.painPoints = body.painPoints;
      if (body.dreamOutcome !== undefined) aiConfig.dreamOutcome = body.dreamOutcome;
      if (body.uniqueMechanism !== undefined) aiConfig.uniqueMechanism = body.uniqueMechanism;
      if (body.socialProof !== undefined) aiConfig.socialProof = body.socialProof;
      if (body.scarcity !== undefined) aiConfig.scarcity = body.scarcity;
      if (body.urgency !== undefined) aiConfig.urgency = body.urgency;
      if (body.leadMagnet !== undefined) aiConfig.leadMagnet = body.leadMagnet;
      if (body.referralIncentive !== undefined) aiConfig.referralIncentive = body.referralIncentive;

      const tenant = await tenantService.update(tenantId, { aiConfig: aiConfig as any });
      return reply.send({ success: true, tenant });
    },
  );
}
