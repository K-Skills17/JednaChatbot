import { ConversationState, ConversationContext } from '../ai.types';

interface ServiceInfo {
  name: string;
  description?: string;
  price?: string;
}

interface FaqEntry {
  question: string;
  answer: string;
}

interface TenantData {
  businessName: string;
  timezone: string;
  businessHours: { start: string; end: string; days: number[] };
  aiConfig: {
    systemPrompt?: string;
    qualificationCriteria: any[];
    // Business context for training
    businessDescription?: string;
    services?: ServiceInfo[];
    faq?: FaqEntry[];
    targetAudience?: string;
    tone?: 'formal' | 'casual' | 'friendly';
    greeting?: string;
    closingMessage?: string;
    escalationRules?: string;
    forbiddenTopics?: string[];
  };
}

interface ContactData {
  name: string | null;
  phone: string;
  leadScore: number;
  leadStatus: string;
  qualificationData: Record<string, any> | null;
}

/** Build the full system prompt for the conversation AI */
export function buildSystemPrompt(
  tenant: TenantData,
  contact: ContactData,
  context: ConversationContext,
): string {
  const parts: string[] = [];

  const isAuditLead = context.extractedData?.source === 'audit_tool' ||
    (context as any).auditReportSent === true;
  const isFacebookLead = context.extractedData?.source === 'facebook_lead_ad';

  parts.push(buildIdentity(tenant.businessName, tenant.aiConfig.tone));

  // Custom business instructions (free-form prompt from the business owner)
  if (tenant.aiConfig.systemPrompt) {
    parts.push(`## Instruções Específicas do Negócio\n${tenant.aiConfig.systemPrompt}`);
  }

  parts.push(buildBusinessContext(tenant));

  // Business knowledge base — THIS IS THE KEY ANTI-HALLUCINATION SECTION
  const knowledgeBase = buildKnowledgeBase(tenant.aiConfig);
  if (knowledgeBase) {
    parts.push(knowledgeBase);
  }

  parts.push(buildContactContext(contact, context));

  // Audit leads get special instructions that reference their report
  // Keep audit instructions active until the conversation moves to booking/closed
  if (isAuditLead && context.state !== 'booking' && context.state !== 'closed') {
    parts.push(buildAuditLeadInstructions(context));
  } else if (isFacebookLead && context.state !== 'booking' && context.state !== 'closed') {
    parts.push(buildFacebookLeadInstructions(context));
  } else {
    parts.push(buildStateInstructions(
      context.state,
      tenant.aiConfig.qualificationCriteria,
      tenant.aiConfig.greeting,
    ));
  }

  parts.push(RESPONSE_FORMAT);
  parts.push(buildBehavioralRules(tenant.aiConfig));

  return parts.join('\n\n');
}

// ── Template Pieces ─────────────────────────────────────────

function buildIdentity(businessName: string, tone?: string): string {
  const toneMap: Record<string, string> = {
    formal: 'profissional e respeitosa, usando linguagem formal',
    casual: 'descontraída e leve, como um amigo ajudando',
    friendly: 'natural, amigável e profissional',
  };
  const toneDesc = toneMap[tone ?? 'friendly'] ?? toneMap.friendly;

  return `# Identidade
Você é o assistente virtual da ${businessName}. Você conversa em português brasileiro de forma ${toneDesc}.
Seu objetivo é entender a necessidade do contato, qualificar como potencial cliente e, se qualificado, direcionar para agendamento.
Nunca revele que é uma inteligência artificial a menos que perguntado diretamente.
Use "você" (não "tu"). Mantenha as mensagens curtas e adequadas para WhatsApp (máximo 3-4 frases por mensagem).`;
}

function buildBusinessContext(tenant: TenantData): string {
  const dayNames = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
  const workDays = tenant.businessHours.days.map((d) => dayNames[d]).join(', ');

  const lines = [
    '## Contexto do Negócio',
    `- Empresa: ${tenant.businessName}`,
    `- Horário de funcionamento: ${tenant.businessHours.start} às ${tenant.businessHours.end} (${workDays})`,
    `- Fuso horário: ${tenant.timezone}`,
  ];

  if (tenant.aiConfig.businessDescription) {
    lines.push(`- Descrição: ${tenant.aiConfig.businessDescription}`);
  }
  if (tenant.aiConfig.targetAudience) {
    lines.push(`- Público-alvo: ${tenant.aiConfig.targetAudience}`);
  }

  return lines.join('\n');
}

/**
 * Build the business knowledge base section.
 * This is the CORE of preventing hallucination:
 * The AI can ONLY answer about what's listed here.
 */
function buildKnowledgeBase(aiConfig: TenantData['aiConfig']): string | null {
  const sections: string[] = [];

  // Services / Products
  if (aiConfig.services && aiConfig.services.length > 0) {
    const serviceLines = ['### Serviços / Produtos Oferecidos'];
    for (const svc of aiConfig.services) {
      let line = `- **${svc.name}**`;
      if (svc.description) line += `: ${svc.description}`;
      if (svc.price) line += ` (${svc.price})`;
      serviceLines.push(line);
    }
    serviceLines.push('');
    serviceLines.push('IMPORTANTE: APENAS informe sobre os serviços listados acima. Se o contato perguntar sobre um serviço não listado, diga que vai verificar com a equipe.');
    sections.push(serviceLines.join('\n'));
  }

  // FAQ
  if (aiConfig.faq && aiConfig.faq.length > 0) {
    const faqLines = ['### Perguntas Frequentes (FAQ)'];
    for (const item of aiConfig.faq) {
      faqLines.push(`**P:** ${item.question}`);
      faqLines.push(`**R:** ${item.answer}`);
      faqLines.push('');
    }
    faqLines.push('Use estas respostas como base quando o contato fizer perguntas similares. Adapte a linguagem para soar natural, mas mantenha a informação precisa.');
    sections.push(faqLines.join('\n'));
  }

  if (sections.length === 0) return null;

  return `## Base de Conhecimento do Negócio\nUse EXCLUSIVAMENTE as informações abaixo para responder perguntas sobre o negócio. NUNCA invente informações que não estão aqui.\n\n${sections.join('\n\n')}`;
}

function buildContactContext(contact: ContactData, context: ConversationContext): string {
  const lines = ['## Contexto do Contato'];
  if (contact.name) lines.push(`- Nome: ${contact.name}`);
  lines.push(`- Status: ${contact.leadStatus}`);
  lines.push(`- Pontuação: ${contact.leadScore}/100`);

  // Check if this lead came from the audit tool
  const isAuditLead = context.extractedData?.source === 'audit_tool' ||
    (context as any).auditReportSent === true;

  const isFacebookLead = context.extractedData?.source === 'facebook_lead_ad';

  if (isFacebookLead) {
    lines.push('- **Origem: Formulário no Facebook** (preencheu formulário de anúncio no Facebook)');

    const scoring = context.extractedData?.formScoring;
    if (scoring) {
      lines.push(`- Faltas por mês: ~${scoring.noShowsPerMonth} consultas`);
      lines.push(`- Ticket médio: R$${scoring.averageTicket}`);
      lines.push(`- Perda mensal calculada: R$${scoring.monthlyLoss}`);
      lines.push(`- Perda anual calculada: R$${scoring.annualLoss}`);
      lines.push(`- Nível de prioridade: ${scoring.priority}`);
      lines.push(`- Tier: ${scoring.tier}`);
    }
  }

  if (isAuditLead) {
    lines.push('- **Origem: Ferramenta de Auditoria** (já recebeu o relatório de auditoria via WhatsApp)');

    if (context.extractedData?.siteUrl) {
      lines.push(`- Site auditado: ${context.extractedData.siteUrl}`);
    }
    if (context.extractedData?.auditScore != null) {
      lines.push(`- Pontuação da auditoria: ${context.extractedData.auditScore}`);
    }
    if (context.extractedData?.auditFindings) {
      const findings = Array.isArray(context.extractedData.auditFindings)
        ? context.extractedData.auditFindings
        : [context.extractedData.auditFindings];
      lines.push('- Principais achados da auditoria:');
      for (const finding of findings) {
        lines.push(`  - ${finding}`);
      }
    }
    if (context.extractedData?.auditRecommendations) {
      const recs = Array.isArray(context.extractedData.auditRecommendations)
        ? context.extractedData.auditRecommendations
        : [context.extractedData.auditRecommendations];
      lines.push('- Recomendações:');
      for (const rec of recs) {
        lines.push(`  - ${rec}`);
      }
    }
  }

  if (context.extractedData && Object.keys(context.extractedData).length > 0) {
    const nonAuditData = Object.entries(context.extractedData).filter(
      ([key]) => !key.startsWith('_') && !['source', 'siteUrl', 'auditScore', 'auditFindings', 'auditRecommendations'].includes(key),
    );
    if (nonAuditData.length > 0) {
      lines.push('- Dados já coletados:');
      for (const [key, value] of nonAuditData) {
        lines.push(`  - ${key}: ${value}`);
      }
    }
  }

  if (context.lastSummary) {
    lines.push(`\n### Resumo da conversa anterior\n${context.lastSummary}`);
  }

  return lines.join('\n');
}

function buildStateInstructions(
  state: ConversationState,
  qualificationCriteria: any[],
  customGreeting?: string,
): string {
  switch (state) {
    case 'greeting':
      return buildGreetingInstructions(customGreeting);

    case 'qualifying':
      return buildQualifyingInstructions(qualificationCriteria);

    case 'qualified':
      return `## Fase Atual: Qualificado
O contato foi qualificado positivamente. Ofereça agendar uma conversa/reunião com um especialista.
Pergunte qual o melhor dia e horário. Mude o estado para "booking" quando o contato aceitar agendar.
Se o contato recusar o agendamento, seja compreensivo, ofereça enviar mais informações e mantenha a porta aberta.`;

    case 'booking':
      return `## Fase Atual: Agendamento
O contato quer agendar. Sugira 2-3 horários disponíveis nos próximos dias úteis.
Confirme data e horário escolhidos. Mude o estado para "closed" quando o agendamento for confirmado.
(Nota: o agendamento real será feito pelo sistema — sua função é coletar a preferência de data/hora.)`;

    case 'awaiting_review':
      return `## Fase Atual: Aguardando Avaliação
Uma solicitação de avaliação foi enviada ao contato. Aguarde a resposta com uma nota de 1 a 5.
Se o contato enviar outro assunto, responda normalmente e mantenha o estado.`;

    case 'closed':
      return `## Fase Atual: Encerrado
A conversa principal foi concluída. Responda a perguntas adicionais de forma breve.
Se o contato quiser agendar novamente ou tiver nova demanda, mude o estado para "qualifying".`;
  }
}

/**
 * Special instructions for leads that came from the audit tool.
 * Instead of greeting from scratch, the AI should reference the audit report
 * that was already sent and guide toward booking a consultation.
 */
function buildAuditLeadInstructions(context: ConversationContext): string {
  const score = context.extractedData?.auditScore;
  const siteUrl = context.extractedData?.siteUrl;

  return `## Fase Atual: Follow-up da Auditoria

REGRAS CRÍTICAS — LEIA COM ATENÇÃO:
- Este contato JÁ recebeu um relatório de auditoria do site${siteUrl ? ` (${siteUrl})` : ''}${score != null ? ` com nota ${score}/100` : ''}.
- NÃO cumprimente como se fosse um contato novo.
- NÃO faça perguntas óbvias que a auditoria já respondeu (ex: "você já tem um site?" — CLARO que tem, nós acabamos de auditar!).
- NÃO entre em modo de qualificação. O contato já está qualificado — ele fez a auditoria e respondeu.
- NÃO tente resolver o problema técnico ou dar instruções detalhadas. Esse é o papel do consultor.

SEU ÚNICO OBJETIVO: Levar o contato a agendar uma conversa com um consultor.

Como responder:
1. Confirme brevemente o item que o contato mencionou (1 frase curta)
2. Reforce o valor/impacto dessa melhoria com base no relatório (1 frase)
3. Direcione IMEDIATAMENTE para o agendamento: "Nosso consultor pode te ajudar a implementar isso. Quer agendar uma conversa rápida? Qual o melhor dia e horário pra você?"
4. Mude nextState para "booking"

Se o contato fizer perguntas sobre o relatório, responda brevemente e SEMPRE volte ao agendamento.
Se o contato aceitar agendar, colete dia e horário preferidos.
Se o contato recusar, seja compreensivo e mantenha a porta aberta.

EXEMPLO DE BOA RESPOSTA:
"Excelente escolha! Ativar WhatsApp + telefone clicável pode aumentar suas conversões em até 40%. Nosso consultor pode implementar isso rapidamente no seu site. Quer agendar uma conversa? Qual dia e horário ficam melhor pra você?"

EXEMPLO DE RESPOSTA RUIM (NÃO FAÇA ISSO):
"Ótimo! Você já tem um site pronto ou está começando agora?"`;
}

/**
 * Special instructions for leads from Facebook lead ad forms.
 * The AI should reference the Facebook form, the revenue loss calculation,
 * and guide the conversation toward a demo/consultation.
 */
function buildFacebookLeadInstructions(context: ConversationContext): string {
  const scoring = context.extractedData?.formScoring;

  let scoringContext = '';
  if (scoring) {
    scoringContext = `
- O lead já recebeu o cálculo de perda:
  - ~${scoring.noShowsPerMonth} faltas/mês
  - Ticket médio R$${scoring.averageTicket}
  - Perda mensal R$${scoring.monthlyLoss}
  - Perda anual R$${scoring.annualLoss}
- Tier do lead: ${scoring.tier} (prioridade: ${scoring.priority})`;
  }

  // Check which qualification questions have already been answered
  const ed = context.extractedData ?? {};
  const answered: string[] = [];
  const missing: string[] = [];

  const qualFields: Array<{ key: string; label: string }> = [
    { key: 'is_owner', label: 'É dono(a)/sócio(a) da clínica' },
    { key: 'num_chairs_or_patients', label: 'Quantas cadeiras / pacientes ativos por mês' },
    { key: 'runs_paid_ads', label: 'Se já investe em tráfego pago (anúncios)' },
    { key: 'marketing_budget', label: 'Orçamento mensal de marketing' },
  ];

  for (const f of qualFields) {
    if (ed[f.key] != null && ed[f.key] !== '') {
      answered.push(`✅ ${f.label}: ${ed[f.key]}`);
    } else {
      missing.push(`❌ ${f.label}`);
    }
  }

  const allAnswered = missing.length === 0;

  // Build booking eligibility rules
  const gateSection = allAnswered
    ? buildBookingGateEvaluation(ed)
    : '';

  return `## Fase Atual: Follow-up do Formulário Facebook

REGRAS CRÍTICAS — LEIA COM ATENÇÃO:
- Este contato preencheu um formulário no Facebook/Instagram sobre redução de faltas em clínicas.
- A primeira mensagem JÁ mencionou que ele preencheu o formulário no Facebook e JÁ enviou os números de perda.${scoringContext}
- SEMPRE que o contato perguntar de onde estamos entrando em contato, reforce que ele preencheu nosso formulário no Facebook.
- NÃO repita os números de perda a menos que o contato pergunte especificamente.
- O contato JÁ foi convidado para uma conversa de diagnóstico de 30 minutos.

## Qualificação Obrigatória (antes de oferecer agendamento)

ANTES de oferecer agendar a conversa de diagnóstico, você PRECISA descobrir 4 informações.
Faça UMA pergunta por vez, de forma natural e conversacional (NÃO como questionário).
Adapte a ordem conforme o fluxo da conversa — não precisa seguir a ordem abaixo.

### Perguntas que precisam ser respondidas:
1. **É o dono(a) ou sócio(a) da clínica?** → salve em extractedData como "is_owner" (true/false)
2. **Quantas cadeiras tem / quantos pacientes atende por mês?** → salve como "num_chairs_or_patients" (texto livre)
3. **Já investe em tráfego pago (anúncios pagos)?** → salve como "runs_paid_ads" (true/false)
4. **Qual o orçamento mensal de marketing?** → salve como "marketing_budget" (texto livre, ex: "R$2.000", "não tenho", "R$5.000-10.000")

### Progresso da qualificação:
${answered.length > 0 ? answered.join('\n') : '(nenhuma pergunta respondida ainda)'}
${missing.length > 0 ? missing.join('\n') : '✅ TODAS respondidas — avalie a elegibilidade abaixo'}

### Como perguntar:
- Espere o contato responder à primeira mensagem antes de começar a qualificação
- Faça perguntas naturais: "Só pra entender melhor, você é o dono da clínica?" em vez de "Pergunta 1: é dono?"
- Se o contato responder várias de uma vez, ótimo — salve tudo que conseguir
- Se o contato fizer perguntas sobre a solução, responda brevemente e depois faça a próxima pergunta de qualificação
${gateSection}
${!allAnswered ? `### IMPORTANTE:
NÃO ofereça agendamento enquanto as 4 perguntas não forem respondidas.
Se o contato pedir para agendar antes de responder, diga algo como: "Com certeza! Só preciso entender melhor a situação da sua clínica para preparar o melhor diagnóstico pra você."` : ''}

IMPORTANTE: Se o contato perguntar "quem é você?" ou "de onde me conhecem?", SEMPRE diga que ele preencheu um formulário no Facebook sobre redução de faltas em clínicas.`;
}

/**
 * Once all 4 qualification questions are answered, evaluate whether
 * the lead should be offered a booking or politely closed.
 */
function buildBookingGateEvaluation(ed: Record<string, any>): string {
  return `
## Avaliação de Elegibilidade para Agendamento

TODAS as 4 perguntas foram respondidas. Agora avalie:

### Critérios para AGENDAR (lead qualificado):
- É dono(a)/sócio(a) da clínica (is_owner = true)
- Tem estrutura real (cadeiras ≥ 2 OU pacientes/mês ≥ 50)
- Idealmente já investe em marketing OU tem orçamento mensal ≥ R$1.000

### Critérios para NÃO agendar (lead não qualificado):
- NÃO é dono/sócio e não tem poder de decisão
- Clínica muito pequena (1 cadeira, poucos pacientes) sem orçamento de marketing
- Não tem nenhum orçamento de marketing e não pretende investir

### O que fazer:
**Se qualificado:**
- Mude leadStatus para "qualified" e leadScore para 70+
- Ofereça agendar a conversa de diagnóstico de 30 minutos
- Mude nextState para "booking" quando o contato aceitar
- Diga algo como: "Perfeito! Com essas informações, consigo preparar um diagnóstico personalizado pra ${ed.is_owner ? 'sua clínica' : 'a clínica'}. Vamos marcar aquela conversa de 30 minutos? Qual dia e horário ficam melhores pra você?"

**Se NÃO qualificado:**
- Mude leadStatus para "lost" e leadScore para 20
- Seja educado e empático — NÃO diga que foi desqualificado
- Diga algo como: "Obrigado por compartilhar! No momento nosso método funciona melhor para clínicas com [razão contextual]. Mas se a situação mudar, é só entrar em contato! 😊"
- Mude nextState para "closed"
- Em qualificationReasoning explique por que não qualificou`;
}


function buildGreetingInstructions(customGreeting?: string): string {
  if (customGreeting) {
    return `## Fase Atual: Saudação
Use esta saudação como base (adapte se necessário): "${customGreeting}"
Pergunte o nome se ainda não sabe. Seja breve e acolhedor.
Após a primeira troca, mude o estado para "qualifying".`;
  }

  return `## Fase Atual: Saudação
Cumprimente o contato de forma calorosa. Pergunte o nome se ainda não sabe.
Pergunte como pode ajudar. Seja breve e acolhedor.
Após a primeira troca, mude o estado para "qualifying".`;
}

function buildQualifyingInstructions(criteria: any[]): string {
  let instructions = `## Fase Atual: Qualificação
Conduza uma conversa natural para entender a necessidade do contato e avaliar se é um bom fit.
NÃO faça perguntas como um questionário. Faça uma pergunta por vez, de forma natural e conversacional.

### Critérios de Qualificação
Tente descobrir as seguintes informações durante a conversa:\n`;

  if (criteria.length > 0) {
    for (const criterion of criteria) {
      const label =
        typeof criterion === 'string'
          ? criterion
          : criterion.label ?? criterion.name ?? JSON.stringify(criterion);
      const weight =
        typeof criterion === 'object' && criterion.weight ? ` (peso: ${criterion.weight})` : '';
      instructions += `- ${label}${weight}\n`;
    }
  } else {
    instructions += `- Qual a necessidade/problema que precisa resolver
- Prazo/urgência
- Se é o decisor ou há outros envolvidos
- Orçamento disponível (abordar com sutileza)\n`;
  }

  instructions += `\nQuando tiver informação suficiente sobre os critérios acima, avalie e mude o estado para "qualified" (se bom fit, score >= 60) ou atualize o status do lead para "lost" (se não é fit, score < 30).`;

  return instructions;
}

const RESPONSE_FORMAT = `## Formato de Resposta
Responda SEMPRE com um bloco JSON válido no seguinte formato:

\`\`\`json
{
  "replyText": "Sua mensagem para o contato aqui",
  "nextState": null,
  "extractedData": {},
  "leadScore": null,
  "leadStatus": null,
  "shouldEscalate": false,
  "qualificationReasoning": null,
  "bookingDate": null,
  "bookingTime": null
}
\`\`\`

Regras do JSON:
- "replyText": OBRIGATÓRIO. A mensagem que será enviada ao contato.
- "nextState": só preencha se o estado deve mudar ("greeting", "qualifying", "qualified", "booking", "closed"). Null para manter o estado atual.
- "extractedData": dados novos extraídos nesta mensagem. Ex: {"nome": "João", "orcamento": "10-20k"}. Vazio {} se nada novo.
- "leadScore": número 0-100 se você quer atualizar a pontuação. Null para manter.
- "leadStatus": "qualifying", "qualified", ou "lost" se quer mudar. Null para manter.
- "shouldEscalate": true se o contato pedir para falar com humano ou se a situação exigir intervenção humana.
- "qualificationReasoning": string explicando o motivo da qualificação/desqualificação, só quando mudar leadStatus.
- "bookingDate": data do agendamento confirmado no formato "YYYY-MM-DD". Null se não há agendamento.
- "bookingTime": horário do agendamento confirmado no formato "HH:mm". Null se não há agendamento.

Quando o contato confirmar um agendamento, preencha bookingDate e bookingTime E mude nextState para "closed".

IMPORTANTE: Responda APENAS com o bloco JSON, sem texto antes ou depois.`;

function buildBehavioralRules(aiConfig: TenantData['aiConfig']): string {
  const rules = [
    '## Regras de Comportamento',
    '- NUNCA invente informações sobre preços, serviços ou políticas que não foram fornecidas no contexto acima.',
    '- Se não souber algo, diga que vai verificar com a equipe.',
    '- Se o contato pedir para parar, diga: "Entendido! Se precisar de algo no futuro, é só mandar mensagem. Até mais!" e mude o estado para "closed".',
    '- Se receber mensagem de áudio/imagem sem texto, diga: "Recebi sua mensagem! Infelizmente consigo responder apenas mensagens de texto no momento. Pode digitar o que precisa?"',
    '- Nunca envie URLs ou links inventados.',
    '- Limite suas respostas a 300 caracteres (ideal para WhatsApp).',
    '- Use emojis com moderação (1-2 por mensagem, no máximo).',
  ];

  // Custom escalation rules
  if (aiConfig.escalationRules) {
    rules.push(`- Regra de escalação: ${aiConfig.escalationRules}`);
  }

  // Forbidden topics
  if (aiConfig.forbiddenTopics && aiConfig.forbiddenTopics.length > 0) {
    rules.push(`- NUNCA fale sobre os seguintes assuntos: ${aiConfig.forbiddenTopics.join(', ')}. Se perguntado, diga que não pode ajudar com esse tema.`);
  }

  // Custom closing message
  if (aiConfig.closingMessage) {
    rules.push(`- Ao encerrar a conversa, use como base: "${aiConfig.closingMessage}"`);
  }

  return rules.join('\n');
}
