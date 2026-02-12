# WhatsApp Chatbot Outreach Platform — Brazil
## Full Project Plan & Requirements

**Stack:** Node.js + TypeScript | Evolution API | Claude/OpenAI + Flow Rules | 10-50 clients Month 1

---

## Section 1: System Architecture Overview
**Confidence: 0.92**

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    ADMIN DASHBOARD (React)                   │
│  Client onboarding | Flow builder | Analytics | Billing      │
└──────────────────────────┬──────────────────────────────────┘
                           │ REST/WebSocket
┌──────────────────────────▼──────────────────────────────────┐
│                  CORE API (Node.js + TypeScript)             │
│                                                              │
│  ┌──────────┐ ┌──────────┐ ┌───────────┐ ┌──────────────┐  │
│  │ Tenant   │ │ Convo    │ │ Booking   │ │ Notification │  │
│  │ Manager  │ │ Engine   │ │ Engine    │ │ Service      │  │
│  └──────────┘ └──────────┘ └───────────┘ └──────────────┘  │
│  ┌──────────┐ ┌──────────┐ ┌───────────┐ ┌──────────────┐  │
│  │ AI       │ │ Lead     │ │ Template  │ │ Webhook      │  │
│  │ Service  │ │ Qualifier│ │ Manager   │ │ Handler      │  │
│  └──────────┘ └──────────┘ └───────────┘ └──────────────┘  │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│              EVOLUTION API (Self-hosted)                      │
│         WhatsApp connection per client instance               │
└──────────────────────────┬──────────────────────────────────┘
                           │
                    WhatsApp Network
```

### Tech Stack Detail

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Runtime | Node.js 20+ LTS | Best WhatsApp ecosystem, async-first |
| Language | TypeScript 5.x | Type safety at scale, better DX |
| Framework | Fastify | 2x faster than Express, schema validation built-in |
| Database | PostgreSQL 16 | Multi-tenant, JSONB for flexible schemas, proven at scale |
| Cache/Queue | Redis + BullMQ | Message queuing, rate limiting, session cache |
| ORM | Prisma | Type-safe queries, migrations, multi-tenant support |
| WhatsApp | Evolution API v2 | Self-hosted, popular in Brazil, WhatsApp Web protocol |
| AI | Claude API (primary) + OpenAI (fallback) | Conversation + qualification |
| Scheduling | Google Calendar API / Cal.com | Booking engine |
| Dashboard | React + Vite + Tailwind | Admin panel for clients |
| Hosting | VPS (Hetzner/Contabo) or AWS | Cost-effective for Brazil market |
| Monitoring | Prometheus + Grafana | Uptime, message throughput |

---

## Section 2: Core Features Breakdown
**Confidence: 0.94**

### 2.1 Multi-Tenant Client Management

**What it does:** Each business (client) gets an isolated chatbot instance with its own WhatsApp number, conversation flows, AI personality, and booking settings.

**Requirements:**
- [ ] Tenant registration & onboarding flow
- [ ] Per-tenant Evolution API instance (or shared instance with session isolation)
- [ ] Per-tenant conversation flow configuration
- [ ] Per-tenant AI system prompt / personality
- [ ] Per-tenant business hours, timezone (Brazil has 4 timezones)
- [ ] Per-tenant booking calendar integration
- [ ] Per-tenant notification preferences
- [ ] Per-tenant analytics dashboard
- [ ] Tenant suspension / activation controls
- [ ] White-label capability (future)

**Data Model:**
```typescript
interface Tenant {
  id: string;
  businessName: string;
  whatsappNumber: string;
  evolutionInstanceId: string;
  timezone: string; // America/Sao_Paulo, America/Manaus, etc.
  businessHours: BusinessHours;
  aiConfig: {
    systemPrompt: string;
    model: 'claude' | 'openai';
    temperature: number;
    qualificationCriteria: QualificationRule[];
  };
  bookingConfig: BookingConfig;
  notificationConfig: NotificationConfig;
  status: 'active' | 'suspended' | 'onboarding';
  plan: 'starter' | 'pro' | 'enterprise';
  createdAt: Date;
}
```

### 2.2 Lead Qualification Engine
**Confidence: 0.91**

**What it does:** AI-driven qualification that scores incoming leads based on client-defined criteria and routes them accordingly.

**Requirements:**
- [ ] Configurable qualification criteria per tenant (budget, timeline, service need, location, company size)
- [ ] Multi-step qualification flow (not all questions at once — feels natural)
- [ ] Lead scoring system (0-100 scale)
- [ ] Auto-categorization: HOT (80-100), WARM (50-79), COLD (0-49)
- [ ] Different conversation paths per lead temperature
- [ ] Lead data extraction from natural conversation (AI parses intent, not rigid forms)
- [ ] Duplicate lead detection (same phone number)
- [ ] Lead history tracking (returning contacts get context)

**Qualification Flow:**
```
Incoming Message
    │
    ▼
┌─────────────┐
│ Is returning │──Yes──▶ Load context, continue conversation
│ contact?    │
└──────┬──────┘
       │ No
       ▼
┌─────────────┐
│ Greeting +  │
│ Introduction│
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ AI-Driven   │  (Natural conversation, not rigid Q&A)
│ Discovery   │  Extracts: need, budget, timeline, authority
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ Score Lead  │──HOT──▶ Offer booking immediately
│ (AI + Rules)│──WARM─▶ Nurture, provide value, re-engage
└──────┬──────┘──COLD─▶ Polite close, add to nurture list
       │
       ▼
┌─────────────┐
│ Store Lead  │
│ Notify Owner│
└─────────────┘
```

### 2.3 Automatic Booking System
**Confidence: 0.88**

**What it does:** Once a lead qualifies, the chatbot offers available time slots, books the appointment, and sends confirmations to both parties.

**Requirements:**
- [ ] Calendar integration (Google Calendar / Cal.com / custom)
- [ ] Timezone-aware slot availability (critical for Brazil's 4 timezones)
- [ ] Configurable appointment types (discovery call, demo, consultation)
- [ ] Configurable duration per appointment type
- [ ] Buffer time between appointments
- [ ] Maximum bookings per day limit
- [ ] Booking confirmation message to lead
- [ ] Booking confirmation + details to business owner
- [ ] Automated reminders (24h before, 1h before)
- [ ] Rescheduling capability via chatbot
- [ ] Cancellation handling
- [ ] No-show tracking
- [ ] Weekend/holiday awareness (Brazilian holidays: Carnaval, etc.)

**Booking Flow:**
```
Lead Qualified as HOT
    │
    ▼
"Ótimo! Gostaria de agendar uma conversa com nossa equipe?"
    │
    ▼
┌──────────────┐
│ Fetch        │
│ Available    │──▶ Show next 3-5 available slots
│ Slots        │    formatted in Brazilian Portuguese
└──────┬───────┘
       │
       ▼
Lead selects slot (natural language: "terça às 14h")
    │
    ▼
┌──────────────┐
│ AI parses    │
│ date/time    │──▶ Confirm: "Confirmado para terça, 14/03 às 14:00?"
└──────┬───────┘
       │
       ▼
┌──────────────┐
│ Create event │──▶ Google Calendar / Cal.com
│ Send confirm │──▶ WhatsApp confirmation to lead
│ Notify owner │──▶ WhatsApp/Email/Push to business
└──────────────┘
```

### 2.4 Business Notification System
**Confidence: 0.93**

**What it does:** Real-time notifications to business owners when leads qualify, book, or need human intervention.

**Requirements:**
- [ ] WhatsApp notification to business owner (new qualified lead)
- [ ] WhatsApp notification (new booking)
- [ ] Email summary (daily digest of leads + bookings)
- [ ] Webhook support (integrate with client's existing CRM/tools)
- [ ] Escalation alerts (lead requests human, chatbot can't handle)
- [ ] Configurable notification preferences per tenant
- [ ] Notification templates in Portuguese

**Notification Events:**
| Event | Channel | Priority |
|-------|---------|----------|
| New HOT lead | WhatsApp + Email | Immediate |
| New WARM lead | Email | Batch (hourly) |
| Booking confirmed | WhatsApp + Email | Immediate |
| Booking cancelled | WhatsApp | Immediate |
| Booking reminder (for owner) | WhatsApp | Scheduled |
| Lead requests human | WhatsApp | Urgent |
| Daily summary | Email | Daily 8am |
| Chatbot error/downtime | WhatsApp + Email | Urgent |

### 2.5 Conversation Engine (AI + Flow Rules)
**Confidence: 0.90**

**What it does:** Hybrid engine where AI handles natural conversation and flow rules enforce business logic (booking, qualification thresholds, escalation).

**Requirements:**
- [ ] AI conversation with full Portuguese Brazilian fluency
- [ ] Conversation context memory (per contact, persists across sessions)
- [ ] System prompt per tenant (personality, tone, services offered)
- [ ] Flow rule engine: IF lead_score > 80 THEN offer_booking
- [ ] Flow rule engine: IF sentiment = negative THEN escalate_human
- [ ] Flow rule engine: IF off_hours THEN send_away_message
- [ ] Message rate limiting (don't spam, respect WhatsApp limits)
- [ ] Media handling (images, documents, voice messages)
- [ ] Voice message transcription (common in Brazil — people send audios constantly)
- [ ] Quick reply buttons / list messages (WhatsApp interactive messages)
- [ ] Typing indicator simulation (feels human)
- [ ] Response delay (1-3 seconds, not instant — feels human)
- [ ] Conversation handoff to human agent
- [ ] Conversation tagging and categorization
- [ ] Profanity/abuse detection and handling

**AI Prompt Structure:**
```
SYSTEM: You are {business_name}'s assistant. You speak Brazilian Portuguese naturally.
Your personality: {personality_config}
Services offered: {services_list}
Qualification criteria: {criteria}
Current lead info: {lead_context}
Conversation history: {history}

RULES (override AI):
- Never promise discounts without approval
- Never share competitor information
- Always be respectful with informal Brazilian Portuguese
- Use "você" not "tu" (unless configured otherwise)
- If unsure, offer to connect with a human
```

### 2.6 Cold Outreach Module
**Confidence: 0.85**

**What it does:** Send initial cold messages to prospect lists, manage campaigns, track response rates.

> **WARNING — CRITICAL BOTTLENECK (see Section 3)**
> Cold outreach on WhatsApp carries HIGH BAN RISK. This module needs extreme care.

**Requirements:**
- [ ] Contact list import (CSV, Excel)
- [ ] Phone number validation (Brazilian format: +55 XX XXXXX-XXXX)
- [ ] Campaign creation (message template, target list, schedule)
- [ ] Drip messaging (Day 1: intro, Day 3: follow-up, Day 7: last chance)
- [ ] Sending rate limiter (max 20-30 new contacts/day per number to avoid bans)
- [ ] Warm-up period for new numbers (start slow, increase gradually)
- [ ] Opt-out handling ("pare", "sair", "não quero") — MANDATORY by Brazilian law (LGPD)
- [ ] Response tracking (opened, replied, qualified, booked)
- [ ] A/B testing of message templates
- [ ] Campaign analytics dashboard
- [ ] Blacklist management

---

## Section 3: Bottlenecks & Risks
**Confidence: 0.93**

### 3.1 WhatsApp Ban Risk — SEVERITY: CRITICAL 🔴
**Confidence: 0.95**

**The Problem:** WhatsApp aggressively bans numbers that send unsolicited messages. Cold outreach at scale = high ban probability.

**Mitigation Strategy:**
1. **Number warming:** New numbers send only 5-10 messages/day for first week, gradually increase
2. **Rate limiting:** Hard cap of 20-30 new conversations/day per number
3. **Number rotation pool:** Maintain 3-5 numbers per client, rotate sending
4. **Content variation:** Never send identical messages — AI generates slight variations
5. **Personalization:** Include recipient name, business name, contextual hooks
6. **Timing:** Send during business hours only (9am-6pm local time)
7. **Engagement signals:** Stop messaging numbers that don't respond after 2 attempts
8. **Recovery plan:** If number banned, have backup number ready, migrate sessions
9. **Evolution API sessions:** Monitor session health, auto-reconnect on drops

**Risk Assessment:**
| Scenario | Probability | Impact | Mitigation |
|----------|------------|--------|------------|
| Number banned (single) | HIGH (60%) | Medium | Number pool rotation |
| Number banned (all) | MEDIUM (25%) | Critical | Fresh number provisioning pipeline |
| Evolution API session drop | HIGH (40%) | Low | Auto-reconnect + monitoring |
| WhatsApp protocol change | LOW (10%) | Critical | Evolution API community handles updates |

### 3.2 LGPD Compliance (Brazilian Data Protection) — SEVERITY: HIGH 🟠
**Confidence: 0.91**

**The Problem:** Brazil's Lei Geral de Proteção de Dados (LGPD) is strict about unsolicited messages and data handling.

**Requirements for Compliance:**
- [ ] Consent tracking for every contact
- [ ] Easy opt-out mechanism (respond "SAIR" to stop)
- [ ] Data deletion capability (right to be forgotten)
- [ ] Data processing records
- [ ] Privacy policy per tenant
- [ ] Data stored in Brazil or with adequate protection
- [ ] No sharing contact data between tenants
- [ ] Encryption at rest for PII
- [ ] Audit logs for data access

**Risk:** Fines up to 2% of revenue or R$50 million per violation.

### 3.3 Evolution API Stability — SEVERITY: MEDIUM 🟡
**Confidence: 0.87**

**The Problem:** Evolution API uses WhatsApp Web protocol (reverse-engineered). It can break when WhatsApp updates.

**Mitigation:**
- [ ] Pin Evolution API version, don't auto-update
- [ ] Monitor Evolution API GitHub for breaking changes
- [ ] Health check endpoint: ping each instance every 60 seconds
- [ ] Auto-reconnect logic with exponential backoff
- [ ] Session backup/restore capability
- [ ] Fallback: have Meta Cloud API integration ready as Plan B
- [ ] QR code re-auth flow (some instances need periodic re-authentication)

### 3.4 AI Cost Management — SEVERITY: MEDIUM 🟡
**Confidence: 0.89**

**The Problem:** AI API calls per message add up fast. At 50 clients × 100 conversations/day × 10 messages/conversation = 50,000 AI calls/day.

**Mitigation:**
- [ ] Use Claude Haiku / GPT-4o-mini for simple routing decisions
- [ ] Reserve Claude Opus / GPT-4o for complex qualification
- [ ] Cache common responses (greetings, business hours, FAQ)
- [ ] Rule-based handling for predictable flows (no AI needed)
- [ ] Token budgets per tenant per month
- [ ] Conversation summarization (compress history, don't send full chat to AI each time)

**Cost Estimate (Month 1, 50 clients):**
| Item | Estimate |
|------|----------|
| Claude Haiku (routing) | ~$150/month |
| Claude Sonnet (qualification) | ~$500/month |
| Evolution API hosting | ~$50/month (VPS) |
| PostgreSQL | ~$30/month |
| Redis | ~$15/month |
| Total infrastructure | ~$750/month |

### 3.5 Multi-Timezone Handling — SEVERITY: LOW 🟢
**Confidence: 0.92**

Brazil spans 4 timezones:
- `America/Sao_Paulo` (BRT, UTC-3) — most clients
- `America/Manaus` (AMT, UTC-4)
- `America/Rio_Branco` (ACT, UTC-5)
- `America/Noronha` (FNT, UTC-2)

**Plus** daylight saving time was abolished in 2019 but timezone offsets still vary.

**Mitigation:**
- [ ] Store all times in UTC internally
- [ ] Per-tenant timezone config
- [ ] Display times in tenant's local timezone
- [ ] Booking slots respect business timezone
- [ ] Outreach campaigns respect recipient timezone

### 3.6 Voice Message Handling — SEVERITY: MEDIUM 🟡
**Confidence: 0.84**

**The Problem:** Brazilians HEAVILY use voice messages on WhatsApp. If the chatbot can't handle audio, it misses 30-40% of messages.

**Mitigation:**
- [ ] Integrate Whisper API (OpenAI) for voice-to-text
- [ ] Transcribe audio → feed text to AI engine
- [ ] Reply acknowledging "Recebi seu áudio!" before processing
- [ ] Set max audio duration (2 minutes) — longer = suggest text
- [ ] Cost: ~$0.006/minute of audio

### 3.7 Scaling Beyond 50 Clients — SEVERITY: LOW (for now) 🟢
**Confidence: 0.86**

**Architecture decisions now that enable future scale:**
- [ ] Database per-tenant schema isolation (Prisma + PostgreSQL schemas)
- [ ] Queue-based message processing (BullMQ) — not synchronous
- [ ] Stateless API servers (horizontal scaling)
- [ ] Evolution API instance pooling
- [ ] Configuration-driven tenant provisioning (not code changes)

---

## Section 4: Database Schema Design
**Confidence: 0.91**

```sql
-- Core tenant table
CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_name VARCHAR(255) NOT NULL,
    whatsapp_number VARCHAR(20) NOT NULL,
    evolution_instance_id VARCHAR(100),
    timezone VARCHAR(50) DEFAULT 'America/Sao_Paulo',
    business_hours JSONB NOT NULL,
    ai_config JSONB NOT NULL,
    booking_config JSONB,
    notification_config JSONB,
    status VARCHAR(20) DEFAULT 'onboarding',
    plan VARCHAR(20) DEFAULT 'starter',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Contacts / Leads
CREATE TABLE contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id),
    phone VARCHAR(20) NOT NULL,
    name VARCHAR(255),
    email VARCHAR(255),
    lead_score INTEGER DEFAULT 0,
    lead_status VARCHAR(20) DEFAULT 'new', -- new, qualifying, qualified, booked, lost
    qualification_data JSONB,
    tags TEXT[],
    first_contact_at TIMESTAMPTZ DEFAULT NOW(),
    last_contact_at TIMESTAMPTZ,
    opted_out BOOLEAN DEFAULT FALSE,
    opted_out_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, phone)
);

-- Conversations
CREATE TABLE conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id),
    contact_id UUID REFERENCES contacts(id),
    status VARCHAR(20) DEFAULT 'active', -- active, paused, closed, escalated
    context JSONB, -- AI conversation context/summary
    started_at TIMESTAMPTZ DEFAULT NOW(),
    last_message_at TIMESTAMPTZ,
    closed_at TIMESTAMPTZ
);

-- Messages
CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID REFERENCES conversations(id),
    tenant_id UUID REFERENCES tenants(id),
    direction VARCHAR(10) NOT NULL, -- inbound, outbound
    message_type VARCHAR(20) NOT NULL, -- text, image, audio, document, interactive
    content TEXT,
    media_url VARCHAR(500),
    whatsapp_message_id VARCHAR(100),
    ai_model_used VARCHAR(50),
    ai_tokens_used INTEGER,
    status VARCHAR(20) DEFAULT 'sent', -- sent, delivered, read, failed
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Bookings
CREATE TABLE bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id),
    contact_id UUID REFERENCES contacts(id),
    appointment_type VARCHAR(50),
    scheduled_at TIMESTAMPTZ NOT NULL,
    duration_minutes INTEGER DEFAULT 30,
    status VARCHAR(20) DEFAULT 'confirmed', -- confirmed, cancelled, completed, no_show
    calendar_event_id VARCHAR(255),
    reminder_sent BOOLEAN DEFAULT FALSE,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Campaigns (Cold Outreach)
CREATE TABLE campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id),
    name VARCHAR(255) NOT NULL,
    status VARCHAR(20) DEFAULT 'draft', -- draft, active, paused, completed
    message_template TEXT NOT NULL,
    target_count INTEGER DEFAULT 0,
    sent_count INTEGER DEFAULT 0,
    reply_count INTEGER DEFAULT 0,
    qualified_count INTEGER DEFAULT 0,
    booked_count INTEGER DEFAULT 0,
    send_rate_per_day INTEGER DEFAULT 20,
    scheduled_start TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Campaign contacts
CREATE TABLE campaign_contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID REFERENCES campaigns(id),
    contact_id UUID REFERENCES contacts(id),
    status VARCHAR(20) DEFAULT 'pending', -- pending, sent, replied, opted_out, failed
    sent_at TIMESTAMPTZ,
    replied_at TIMESTAMPTZ
);

-- Notifications log
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id),
    type VARCHAR(50) NOT NULL, -- new_lead, booking, escalation, daily_summary
    channel VARCHAR(20) NOT NULL, -- whatsapp, email, webhook
    recipient VARCHAR(255) NOT NULL,
    content TEXT,
    status VARCHAR(20) DEFAULT 'pending', -- pending, sent, failed
    sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_contacts_tenant_phone ON contacts(tenant_id, phone);
CREATE INDEX idx_messages_conversation ON messages(conversation_id, created_at);
CREATE INDEX idx_bookings_tenant_date ON bookings(tenant_id, scheduled_at);
CREATE INDEX idx_campaigns_tenant ON campaigns(tenant_id, status);
```

---

## Section 5: Project Structure
**Confidence: 0.93**

```
lk-chatbot/
├── src/
│   ├── config/
│   │   ├── database.ts          # Prisma client setup
│   │   ├── redis.ts             # Redis connection
│   │   ├── evolution.ts         # Evolution API config
│   │   └── ai.ts               # AI provider config
│   ├── modules/
│   │   ├── tenant/
│   │   │   ├── tenant.routes.ts
│   │   │   ├── tenant.service.ts
│   │   │   ├── tenant.schema.ts
│   │   │   └── tenant.controller.ts
│   │   ├── conversation/
│   │   │   ├── conversation.engine.ts    # Core AI + Rules engine
│   │   │   ├── conversation.service.ts
│   │   │   ├── conversation.routes.ts
│   │   │   └── flow-rules.ts            # Rule engine
│   │   ├── qualification/
│   │   │   ├── qualifier.service.ts      # Lead scoring logic
│   │   │   ├── qualifier.rules.ts        # Scoring criteria
│   │   │   └── qualifier.types.ts
│   │   ├── booking/
│   │   │   ├── booking.service.ts
│   │   │   ├── booking.routes.ts
│   │   │   ├── calendar.integration.ts   # Google Calendar / Cal.com
│   │   │   ├── slots.service.ts          # Available slot calculation
│   │   │   └── reminder.job.ts           # Cron job for reminders
│   │   ├── campaign/
│   │   │   ├── campaign.service.ts
│   │   │   ├── campaign.routes.ts
│   │   │   ├── campaign.scheduler.ts     # Drip campaign logic
│   │   │   └── warmup.strategy.ts        # Number warming logic
│   │   ├── notification/
│   │   │   ├── notification.service.ts
│   │   │   ├── notification.routes.ts
│   │   │   ├── channels/
│   │   │   │   ├── whatsapp.notifier.ts
│   │   │   │   ├── email.notifier.ts
│   │   │   │   └── webhook.notifier.ts
│   │   │   └── templates/               # PT-BR notification templates
│   │   └── whatsapp/
│   │       ├── evolution.client.ts       # Evolution API wrapper
│   │       ├── webhook.handler.ts        # Incoming message handler
│   │       ├── message.sender.ts         # Outbound message handler
│   │       ├── media.handler.ts          # Images, docs, audio
│   │       └── audio.transcriber.ts      # Whisper integration
│   ├── ai/
│   │   ├── providers/
│   │   │   ├── claude.provider.ts
│   │   │   └── openai.provider.ts
│   │   ├── prompts/
│   │   │   ├── qualification.prompt.ts
│   │   │   ├── booking.prompt.ts
│   │   │   └── general.prompt.ts
│   │   └── ai.router.ts                 # Routes to cheap/expensive model
│   ├── jobs/
│   │   ├── queue.setup.ts               # BullMQ queue definitions
│   │   ├── message.processor.ts         # Process incoming messages
│   │   ├── campaign.processor.ts        # Process campaign sends
│   │   ├── reminder.processor.ts        # Process booking reminders
│   │   └── daily-summary.processor.ts   # Daily digest emails
│   ├── middleware/
│   │   ├── auth.ts                      # API authentication
│   │   ├── tenant-context.ts            # Multi-tenant middleware
│   │   └── rate-limiter.ts
│   ├── utils/
│   │   ├── phone.utils.ts              # Brazilian phone validation
│   │   ├── timezone.utils.ts           # Brazil timezone helpers
│   │   ├── lgpd.utils.ts              # Data anonymization helpers
│   │   └── logger.ts
│   ├── app.ts                          # Fastify app setup
│   └── server.ts                       # Entry point
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── dashboard/                          # React admin (phase 2)
├── docker-compose.yml
├── Dockerfile
├── .env.example
├── package.json
├── tsconfig.json
└── README.md
```

---

## Section 6: Implementation Phases & Timeline
**Confidence: 0.90**

### Phase 1: Foundation (Week 1)
**Goal:** Core infrastructure, Evolution API connected, basic message echo

- [ ] Project scaffolding (Fastify + TypeScript + Prisma)
- [ ] Docker setup (PostgreSQL + Redis + Evolution API)
- [ ] Database schema + migrations
- [ ] Evolution API integration (connect number, send/receive messages)
- [ ] Webhook handler for incoming messages
- [ ] Basic tenant CRUD
- [ ] Environment configuration
- [ ] Health check endpoints

**Deliverable:** Can connect a WhatsApp number and echo messages back

### Phase 2: AI Conversation Engine (Week 2)
**Goal:** AI-powered conversations with lead qualification

- [ ] Claude/OpenAI provider integration
- [ ] Conversation engine (context management, history)
- [ ] AI prompt templates (Portuguese)
- [ ] Lead qualification scoring system
- [ ] Flow rules engine (IF/THEN logic)
- [ ] Contact management (create, update, dedup)
- [ ] Voice message transcription (Whisper)
- [ ] Typing simulation + response delay
- [ ] Conversation context summarization (token optimization)

**Deliverable:** Chatbot qualifies leads through natural Portuguese conversation

### Phase 3: Booking + Notifications (Week 3)
**Goal:** Automatic scheduling + real-time business notifications

- [ ] Google Calendar API integration
- [ ] Available slot calculation (timezone-aware)
- [ ] Natural language date parsing (Portuguese)
- [ ] Booking creation flow
- [ ] Booking confirmation messages
- [ ] Reminder system (24h + 1h before)
- [ ] Business owner WhatsApp notifications
- [ ] Email notifications (new lead, booking)
- [ ] Webhook notifications (CRM integration)
- [ ] Escalation to human flow

**Deliverable:** Full qualify → book → notify pipeline working

### Phase 4: Campaign + Scale (Week 4)
**Goal:** Cold outreach campaigns + multi-client onboarding

- [ ] Campaign management (create, schedule, pause)
- [ ] Contact list import (CSV)
- [ ] Number warming strategy implementation
- [ ] Rate-limited sending queue
- [ ] Drip campaign sequences
- [ ] A/B testing framework
- [ ] Opt-out handling (LGPD)
- [ ] Campaign analytics
- [ ] Client onboarding flow (self-serve or guided)
- [ ] Multi-tenant stress testing (10+ simultaneous clients)
- [ ] Monitoring + alerting setup

**Deliverable:** Can onboard new clients and run outreach campaigns

### Phase 5: Dashboard + Polish (Week 4-5, parallel)
**Goal:** Admin interface for managing everything

- [ ] React dashboard scaffolding
- [ ] Client management UI
- [ ] Conversation viewer
- [ ] Lead pipeline view
- [ ] Booking calendar view
- [ ] Campaign management UI
- [ ] Analytics charts (leads, bookings, conversion rates)
- [ ] Settings management per client

---

## Section 7: Message Templates (Brazilian Portuguese)
**Confidence: 0.92**

### Cold Outreach Templates

**Template 1 — Direct Value:**
```
Olá {nome}! 👋

Vi que a {empresa} trabalha com {setor} e queria compartilhar algo que pode te ajudar.

Estamos ajudando empresas como a sua a automatizar o atendimento pelo WhatsApp — com um assistente que qualifica clientes, agenda reuniões e funciona 24h.

Posso te mostrar como funciona em 5 minutos?
```

**Template 2 — Social Proof:**
```
Oi {nome}, tudo bem?

Acabamos de ajudar uma empresa de {setor} a triplicar os agendamentos usando um chatbot inteligente no WhatsApp.

Queria te mostrar como isso poderia funcionar pra {empresa}. Tem 5 minutinhos?
```

**Template 3 — Problem-Aware:**
```
{nome}, uma pergunta rápida:

Quantos clientes em potencial mandam mensagem fora do horário comercial e nunca mais voltam?

Criamos uma solução que responde seus leads 24h, qualifica automaticamente e agenda direto na sua agenda.

Quer saber mais?
```

### Qualification Flow Messages

**Greeting:**
```
Olá! 😊 Obrigado por entrar em contato com a {empresa}.

Sou o assistente virtual e vou te ajudar. Pra começar, como posso te chamar?
```

**Discovery:**
```
Prazer, {nome}! Me conta, o que você está buscando hoje?
```

**Budget Qualification (subtle):**
```
Entendi! Pra te indicar a melhor solução, você já tem uma ideia de investimento em mente?
```

**Booking Offer:**
```
{nome}, pelo que você me contou, acho que a gente pode te ajudar bastante! 🚀

Que tal agendar uma conversa rápida com nosso especialista? Temos os seguintes horários disponíveis:

📅 {slot_1}
📅 {slot_2}
📅 {slot_3}

Qual funciona melhor pra você?
```

---

## Section 8: API Endpoints
**Confidence: 0.91**

### Webhook (Evolution API → Our System)
```
POST /webhook/evolution          # Incoming messages from WhatsApp
```

### Tenant Management
```
POST   /api/tenants              # Create tenant
GET    /api/tenants              # List tenants
GET    /api/tenants/:id          # Get tenant details
PATCH  /api/tenants/:id          # Update tenant
DELETE /api/tenants/:id          # Deactivate tenant
POST   /api/tenants/:id/connect  # Connect WhatsApp (trigger QR)
GET    /api/tenants/:id/status   # WhatsApp connection status
```

### Contacts / Leads
```
GET    /api/tenants/:id/contacts           # List contacts
GET    /api/tenants/:id/contacts/:cid      # Contact details
PATCH  /api/tenants/:id/contacts/:cid      # Update contact
GET    /api/tenants/:id/contacts/:cid/messages  # Contact message history
```

### Bookings
```
GET    /api/tenants/:id/bookings           # List bookings
POST   /api/tenants/:id/bookings           # Manual booking
PATCH  /api/tenants/:id/bookings/:bid      # Update booking
GET    /api/tenants/:id/slots              # Available slots
```

### Campaigns
```
POST   /api/tenants/:id/campaigns          # Create campaign
GET    /api/tenants/:id/campaigns          # List campaigns
PATCH  /api/tenants/:id/campaigns/:cid     # Update campaign
POST   /api/tenants/:id/campaigns/:cid/start   # Start campaign
POST   /api/tenants/:id/campaigns/:cid/pause   # Pause campaign
POST   /api/tenants/:id/campaigns/:cid/contacts # Import contacts
GET    /api/tenants/:id/campaigns/:cid/stats    # Campaign stats
```

### Analytics
```
GET    /api/tenants/:id/analytics/leads     # Lead funnel stats
GET    /api/tenants/:id/analytics/bookings  # Booking stats
GET    /api/tenants/:id/analytics/campaigns # Campaign performance
GET    /api/tenants/:id/analytics/conversations # Conversation stats
```

---

## Section 9: Confidence Synthesis & Reflection
**Overall Weighted Confidence: 0.90**

| Section | Confidence | Weight | Weighted |
|---------|-----------|--------|----------|
| Architecture | 0.92 | 15% | 0.138 |
| Core Features | 0.94 | 20% | 0.188 |
| Booking System | 0.88 | 15% | 0.132 |
| Notifications | 0.93 | 10% | 0.093 |
| Conversation Engine | 0.90 | 15% | 0.135 |
| Cold Outreach | 0.85 | 10% | 0.085 |
| Bottlenecks | 0.93 | 15% | 0.140 |
| **Total** | | **100%** | **0.911** |

### Areas Below 0.9 — Reflection & Risk Notes

**Booking System (0.88):**
- Portuguese natural language date parsing is non-trivial ("semana que vem", "depois de amanhã", "terça à tarde")
- Need robust date parsing library or AI-assisted parsing
- Calendar API rate limits could be a problem at scale
- **Action:** Use AI to parse dates instead of regex. Confirm with user before creating event.

**Cold Outreach (0.85):**
- WhatsApp ban risk is the single biggest threat to the entire business model
- No amount of engineering fully eliminates this risk
- **Action:** Build ban detection + automatic failover. Keep number pool. Consider Meta Business API as parallel path for clients who get verified.

**Voice Messages (0.84):**
- Whisper API adds latency (2-5 seconds per audio)
- Cost can spike with heavy voice message users
- Audio quality on WhatsApp can be poor
- **Action:** Set audio duration limits. Batch transcription in queue. Cache transcription results.

---

## Section 10: Environment Variables
**Confidence: 0.95**

```env
# Server
NODE_ENV=production
PORT=3000
API_KEY=your-api-key-here

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/lk_chatbot

# Redis
REDIS_URL=redis://localhost:6379

# Evolution API
EVOLUTION_API_URL=http://localhost:8080
EVOLUTION_API_KEY=your-evolution-key

# AI Providers
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
AI_PRIMARY_PROVIDER=claude
AI_PRIMARY_MODEL=claude-haiku-4-5-20251001
AI_QUALIFICATION_MODEL=claude-sonnet-4-5-20250929

# Google Calendar
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=...

# Whisper (Voice Transcription)
WHISPER_MODEL=whisper-1

# Email (Notifications)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=...
SMTP_PASS=...

# Monitoring
GRAFANA_URL=...
```

---

## Summary: What We're Building

A **multi-tenant WhatsApp automation platform** for Brazilian businesses that:

1. **Reaches out** to potential clients via cold WhatsApp campaigns (with ban mitigation)
2. **Qualifies** incoming leads through natural AI conversation in Brazilian Portuguese
3. **Books** appointments automatically into the business's calendar
4. **Notifies** business owners in real-time when leads qualify or book
5. **Scales** from 10 to 50+ clients with isolated tenant configurations
6. **Complies** with Brazilian LGPD data protection requirements

**Total estimated development time:** 4-5 weeks for MVP
**Total estimated infrastructure cost:** ~$750/month at 50 clients
