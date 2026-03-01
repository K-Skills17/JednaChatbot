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
        _instructions: 'Fill in the fields below and upload this file on the training page, or use the web form.',
        businessDescription: 'Describe your business in 2-3 sentences. Example: Clinica odontológica especializada em implantes dentários e estética dental, localizada em São Paulo.',
        targetAudience: 'Who are your ideal customers? Example: Adultos de 25-60 anos que buscam tratamentos estéticos dentários.',
        tone: 'friendly',
        greeting: 'Your custom welcome message. Example: Olá! Bem-vindo à Clínica Dental! Como posso ajudar você hoje?',
        closingMessage: 'Your goodbye message. Example: Obrigado pelo contato! Qualquer dúvida, estamos à disposição!',
        services: [
          { name: 'Service name', description: 'Brief description', price: 'R$ 100' },
          { name: 'Another service', description: 'Brief description', price: 'A partir de R$ 200' },
        ],
        faq: [
          { question: 'Common question 1?', answer: 'The answer to question 1.' },
          { question: 'Common question 2?', answer: 'The answer to question 2.' },
        ],
        qualificationCriteria: [
          { label: 'What criterion qualifies a good lead?', weight: 3 },
          { label: 'Another criterion', weight: 2 },
        ],
        forbiddenTopics: ['politics', 'religion', 'competitors'],
        escalationRules: 'When should the bot hand off to a human? Example: When the customer asks for a discount above 20% or complains about a past service.',
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

      // Build aiConfig from training payload
      const aiConfig: Record<string, any> = {};

      if (body.businessDescription) aiConfig.businessDescription = body.businessDescription;
      if (body.targetAudience) aiConfig.targetAudience = body.targetAudience;
      if (body.tone) aiConfig.tone = body.tone;
      if (body.greeting) aiConfig.greeting = body.greeting;
      if (body.closingMessage) aiConfig.closingMessage = body.closingMessage;
      if (body.escalationRules) aiConfig.escalationRules = body.escalationRules;
      if (body.services) aiConfig.services = body.services;
      if (body.faq) aiConfig.faq = body.faq;
      if (body.qualificationCriteria) aiConfig.qualificationCriteria = body.qualificationCriteria;
      if (body.forbiddenTopics) aiConfig.forbiddenTopics = body.forbiddenTopics;
      if (body.systemPrompt) aiConfig.systemPrompt = body.systemPrompt;

      const tenant = await tenantService.update(tenantId, { aiConfig: aiConfig as any });
      return reply.send({ success: true, tenant });
    },
  );
}
