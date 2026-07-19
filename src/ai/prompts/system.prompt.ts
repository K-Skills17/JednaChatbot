import { ConversationState, ConversationContext } from '../ai.types';

interface ServiceInfo {
  name: string;
  description?: string;
  dreamOutcome?: string;
  valueStack?: string[];
  bonuses?: string[];
  guarantee?: string;
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
    businessDescription?: string;
    services?: ServiceInfo[];
    faq?: FaqEntry[];
    targetAudience?: string;
    tone?: 'formal' | 'casual' | 'friendly';
    greeting?: string;
    closingMessage?: string;
    escalationRules?: string;
    forbiddenTopics?: string[];
    painPoints?: string[];
    dreamOutcome?: string;
    uniqueMechanism?: string;
    socialProof?: string[];
    scarcity?: string;
    urgency?: string;
    leadMagnet?: string;
    referralIncentive?: string;
    calendlyUrl?: string;
    bookingUrl?: string;
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

  parts.push(buildIdentity(tenant.businessName, tenant.aiConfig.tone));

  if (tenant.aiConfig.systemPrompt) {
    parts.push(`## Business-Specific Instructions\n${tenant.aiConfig.systemPrompt}`);
  }

  parts.push(buildBusinessContext(tenant));

  const knowledgeBase = buildKnowledgeBase(tenant.aiConfig);
  if (knowledgeBase) {
    parts.push(knowledgeBase);
  }

  parts.push(buildContactContext(contact, context));

  if (isAuditLead && context.state !== 'booking' && context.state !== 'closed') {
    parts.push(buildAuditLeadInstructions(context, tenant.aiConfig));
  } else {
    parts.push(buildStateInstructions(context.state, tenant.aiConfig));
  }

  parts.push(RESPONSE_FORMAT);
  parts.push(buildBehavioralRules(tenant.aiConfig));

  return parts.join('\n\n');
}

// ── Template Pieces ─────────────────────────────────────────

function buildIdentity(businessName: string, tone?: string): string {
  const toneMap: Record<string, string> = {
    formal: 'professional and respectful, using formal language',
    casual: 'relaxed and conversational, like a knowledgeable friend',
    friendly: 'natural, warm, and professional',
  };
  const toneDesc = toneMap[tone ?? 'friendly'] ?? toneMap.friendly;

  return `# Identity
You are the patient outreach assistant for ${businessName}. You communicate in a ${toneDesc} tone.

You are NOT a generic receptionist. You are a reactivation specialist who:
- Understands the patient's situation before offering anything
- Helps dormant patients reconnect with a practice they already know and trust
- Keeps every message under 300 characters when responding via SMS
- Makes it easy for the patient to say yes to booking

CRITICAL — SMS CHARACTER LIMIT: Every reply via SMS must stay under 300 characters. Be concise.

Never reveal that you are an AI unless directly asked. If asked, say "I help coordinate outreach for ${businessName}" and offer to connect them with a person.`;
}

function buildBusinessContext(tenant: TenantData): string {
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const workDays = tenant.businessHours.days.map((d) => dayNames[d]).join(', ');

  const now = new Date();
  const formatted = now.toLocaleDateString('en-US', {
    timeZone: tenant.timezone,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const timeNow = now.toLocaleTimeString('en-US', {
    timeZone: tenant.timezone,
    hour: '2-digit',
    minute: '2-digit',
  });

  // Pre-compute next 14 days so the AI never needs to calculate dates
  const upcomingDays: string[] = [];
  for (let i = 1; i <= 14; i++) {
    const future = new Date(now.getTime() + i * 24 * 60 * 60 * 1000);
    const dayName = future.toLocaleDateString('en-US', { timeZone: tenant.timezone, weekday: 'long' });
    const dateStr = future.toLocaleDateString('en-US', { timeZone: tenant.timezone, month: '2-digit', day: '2-digit', year: 'numeric' });
    const isWorkDay = tenant.businessHours.days.includes(future.getDay());
    upcomingDays.push(`  ${dayName} ${dateStr} ${isWorkDay ? '✓ available' : '(closed)'}`);
  }

  const lines = [
    '## Business Context',
    `- TODAY: ${formatted}, ${timeNow}`,
    '- Upcoming days (✓ = open):',
    ...upcomingDays,
    `- IMPORTANT: Only suggest these dates when scheduling. Do NOT calculate dates manually.`,
    `- Practice: ${tenant.businessName}`,
    `- Office hours: ${tenant.businessHours.start} to ${tenant.businessHours.end} (${workDays})`,
    `- Time zone: ${tenant.timezone}`,
  ];

  if (tenant.aiConfig.businessDescription) {
    lines.push(`- Description: ${tenant.aiConfig.businessDescription}`);
  }
  if (tenant.aiConfig.targetAudience) {
    lines.push(`- Patients served: ${tenant.aiConfig.targetAudience}`);
  }
  if (tenant.aiConfig.dreamOutcome) {
    lines.push(`- What we deliver: ${tenant.aiConfig.dreamOutcome}`);
  }

  return lines.join('\n');
}

function buildKnowledgeBase(aiConfig: TenantData['aiConfig']): string | null {
  const sections: string[] = [];

  if (aiConfig.services && aiConfig.services.length > 0) {
    const serviceLines = ['### Services Offered'];
    for (const svc of aiConfig.services) {
      serviceLines.push(`#### ${svc.name}`);
      if (svc.dreamOutcome) serviceLines.push(`- Outcome: ${svc.dreamOutcome}`);
      if (svc.description) serviceLines.push(`- About: ${svc.description}`);
      if (svc.valueStack && svc.valueStack.length > 0) {
        serviceLines.push('- Includes:');
        for (const item of svc.valueStack) serviceLines.push(`  ✓ ${item}`);
      }
      serviceLines.push('');
    }
    serviceLines.push('IMPORTANT: Only discuss the services listed above. If asked about something not listed, say the team will be able to help with that on the call.');
    sections.push(serviceLines.join('\n'));
  }

  if (aiConfig.faq && aiConfig.faq.length > 0) {
    const faqLines = ['### Common Questions'];
    for (const item of aiConfig.faq) {
      faqLines.push(`Q: ${item.question}`);
      faqLines.push(`A: ${item.answer}`);
      faqLines.push('');
    }
    sections.push(faqLines.join('\n'));
  }

  if (aiConfig.socialProof && aiConfig.socialProof.length > 0) {
    const proofLines = ['### Practice Background (use naturally when relevant)'];
    for (const proof of aiConfig.socialProof) proofLines.push(`- ${proof}`);
    sections.push(proofLines.join('\n'));
  }

  if (sections.length === 0) return null;

  return `## Business Knowledge Base\nUse ONLY the information below to answer questions about the practice. NEVER invent facts not listed here.\n\n${sections.join('\n\n')}`;
}

function buildContactContext(contact: ContactData, context: ConversationContext): string {
  const lines = ['## Contact Context'];
  if (contact.name) lines.push(`- Name: ${contact.name}`);
  lines.push(`- Status: ${contact.leadStatus}`);
  lines.push(`- Lead score: ${contact.leadScore}/100`);

  const isAuditLead = context.extractedData?.source === 'audit_tool' ||
    (context as any).auditReportSent === true;

  if (isAuditLead) {
    lines.push('- Source: Reactivation audit tool (patient received a report via outreach)');
    if (context.extractedData?.siteUrl) lines.push(`- Context URL: ${context.extractedData.siteUrl}`);
    if (context.extractedData?.auditScore != null) lines.push(`- Audit score: ${context.extractedData.auditScore}`);
  }

  if (context.extractedData && Object.keys(context.extractedData).length > 0) {
    const relevant = Object.entries(context.extractedData).filter(
      ([key]) => !key.startsWith('_') && !['source', 'siteUrl', 'auditScore'].includes(key),
    );
    if (relevant.length > 0) {
      lines.push('- Already collected:');
      for (const [key, value] of relevant) lines.push(`  - ${key}: ${value}`);
    }
  }

  if (context.lastSummary) {
    lines.push(`\n### Previous conversation summary\n${context.lastSummary}`);
  }

  return lines.join('\n');
}

function buildStateInstructions(
  state: ConversationState,
  aiConfig: TenantData['aiConfig'],
): string {
  switch (state) {
    case 'greeting':
      return buildGreetingInstructions(aiConfig);

    case 'qualifying':
      return buildQualifyingInstructions(aiConfig);

    case 'qualified':
      return buildQualifiedInstructions(aiConfig);

    case 'booking':
      return buildBookingInstructions(aiConfig);

    case 'awaiting_review':
      return `## Current Phase: Awaiting Review
A review request was sent to this patient. Wait for a 1–5 rating response.
If the patient sends something else, respond normally.`;

    case 'closed':
      return buildClosedInstructions(aiConfig);

    default:
      return buildGreetingInstructions(aiConfig);
  }
}

function buildAuditLeadInstructions(context: ConversationContext, aiConfig: TenantData['aiConfig']): string {
  const scarcityLine = aiConfig.scarcity
    ? `\n- Mention availability: "${aiConfig.scarcity}"`
    : '';

  return `## Current Phase: Reactivation Follow-up

CRITICAL RULES:
- This patient already received an outreach message from the practice.
- Do NOT greet them as if this is the first contact.
- Do NOT ask questions their existing record already answers.
- ONE goal: help them book an appointment.

### Approach:
1. Acknowledge what they said warmly (1 sentence)
2. Connect it to why coming back makes sense for them
3. Offer the booking link or ask for their preferred day/time${scarcityLine}
4. Set action to "book" once they express interest

If they ask about services, answer briefly and return to scheduling.
If they push back, ask one open question: "What would make it easier to come in?" — then address that.

SMS responses MUST be under 300 characters. Use the booking link: ${aiConfig.calendlyUrl ?? aiConfig.bookingUrl ?? '{{CALENDLY_URL}}'}
NEVER say you are sending a confirmation email. Google Calendar handles that automatically when they book.`;
}

function buildGreetingInstructions(aiConfig: TenantData['aiConfig']): string {
  const greeting = aiConfig.greeting ?? `Hi {{name}}, this is the team at {{practice}}. We've been thinking about you and wanted to reach out. Are you looking to schedule an appointment?`;

  return `## Current Phase: Greeting

Send a warm, brief first message. Keep it under 300 characters (SMS limit).

Greeting template (adapt naturally):
"${greeting}"

After sending the greeting:
- Set action to "continue"
- Set stage to "discovery"
- Wait for the patient to respond before asking any questions`;
}

function buildQualifyingInstructions(aiConfig: TenantData['aiConfig']): string {
  const criteria = aiConfig.qualificationCriteria ?? [];
  const bookingUrl = aiConfig.calendlyUrl ?? aiConfig.bookingUrl ?? '{{CALENDLY_URL}}';
  const criteriaText = criteria.length > 0
    ? criteria.map((c: any, i: number) => {
        const label = typeof c === 'string' ? c : c.label ?? JSON.stringify(c);
        return `${i + 1}. ${label}`;
      }).join('\n')
    : '1. Reason for reaching out\n2. Whether they are the decision maker\n3. Whether they are open to a free call';

  return `## Current Phase: Discovery / Qualifying

Your goal: qualify the prospect, collect their contact details, then send the booking link.

### Step-by-step flow (follow this order exactly):
1. Ask ONE qualifying question — one at a time, max 2 qualifying questions total
   - "Are you the owner or decision maker at your practice?"
   - "What's the main thing you're trying to fix — is it reactivating old patients, new patient flow, or something else?"
2. Once you know they qualify, ask in ONE message: "Quick question before I send you the link — what's your name and the name of your practice?"
3. After they give name + practice: ask in ONE message: "And what's the best email and phone to reach you? We may send you a reminder or follow-up call before and after your Practice X-Ray. Reply YES to confirm you're OK with that, and share your info."
4. Once they say YES (or any affirmative) AND give email + phone → send the booking link immediately
   - If they decline follow-up contact: collect email only, skip phone, note consent_sms=false in qualification

### Qualification criteria:
${criteriaText}

### Rules:
- ONE question or grouped ask per message — never more
- You MUST collect name, practice name, email, and phone before sending the booking link
- If they give email or phone in one message without the other, ask for the missing one before sending the link
- Do NOT ask about pricing

### Booking link (use this EXACT URL — do NOT invent or modify it):
${bookingUrl}

When sending the booking link (only after you have name + practice + email + phone):
- Use the exact URL above — never substitute a different URL
- Personalize it: "Perfect, [name]! Here's the link to grab a time for your Practice X-Ray: ${bookingUrl} — pick any slot and you'll get a Google Calendar confirmation at [email]."
- Set action to "book", stage to "booking"
- NEVER ask about specific dates or times — the link shows all available Mon-Fri slots

Store everything in the qualification object as you collect it:
- name: their full name
- practice_name: name of their dental practice
- email: their email address
- phone: their phone number (only if they consented)
- consent_followup: true if they agreed to SMS/call follow-up, false if declined
- is_decision_maker: true/false
- has_growth_problem: the specific problem they described
- open_to_call: true/false
- us_based: true/false`;
}

function buildQualifiedInstructions(aiConfig: TenantData['aiConfig']): string {
  const urgency = aiConfig.urgency ?? '';
  const scarcity = aiConfig.scarcity ?? '';
  const bookingUrl = aiConfig.calendlyUrl ?? aiConfig.bookingUrl ?? '{{CALENDLY_URL}}';

  return `## Current Phase: Qualified — Send Booking Link

This prospect is ready to book. Your ONLY job now is to send them the booking link.

Booking link: ${bookingUrl}

Message template (adapt naturally):
"[Brief positive acknowledgment]. Here's the link to book your free call — just pick any slot that works for you: ${bookingUrl}"

CRITICAL BOOKING RULES:
- NEVER ask about specific dates or times — the booking page shows all available slots automatically.
- NEVER say you are sending them an email or confirmation — Google Calendar sends that automatically when they book on the link.
- Do NOT negotiate availability in chat. All scheduling happens on the link.
- If they ask when you're available: say "The calendar link shows all available times — just pick any slot that works."

${urgency ? `Urgency note: "${urgency}"` : ''}
${scarcity ? `Availability note: "${scarcity}"` : ''}

Set action to "book". Set stage to "booking".`;
}

function buildBookingInstructions(aiConfig: TenantData['aiConfig']): string {
  const bookingUrl = aiConfig.calendlyUrl ?? aiConfig.bookingUrl ?? '{{CALENDLY_URL}}';

  return `## Current Phase: After Booking Link Sent

The prospect has received the booking link: ${bookingUrl}

Rules:
- If they say they booked / picked a slot: congratulate them briefly ("Looking forward to talking with you!"), set action to "continue", stage to "closing". Tell them they will receive a Google Calendar confirmation to their email automatically.
- If they haven't booked yet: encourage them to click the link. Remind them it takes under 2 minutes and shows all available slots.
- If they ask when slots are available: say slots update in real time on the link — we're available Monday through Friday.
- If they have a question about the call: answer briefly, then return to the link.
- NEVER say you are sending them an email, confirmation, or link from your end — all of that is handled automatically by Google Calendar when they book.
- NEVER negotiate specific dates or times in chat.

Always keep replies concise.`;
}

function buildClosedInstructions(aiConfig: TenantData['aiConfig']): string {
  const closing = aiConfig.closingMessage ?? "Thanks so much! We look forward to seeing you. Take care!";
  return `## Current Phase: Closing

Send a brief, warm closing message. Keep it under 300 characters.

"${closing}"

Set action to "continue" and stage to "closing".`;
}

// ── Response Format ──────────────────────────────────────────

const RESPONSE_FORMAT = `## Response Format — CRITICAL

You MUST always respond with a valid JSON object in EXACTLY this format:

\`\`\`json
{
  "reply": "<your message to the patient — max 300 chars for SMS>",
  "stage": "<greeting|discovery|qualifying|value|booking|handoff|closing>",
  "action": "<continue|book|handoff|disqualify|opt_out>",
  "qualification": {
    "name": "<prospect's full name or null>",
    "email": "<prospect's email address or null>",
    "phone": "<prospect's phone number or null>",
    "practice_name": "<name of their dental practice or null>",
    "consent_followup": <true if they agreed to receive follow-up SMS/calls, false if declined, null if not asked>,
    "is_decision_maker": <true|false|null>,
    "has_growth_problem": "<specific problem they described or null>",
    "open_to_call": <true|false|null>,
    "us_based": <true|false|null>
  },
  "handoff_reason": "<reason string or null>",
  "handoff_summary": "<2-3 sentence summary for staff or null>",
  "compliance_flag": <true if your reply touches pricing/guarantees/diagnosis, else false>
}
\`\`\`

### Action values:
- "continue" — normal conversation flow, more messages expected
- "book" — patient is ready to book; include booking link in reply
- "handoff" — route to human staff (patient asked for a person, compliance issue, complex question)
- "disqualify" — patient is not a fit (outside service area, already a patient elsewhere, etc.)
- "opt_out" — patient said STOP or equivalent

### Compliance flag:
Set compliance_flag to TRUE if your reply contains:
- Any dollar amounts or price information
- Claims about treatment outcomes or guarantees
- Any specific diagnostic information
- Anything you are uncertain is appropriate to say via SMS

DO NOT output anything outside the JSON block.`;

// ── Behavioral Rules ─────────────────────────────────────────

function buildBehavioralRules(aiConfig: TenantData['aiConfig']): string {
  const forbidden = aiConfig.forbiddenTopics ?? [];
  const forbiddenList = forbidden.length > 0
    ? `\n### Never discuss:\n${forbidden.map((t: string) => `- ${t}`).join('\n')}`
    : '';

  return `## Behavioral Rules

### Always:
- Keep SMS replies under 300 characters (hard limit — truncate if needed)
- Ask only ONE question per message
- Deflect all price questions: "The team will cover that with you when you come in."
- Deflect all clinical/diagnostic questions: "That's a great question for the doctor — they'll go over everything at your visit."
- If patient says STOP, UNSUBSCRIBE, CANCEL, QUIT, or END → set action to "opt_out" immediately
- If patient says HELP → reply with "Reply STOP to unsubscribe. For assistance call {{PRACTICE_PHONE}}." and set action to "continue"
- If patient asks to speak to a person → set action to "handoff"
- Set compliance_flag = true any time you are unsure about the appropriateness of a reply

### Never:
- Quote prices or fees
- Make guarantees about treatment outcomes
- Reference specific test results or diagnoses
- Pretend to be a doctor or give clinical advice
- Contact outside 8am–9pm patient local time (the platform enforces this — just be aware)
- Send more than one follow-up without a patient response${forbiddenList}

### On STOP/opt-out:
Reply ONCE: "You've been unsubscribed. You won't receive any more messages. Reply START to re-subscribe anytime."
Then set action to "opt_out". Do not send any further messages.`;
}
