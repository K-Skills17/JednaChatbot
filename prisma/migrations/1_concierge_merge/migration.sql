-- Concierge merge: compliance gate, handoffs, events, qualification rules,
-- debounce idempotency, appointment preferences.
-- All new columns are nullable or have defaults — safe for existing rows.

-- ─── Tenant: concierge-specific fields ──────────────────────
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "qualification_rules" JSONB;
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "handoff_number" TEXT;
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "assessment_desc" TEXT;
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "tone_notes" TEXT;
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "compliance_enabled" BOOLEAN NOT NULL DEFAULT false;

-- ─── Conversation: granular stage tracking ──────────────────
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "stage" TEXT NOT NULL DEFAULT 'saudacao';

-- ─── Booking: preference-based scheduling ───────────────────
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "preferred_day" TEXT;
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "preferred_period" TEXT;
ALTER TABLE "bookings" ALTER COLUMN "scheduled_at" DROP NOT NULL;

-- ─── Message: idempotent webhook dedup ──────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS "messages_whatsapp_message_id_key"
  ON "messages"("whatsapp_message_id");

-- ─── Compliance Audit (CFO/CRO gate log) ────────────────────
CREATE TABLE IF NOT EXISTS "compliance_audits" (
  "id" TEXT NOT NULL,
  "message_id" TEXT,
  "conversation_id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "outbound_text" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "checks" JSONB NOT NULL,
  "passed" BOOLEAN NOT NULL,
  "flagged_terms" TEXT[] NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "compliance_audits_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "compliance_audits_tenant_id_created_at_idx"
  ON "compliance_audits"("tenant_id", "created_at");
CREATE INDEX IF NOT EXISTS "compliance_audits_conversation_id_idx"
  ON "compliance_audits"("conversation_id");

ALTER TABLE "compliance_audits"
  ADD CONSTRAINT "compliance_audits_message_id_fkey"
  FOREIGN KEY ("message_id") REFERENCES "messages"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "compliance_audits"
  ADD CONSTRAINT "compliance_audits_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── Handoffs (escalation to human staff) ───────────────────
CREATE TABLE IF NOT EXISTS "handoffs" (
  "id" TEXT NOT NULL,
  "lead_id" TEXT NOT NULL,
  "conversation_id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "reason" TEXT,
  "summary" TEXT,
  "status" TEXT NOT NULL DEFAULT 'pendente',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "handoffs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "handoffs_tenant_id_created_at_idx"
  ON "handoffs"("tenant_id", "created_at");

ALTER TABLE "handoffs"
  ADD CONSTRAINT "handoffs_lead_id_fkey"
  FOREIGN KEY ("lead_id") REFERENCES "contacts"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "handoffs"
  ADD CONSTRAINT "handoffs_conversation_id_fkey"
  FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "handoffs"
  ADD CONSTRAINT "handoffs_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── Events (activity log / event sourcing) ─────────────────
CREATE TABLE IF NOT EXISTS "events" (
  "id" TEXT NOT NULL,
  "lead_id" TEXT,
  "tenant_id" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "payload" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "events_tenant_id_type_idx"
  ON "events"("tenant_id", "type");
CREATE INDEX IF NOT EXISTS "events_tenant_id_created_at_idx"
  ON "events"("tenant_id", "created_at");

ALTER TABLE "events"
  ADD CONSTRAINT "events_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
