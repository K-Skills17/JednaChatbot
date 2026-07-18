/**
 * Seed script — creates/updates the LK Digital tenant.
 *
 * Usage:
 *   npx tsx scripts/seed-tenant.ts                     # uses WHATSAPP_NUMBER from .env or default
 *   npx tsx scripts/seed-tenant.ts 5511999999999        # pass new number as argument
 *   WHATSAPP_NUMBER=5511999999999 npx tsx scripts/seed-tenant.ts  # via env var
 *
 * If a tenant with businessName "LK Digital" already exists, it updates the
 * aiConfig AND the whatsappNumber (if a new one is provided).
 *
 * Training data optimized using Hormozi $100M Offers + $100M Leads frameworks:
 * - Value Equation framing (Dream Outcome × Likelihood ÷ Time × Effort)
 * - Grand Slam Offer value stacking
 * - ACA conversation framework
 * - Scarcity/Urgency triggers
 * - Guarantee-based risk reversal
 * - Referral loop integration
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const dbUrl = process.env.DATABASE_URL ?? '';
const sep = dbUrl.includes('?') ? '&' : '?';
const url = `${dbUrl}${sep}schema=lk_chatbot`;
const pool = new Pool({ connectionString: url });
const adapter = new PrismaPg(pool, { schema: 'lk_chatbot' });
const prisma = new PrismaClient({ adapter });

// Priority: CLI arg > env var > old default
const WHATSAPP_NUMBER = process.argv[2] || process.env.WHATSAPP_NUMBER || '5511959041799';
const INSTANCE_NAME = `lk-principal-${Date.now()}`;

async function main() {
  console.log(`Using WhatsApp number: ${WHATSAPP_NUMBER}`);
  console.log('Checking for existing LK Digital tenant...');

  // Find by business name OR phone number (covers number changes)
  const existing = await prisma.tenant.findFirst({
    where: {
      OR: [
        { businessName: 'LK Digital' },
        { whatsappNumber: WHATSAPP_NUMBER },
      ],
    },
  });

  if (existing) {
    const numberChanged = existing.whatsappNumber !== WHATSAPP_NUMBER;
    console.log(`Tenant found: ${existing.businessName} (${existing.id})`);
    console.log(`Current number: ${existing.whatsappNumber}`);
    if (numberChanged) {
      console.log(`New number: ${WHATSAPP_NUMBER}`);
    }
    console.log('');
    console.log('Updating aiConfig with Hormozi-optimized training data...');

    const updateData: Record<string, any> = {
      aiConfig: buildAiConfig(),
    };

    // Update the number + create a new Evolution instance if changed
    if (numberChanged) {
      updateData.whatsappNumber = WHATSAPP_NUMBER;
      updateData.evolutionInstanceId = INSTANCE_NAME;
      console.log(`Updating WhatsApp number: ${existing.whatsappNumber} → ${WHATSAPP_NUMBER}`);
      console.log(`New Evolution instance: ${INSTANCE_NAME}`);
    }

    const updated = await prisma.tenant.update({
      where: { id: existing.id },
      data: updateData,
    });

    console.log('');
    console.log('=== Tenant Updated Successfully ===');
    console.log(`  Number:   ${updated.whatsappNumber}`);
    console.log(`  Instance: ${updated.evolutionInstanceId}`);
    if (numberChanged) {
      console.log('');
      console.log('NEXT STEPS:');
      console.log('  1. Connect the new number in Evolution API (scan QR code)');
      console.log('  2. Set up the webhook for the new instance');
      console.log('  3. Test with a message to the new number');
    }
    return updated;
  }

  console.log('Creating tenant...');

  const tenant = await prisma.tenant.create({
    data: {
      businessName: 'LK Digital',
      whatsappNumber: WHATSAPP_NUMBER,
      evolutionInstanceId: INSTANCE_NAME,
      timezone: 'America/Sao_Paulo',
      businessHours: { start: '08:00', end: '18:00', days: [1, 2, 3, 4, 5] },
      aiConfig: buildAiConfig(),
      notificationConfig: {
        newLead: true,
        booking: true,
        escalation: true,
      },
      plan: 'pro',
      status: 'active',
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

function buildAiConfig() {
  return {
    model: 'claude',
    temperature: 0.7,
    tone: 'friendly' as const,

    // ── Business Context ──────────────────────────────────────
    businessDescription:
      'A LK Digital é uma agência de marketing digital e desenvolvimento web que transforma a presença online de pequenas e médias empresas em máquinas de gerar clientes. Combinamos sites de alta conversão, automação inteligente e estratégias de marketing digital para entregar resultados mensuráveis — não apenas "presença online".',

    targetAudience:
      'Donos de pequenas e médias empresas no Brasil que sabem que precisam de presença digital mas estão frustrados com agências que entregam sites bonitos mas sem resultado, ou que cobram caro e não mostram ROI. Principalmente profissionais liberais (dentistas, advogados, consultores), comércios locais e prestadores de serviço.',

    // ── Hormozi: Dream Outcome ────────────────────────────────
    dreamOutcome:
      'Ter um sistema digital completo que gera clientes no piloto automático — site que converte, WhatsApp que vende, e marketing que atrai — sem precisar entender nada de tecnologia.',

    // ── Hormozi: Unique Mechanism ─────────────────────────────
    uniqueMechanism:
      'Diferente de agências tradicionais que apenas "fazem sites", a LK Digital implementa um Sistema Digital Completo: site otimizado para conversão + chatbot inteligente no WhatsApp + automação de marketing + SEO local. Tudo integrado e medido. Você não compra um site — você compra um sistema que gera clientes.',

    // ── Hormozi: Pain Points ──────────────────────────────────
    painPoints: [
      'Tem um site mas ele não gera nenhum cliente — é só um cartão de visita digital parado',
      'Perde clientes porque não responde mensagens rápido o suficiente no WhatsApp',
      'Já gastou dinheiro com agência/freelancer e não viu resultado',
      'Concorrentes estão aparecendo no Google e roubando clientes',
      'Não sabe quanto está perdendo por mês por não ter presença digital otimizada',
      'Quer crescer mas não tem tempo para aprender marketing digital',
      'Publica nas redes sociais mas não converte em clientes',
    ],

    // ── Hormozi: Social Proof ─────────────────────────────────
    socialProof: [
      'Já ajudamos mais de 50 empresas a transformar sua presença digital',
      'Média de 3x mais contatos pelo site após otimização',
      'Clientes reportam aumento de 40-60% em contatos via WhatsApp no primeiro mês',
      'Chatbot atende 24/7 e qualifica leads automaticamente — nenhuma mensagem perdida',
      'NPS de 92 entre nossos clientes ativos',
    ],

    // ── Hormozi: Scarcity & Urgency ──────────────────────────
    scarcity:
      'No momento estamos aceitando apenas 5 novos clientes por mês para garantir a qualidade de entrega e atenção personalizada. Já temos 3 vagas preenchidas este mês.',

    urgency:
      'Cada dia sem otimização são clientes que estão encontrando seu concorrente no Google ao invés de você. E com a temporada de fim de ano se aproximando, quem otimizar agora colhe os resultados na melhor época.',

    // ── Hormozi: Lead Magnet ──────────────────────────────────
    leadMagnet:
      'Auditoria Digital Gratuita do seu site e presença online — analisamos mais de 30 pontos técnicos e de conversão e te entregamos um relatório completo com prioridades de melhoria. Sem compromisso, sem pegadinha.',

    // ── Hormozi: Referral ─────────────────────────────────────
    referralIncentive:
      'Para cada indicação que fechar conosco, você ganha 1 mês gratuito de manutenção do seu site.',

    // ── Grand Slam Offers (Value-Stacked Services) ────────────
    services: [
      {
        name: 'Sistema Digital Completo',
        dreamOutcome: 'Ter uma máquina digital gerando clientes no piloto automático em 30 dias',
        description:
          'Site profissional otimizado para conversão + chatbot inteligente no WhatsApp + SEO local + automação de marketing. Tudo integrado em um sistema que funciona 24/7.',
        price: 'A partir de R$ 2.000 + R$ 800/mês',
        valueStack: [
          'Site profissional responsivo (mobile-first) com até 10 páginas',
          'Otimização de velocidade (nota 90+ no Google PageSpeed)',
          'SEO local para aparecer no Google da sua região',
          'Chatbot inteligente no WhatsApp (atende e qualifica 24/7)',
          'Integração com Google Meu Negócio',
          'Formulários de contato inteligentes com notificação instantânea',
          'Painel de métricas para acompanhar resultados',
          'Suporte prioritário via WhatsApp',
        ],
        bonuses: [
          'Auditoria completa da presença digital atual (valor: R$ 500)',
          'Setup de Google Analytics 4 + relatórios mensais (valor: R$ 300/mês)',
          'Treinamento em vídeo: Como Usar Seu Painel de Métricas (valor: R$ 200)',
          'Consultoria estratégica mensal de 30min (valor: R$ 400/mês)',
        ],
        guarantee:
          'Se em 90 dias você não tiver pelo menos 2x mais contatos pelo site do que antes, continuamos trabalhando de graça até bater a meta.',
      },
      {
        name: 'Site de Alta Conversão',
        dreamOutcome: 'Um site que transforma visitantes em contatos e clientes, não apenas um cartão de visita',
        description:
          'Site profissional desenvolvido com foco em conversão, velocidade e SEO. Cada elemento é pensado para levar o visitante a entrar em contato.',
        price: 'A partir de R$ 2.000',
        valueStack: [
          'Design profissional personalizado (não é template)',
          'Até 7 páginas otimizadas para conversão',
          'Responsivo (perfeito no celular)',
          'SEO on-page básico',
          'Formulário de contato + botão WhatsApp',
          'Certificado SSL (cadeado de segurança)',
          'Hospedagem inclusa no primeiro ano',
        ],
        bonuses: [
          'Domínio .com.br grátis no primeiro ano (valor: R$ 80)',
          'Setup de Google Meu Negócio (valor: R$ 300)',
          '3 banners profissionais para redes sociais (valor: R$ 150)',
        ],
        guarantee:
          'Se você não ficar satisfeito com o design, refazemos até você aprovar — sem custo adicional.',
      },
      {
        name: 'Chatbot Inteligente WhatsApp',
        dreamOutcome: 'Nunca mais perder um cliente por demora na resposta — atendimento automático 24/7 que qualifica e agenda',
        description:
          'Assistente virtual que conversa naturalmente com seus clientes pelo WhatsApp, qualifica leads automaticamente e agenda reuniões. Funciona 24/7.',
        price: 'A partir de R$ 800/mês',
        valueStack: [
          'Chatbot treinado especificamente para seu negócio',
          'Respostas em segundos, 24 horas por dia',
          'Qualificação automática de leads (separa curioso de comprador)',
          'Agendamento automático de consultas/reuniões',
          'Notificações em tempo real de leads quentes',
          'Relatório semanal de atendimentos e conversões',
        ],
        bonuses: [
          'Integração com seu Google Calendar (valor: R$ 200)',
          'Script de vendas personalizado baseado no seu negócio (valor: R$ 500)',
          'Re-treinamento mensal baseado nas conversas reais (valor: R$ 300/mês)',
        ],
        guarantee:
          'Teste 30 dias. Se o chatbot não responder pelo menos 90% das mensagens corretamente, devolvemos seu investimento.',
      },
      {
        name: 'Gestão de Marketing Digital',
        dreamOutcome: 'Marketing que gera clientes de verdade, com ROI medido — não likes e seguidores que não pagam boleto',
        description:
          'Gestão completa de marketing digital: conteúdo para redes sociais, Google Ads, SEO contínuo e relatórios de resultado. Tudo focado em gerar clientes, não vaidade.',
        price: 'A partir de R$ 1.500/mês',
        valueStack: [
          'Estratégia de conteúdo mensal (calendário editorial)',
          'Criação de 12-16 posts/mês para Instagram e Facebook',
          'Gestão de Google Ads com otimização semanal',
          'SEO contínuo (novos conteúdos + otimizações técnicas)',
          'Relatório mensal de resultados com ROI',
          'Reunião mensal de estratégia (30min)',
        ],
        bonuses: [
          'Análise de concorrentes trimestral (valor: R$ 400)',
          'Landing page para campanhas (valor: R$ 800)',
          'Setup de remarketing Facebook + Google (valor: R$ 500)',
        ],
        guarantee:
          'Se em 3 meses o investimento em ads não gerar pelo menos 3x o valor investido em leads qualificados, pausamos e ajustamos sem cobrar o mês de otimização.',
      },
    ],

    // ── Objection-Handling FAQ ─────────────────────────────────
    faq: [
      {
        question: 'Quanto custa?',
        answer:
          'Depende muito do que seu negócio precisa — cada projeto é único. Mas pensa comigo: se a gente conseguir dobrar seus contatos pelo site, quanto isso vale por mês pra você? O investimento começa a partir de R$ 2.000 para o site + R$ 800/mês para o sistema completo. O mais importante é que o retorno venha rápido — por isso oferecemos garantia de resultado.',
      },
      {
        question: 'Já tentei com outra agência e não funcionou',
        answer:
          'Entendo sua frustração — isso é mais comum do que deveria. A diferença é que a maioria das agências entrega um site bonito e desaparece. Nós entregamos um SISTEMA que gera clientes, e acompanhamos os resultados todo mês com métricas reais. Tanto que oferecemos garantia: se não bater a meta em 90 dias, trabalhamos de graça até bater.',
      },
      {
        question: 'Preciso pensar / vou ver depois',
        answer:
          'Claro, faz total sentido! Mas posso te fazer uma pergunta? Cada dia sem otimização são clientes entrando em contato com seu concorrente ao invés de você. Se fosse possível começar essa semana e já ver os primeiros resultados em 2 semanas, faria sentido pelo menos agendar uma conversa rápida com nosso especialista? São 15 minutos, sem compromisso.',
      },
      {
        question: 'É caro / não tenho orçamento agora',
        answer:
          'Entendo que investimento é uma preocupação. Mas pensa comigo: quanto você está PERDENDO por mês sem um sistema digital funcionando? Se são 5 clientes perdidos por mês e cada um vale R$ 500, são R$ 2.500/mês — R$ 30.000/ano — deixados na mesa. O investimento se paga em semanas, não meses. E temos condições especiais para quem fecha esse mês.',
      },
      {
        question: 'Quanto tempo leva para ter resultado?',
        answer:
          'O site fica pronto em 2-3 semanas. O chatbot no WhatsApp funciona no dia 1. Os primeiros resultados de SEO aparecem em 30-60 dias, e os resultados mais expressivos em 90 dias. Mas o mais importante: você começa a receber contatos pelo WhatsApp imediatamente quando o chatbot estiver ativo.',
      },
      {
        question: 'Como funciona o chatbot?',
        answer:
          'É como ter um vendedor treinado disponível 24 horas no seu WhatsApp. Ele conversa naturalmente com quem entra em contato, entende o que a pessoa precisa, qualifica se é um cliente real, e agenda uma conversa com você. Tudo automático. Você só fala com quem realmente está interessado.',
      },
      {
        question: 'Vocês fazem site em WordPress?',
        answer:
          'Trabalhamos com as melhores tecnologias para cada caso. O mais importante não é a plataforma — é se o site CONVERTE visitantes em clientes. Nossos sites são otimizados para velocidade, mobile e conversão, independente da tecnologia.',
      },
      {
        question: 'Vocês atendem minha região/cidade?',
        answer:
          'Atendemos todo o Brasil! Tudo é feito de forma remota e eficiente. As reuniões são por vídeo e WhatsApp, e isso permite que a gente atenda com a mesma qualidade em qualquer lugar do país.',
      },
      {
        question: 'Posso cancelar quando quiser?',
        answer:
          'Nossos planos mensais não têm fidelidade. Pode cancelar quando quiser. Mas sinceramente? Nossos clientes ficam porque veem resultado. E com a nossa garantia, o risco é zero pra você.',
      },
      {
        question: 'Qual a garantia?',
        answer:
          'Oferecemos garantia de resultado: se em 90 dias você não tiver pelo menos 2x mais contatos pelo site, continuamos trabalhando de graça até bater a meta. Fazemos isso porque confiamos no nosso trabalho — e porque quando você tem resultado, todo mundo ganha.',
      },
    ],

    // ── Qualification Criteria ─────────────────────────────────
    qualificationCriteria: [
      { label: 'Tem negócio ativo com clientes pagantes', weight: 25 },
      { label: 'Problema claro que precisa resolver (site ruim, sem leads, sem presença digital)', weight: 30 },
      { label: 'É o decisor ou tem influência direta na decisão', weight: 20 },
      { label: 'Tem urgência ou motivação para agir agora (evento, perda de clientes, concorrência)', weight: 15 },
      { label: 'Capacidade de investimento compatível (entende que marketing é investimento)', weight: 10 },
    ],

    // ── Greeting (Pattern Interrupt) ───────────────────────────
    greeting:
      'Oi! Tudo bem? Sou da LK Digital. Me conta — qual o maior desafio do seu negócio com o digital hoje? Quero entender como posso te ajudar de verdade.',

    closingMessage:
      'Foi ótimo conversar com você! Estou aqui sempre que precisar. Se conhecer alguém que também precisa melhorar a presença digital, me indica — é só mandar mensagem! Até breve!',

    escalationRules:
      'Escale para atendimento humano quando: (1) o contato pedir explicitamente para falar com uma pessoa, (2) o contato demonstrar insatisfação ou frustração repetida, (3) o assunto envolver reclamação sobre serviço já contratado, (4) questões financeiras/contratuais específicas que precisam de aprovação.',

    forbiddenTopics: ['política', 'religião', 'concorrentes específicos por nome', 'promessas de resultado exato em dinheiro'],

    facebookPageId: '617830531423137',
  };
}

main()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
