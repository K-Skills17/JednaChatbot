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
              typeof c === 'object' && c.weight ? ` (weight: ${c.weight})` : '';
            return `${i + 1}. ${label}${weight}`;
          })
          .join('\n')
      : '1. Clear treatment need\n2. Timeline / urgency\n3. Decision-making authority\n4. Location fit';

  return `You are a dental patient reactivation specialist evaluating a lead for ${input.businessName}.

## Collected data about contact ${input.contactName ?? '(name unknown)'}:
${JSON.stringify(input.extractedData, null, 2)}

## Conversation summary:
${input.conversationSummary}

## Qualification criteria:
${criteriaList}

## Task:
Evaluate this lead based on the criteria above and return a JSON object:

\`\`\`json
{
  "leadScore": <number 0-100>,
  "leadStatus": "<qualified|lost>",
  "reasoning": "<2-3 sentence explanation in English>",
  "missingInfo": ["<any data still needed, if any>"]
}
\`\`\`

Scoring guidelines:
- 80-100: Hot lead — meets most criteria, high urgency, ready to book
- 60-79: Warm lead — meets some criteria, potential with follow-up
- 30-59: Cold lead — few criteria met, may need nurturing
- 0-29: Not a fit — disqualified

Respond ONLY with the JSON block.`;
}
