// Strict JSON envelope parser for AI responses.
// NEVER throws — a malformed response degrades safely to a human handoff.

export type ConciergeAction = 'continuar' | 'agendar' | 'encaminhar' | 'desqualificar' | 'opt_out';

export type ConciergeStage =
  | 'saudacao' | 'descoberta' | 'qualificacao' | 'valor'
  | 'agendamento' | 'encaminhamento' | 'encerramento';

export interface ConciergeEnvelope {
  reply: string;
  stage: ConciergeStage;
  qualification: Record<string, unknown>;
  action: ConciergeAction;
  handoff_reason: string | null;
  handoff_summary: string | null;
  compliance_flag: boolean;
  // Extended fields from lk-chatbot's existing format (optional)
  leadScore?: number;
  leadStatus?: string;
  qualificationReasoning?: string;
  bookingDate?: string;
  bookingTime?: string;
  extractedData?: Record<string, unknown>;
}

const FALLBACK: ConciergeEnvelope = {
  reply: 'Vou te conectar com nossa equipe, um instante :)',
  stage: 'encaminhamento',
  qualification: {},
  action: 'encaminhar',
  handoff_reason: 'parse_error',
  handoff_summary: 'Falha ao interpretar a resposta do assistente — encaminhado por seguranca.',
  compliance_flag: true,
};

/**
 * Parse the model output into an envelope. Tolerates accidental code fences or
 * surrounding prose by extracting the outermost JSON object.
 * A malformed response degrades safely to a human handoff.
 */
export function parseEnvelope(raw: string): ConciergeEnvelope {
  if (!raw) return { ...FALLBACK };
  let text = raw.trim();

  // Strip ```json fences if the model added them despite instructions
  text = text.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();

  // Extract the outermost {...} if there is surrounding text
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first === -1 || last === -1 || last <= first) return { ...FALLBACK };

  try {
    const obj = JSON.parse(text.slice(first, last + 1));

    // Support both the new concierge envelope and the old lk-chatbot format
    const reply = obj.reply ?? obj.replyText;
    if (typeof reply !== 'string') return { ...FALLBACK };

    // Determine action from either format
    let action: ConciergeAction = 'continuar';
    if (obj.action && typeof obj.action === 'string') {
      action = obj.action as ConciergeAction;
    } else if (obj.shouldEscalate) {
      action = 'encaminhar';
    } else if (obj.nextState === 'closed' && obj.bookingDate) {
      action = 'agendar';
    }

    // Map old-format nextState to concierge stage
    let stage: ConciergeStage = obj.stage ?? 'descoberta';
    if (!obj.stage && obj.nextState) {
      const stateMap: Record<string, ConciergeStage> = {
        greeting: 'saudacao',
        qualifying: 'qualificacao',
        qualified: 'valor',
        booking: 'agendamento',
        closed: 'encerramento',
        awaiting_review: 'encerramento',
      };
      stage = stateMap[obj.nextState] ?? 'descoberta';
    }

    return {
      reply,
      stage,
      qualification: obj.qualification ?? {},
      action,
      handoff_reason: obj.handoff_reason ?? null,
      handoff_summary: obj.handoff_summary ?? null,
      compliance_flag: Boolean(obj.compliance_flag),
      // Carry through extended fields
      leadScore: obj.leadScore ?? undefined,
      leadStatus: obj.leadStatus ?? undefined,
      qualificationReasoning: obj.qualificationReasoning ?? undefined,
      bookingDate: obj.bookingDate ?? undefined,
      bookingTime: obj.bookingTime ?? undefined,
      extractedData: obj.extractedData ?? obj.qualification ?? undefined,
    };
  } catch {
    return { ...FALLBACK };
  }
}
