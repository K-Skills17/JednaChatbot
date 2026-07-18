// Strict JSON envelope parser for AI responses.
// NEVER throws — a malformed response degrades safely to a human handoff.

export type ConciergeAction = 'continue' | 'book' | 'handoff' | 'disqualify' | 'opt_out';

export type ConciergeStage =
  | 'greeting' | 'discovery' | 'qualifying' | 'value'
  | 'booking' | 'handoff' | 'closing';

export interface ConciergeEnvelope {
  reply: string;
  stage: ConciergeStage;
  qualification: Record<string, unknown>;
  action: ConciergeAction;
  handoff_reason: string | null;
  handoff_summary: string | null;
  compliance_flag: boolean;
  // Extended fields (optional)
  leadScore?: number;
  leadStatus?: string;
  qualificationReasoning?: string;
  bookingDate?: string;
  bookingTime?: string;
  extractedData?: Record<string, unknown>;
}

const FALLBACK: ConciergeEnvelope = {
  reply: "Let me connect you with our team — one moment.",
  stage: 'handoff',
  qualification: {},
  action: 'handoff',
  handoff_reason: 'parse_error',
  handoff_summary: 'Assistant response could not be parsed — routed to staff for safety.',
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

    // Support both new concierge envelope and legacy format
    const reply = obj.reply ?? obj.replyText;
    if (typeof reply !== 'string') return { ...FALLBACK };

    // Determine action
    let action: ConciergeAction = 'continue';
    if (obj.action && typeof obj.action === 'string') {
      // Accept both new English names and legacy Portuguese names
      const actionMap: Record<string, ConciergeAction> = {
        continue: 'continue', continuar: 'continue',
        book: 'book', agendar: 'book',
        handoff: 'handoff', encaminhar: 'handoff',
        disqualify: 'disqualify', desqualificar: 'disqualify',
        opt_out: 'opt_out',
      };
      action = actionMap[obj.action] ?? 'continue';
    } else if (obj.shouldEscalate) {
      action = 'handoff';
    } else if (obj.nextState === 'closed' && obj.bookingDate) {
      action = 'book';
    }

    // Map stage names (accept both English and legacy Portuguese)
    let stage: ConciergeStage = 'discovery';
    const stageRaw = obj.stage ?? '';
    const stageMap: Record<string, ConciergeStage> = {
      greeting: 'greeting',    saudacao: 'greeting',
      discovery: 'discovery',  descoberta: 'discovery',
      qualifying: 'qualifying', qualificacao: 'qualifying',
      value: 'value',          valor: 'value',
      booking: 'booking',      agendamento: 'booking',
      handoff: 'handoff',      encaminhamento: 'handoff',
      closing: 'closing',      encerramento: 'closing',
    };
    if (stageRaw && stageMap[stageRaw]) {
      stage = stageMap[stageRaw];
    } else if (!stageRaw && obj.nextState) {
      const nextStateMap: Record<string, ConciergeStage> = {
        greeting: 'greeting', qualifying: 'qualifying',
        qualified: 'value', booking: 'booking',
        closed: 'closing', awaiting_review: 'closing',
      };
      stage = nextStateMap[obj.nextState] ?? 'discovery';
    }

    return {
      reply,
      stage,
      qualification: obj.qualification ?? {},
      action,
      handoff_reason: obj.handoff_reason ?? null,
      handoff_summary: obj.handoff_summary ?? null,
      compliance_flag: Boolean(obj.compliance_flag),
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
