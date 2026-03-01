/**
 * Seed script — creates the default LK tenant with WhatsApp number 11959041799.
 * Run with: npx tsx scripts/seed-tenant.ts
 *
 * Idempotent: if a tenant with this phone already exists, it skips creation.
 */
import { PrismaClient } from '../src/generated/prisma';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });

const WHATSAPP_NUMBER = '5511959041799';
const INSTANCE_NAME = `lk-principal-${Date.now()}`;

async function main() {
  console.log('Checking for existing tenant...');

  const existing = await prisma.tenant.findFirst({
    where: { whatsappNumber: WHATSAPP_NUMBER },
  });

  if (existing) {
    console.log(`Tenant already exists: ${existing.businessName} (${existing.id})`);
    console.log(`Instance: ${existing.evolutionInstanceId}`);
    console.log(`Status: ${existing.status}`);
    console.log('');
    console.log('Skipping creation. If you want to recreate, delete the existing tenant first.');
    return existing;
  }

  console.log('Creating tenant...');

  const tenant = await prisma.tenant.create({
    data: {
      businessName: 'LK Chatbot',
      whatsappNumber: WHATSAPP_NUMBER,
      evolutionInstanceId: INSTANCE_NAME,
      timezone: 'America/Sao_Paulo',
      businessHours: { start: '08:00', end: '18:00', days: [1, 2, 3, 4, 5] },
      aiConfig: {
        model: 'claude',
        temperature: 0.7,
        tone: 'friendly',
        qualificationCriteria: [
          { label: 'Necessidade ou problema a resolver', weight: 30 },
          { label: 'Urgência / prazo', weight: 20 },
          { label: 'É o decisor?', weight: 25 },
          { label: 'Orçamento disponível', weight: 25 },
        ],
        businessDescription: 'Assistente inteligente para atendimento ao cliente via WhatsApp',
        services: [
          {
            name: 'Atendimento Automatizado',
            description: 'Respostas inteligentes 24/7 via WhatsApp',
            price: 'Sob consulta',
          },
          {
            name: 'Qualificação de Leads',
            description: 'Triagem automática de potenciais clientes',
            price: 'Sob consulta',
          },
          {
            name: 'Agendamento',
            description: 'Marcação de reuniões e consultas pelo chatbot',
            price: 'Sob consulta',
          },
        ],
        faq: [
          {
            question: 'Como funciona o chatbot?',
            answer: 'Nosso chatbot usa inteligência artificial para conversar naturalmente com seus clientes pelo WhatsApp, qualificar leads e agendar reuniões automaticamente.',
          },
          {
            question: 'O chatbot funciona 24 horas?',
            answer: 'Sim! O chatbot funciona 24/7 e responde instantaneamente.',
          },
        ],
        greeting: 'Olá! 👋 Seja bem-vindo(a)! Como posso te ajudar hoje?',
        closingMessage: 'Foi um prazer conversar com você! Se precisar de algo mais, é só mandar mensagem. Até logo! 😊',
        escalationRules: 'Escale para atendimento humano quando o contato pedir explicitamente para falar com uma pessoa, ou quando o assunto for urgente ou sensível.',
        forbiddenTopics: ['política', 'religião', 'concorrentes'],
      },
      notificationConfig: {
        newLead: true,
        booking: true,
        escalation: true,
      },
      plan: 'pro',
      status: 'onboarding',
    },
  });

  console.log('');
  console.log('=== Tenant Created Successfully ===');
  console.log(`  ID:       ${tenant.id}`);
  console.log(`  Name:     ${tenant.businessName}`);
  console.log(`  Phone:    ${tenant.whatsappNumber}`);
  console.log(`  Instance: ${tenant.evolutionInstanceId}`);
  console.log(`  Status:   ${tenant.status}`);
  console.log('');

  return tenant;
}

main()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
