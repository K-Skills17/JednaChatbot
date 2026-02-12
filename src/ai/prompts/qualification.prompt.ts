interface QualificationInput {
  businessName: string;
  criteria: any[];
  contactName: string | null;
  extractedData: Record<string, any>;
  conversationSummary: string;
}

/**
 * Build a prompt for the smart model (Sonnet) to produce a final
 * qualification decision. This is a one-shot evaluation, not a conversation.
 */
export function buildQualificationPrompt(input: QualificationInput): string {
  const criteriaList =
    input.criteria.length > 0
      ? input.criteria
          .map((c, i) => {
            const label =
              typeof c === 'string' ? c : c.label ?? c.name ?? JSON.stringify(c);
            const weight =
              typeof c === 'object' && c.weight ? ` (peso: ${c.weight})` : '';
            return `${i + 1}. ${label}${weight}`;
          })
          .join('\n')
      : '1. Necessidade clara\n2. Prazo/urgência\n3. Poder de decisão\n4. Orçamento';

  return `Você é um especialista em qualificação de leads para a empresa ${input.businessName}.

## Dados coletados sobre o contato ${input.contactName ?? '(nome desconhecido)'}:
${JSON.stringify(input.extractedData, null, 2)}

## Resumo da conversa:
${input.conversationSummary}

## Critérios de qualificação:
${criteriaList}

## Tarefa:
Avalie este lead com base nos critérios acima e retorne um JSON:

\`\`\`json
{
  "leadScore": <número 0-100>,
  "leadStatus": "<qualified|lost>",
  "reasoning": "<explicação em português de 2-3 frases>",
  "missingInfo": ["<dados que ainda faltam, se houver>"]
}
\`\`\`

Diretrizes de pontuação:
- 80-100: Lead quente, atende maioria dos critérios, urgência alta
- 60-79: Lead morno, atende alguns critérios, potencial
- 30-59: Lead frio, poucos critérios atendidos
- 0-29: Não é fit, desqualificado

Responda APENAS com o bloco JSON.`;
}
