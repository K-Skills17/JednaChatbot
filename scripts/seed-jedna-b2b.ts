/**
 * Seed script — creates/updates the Jedna LLC internal B2B tenant.
 *
 * This tenant handles inbound inquiries from dental practice owners/managers
 * about Jedna's services (Practice X-Ray™, Revive™, Intelligent Practice System™).
 * It qualifies them for a free Practice X-Ray booking.
 *
 * Usage:
 *   npx tsx scripts/seed-jedna-b2b.ts                    # uses JEDNA_SMS_NUMBER from .env
 *   npx tsx scripts/seed-jedna-b2b.ts +15555550101       # pass SMS number as argument
 */
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const dbUrl = process.env.DATABASE_URL ?? '';
const sep = dbUrl.includes('?') ? '&' : '?';
const url = `${dbUrl}${sep}schema=jedna_chatbot`;
const pool = new Pool({ connectionString: url });
const adapter = new PrismaPg(pool, { schema: 'jedna_chatbot' });
const prisma = new PrismaClient({ adapter });

const BUSINESS_NAME = 'Jedna LLC';
const SMS_NUMBER = process.argv[2] || process.env.JEDNA_SMS_NUMBER || '+15555550101';

async function main() {
  console.log(`Tenant       : ${BUSINESS_NAME}`);
  console.log(`SMS number   : ${SMS_NUMBER}`);
  console.log('');
  console.log('Checking for existing tenant...');

  const existing = await prisma.tenant.findFirst({
    where: {
      OR: [
        { businessName: BUSINESS_NAME },
        { smsNumber: SMS_NUMBER },
      ],
    },
  });

  if (existing) {
    const numberChanged = existing.smsNumber !== SMS_NUMBER;
    console.log(`Tenant found: ${existing.businessName} (${existing.id})`);
    if (numberChanged) {
      console.log(`Updating SMS number: ${existing.smsNumber} → ${SMS_NUMBER}`);
    }

    const updateData: Record<string, any> = { aiConfig: buildAiConfig() };
    if (numberChanged) updateData.smsNumber = SMS_NUMBER;

    const updated = await prisma.tenant.update({
      where: { id: existing.id },
      data: updateData,
    });

    console.log('');
    console.log('=== Jedna B2B Tenant Updated ===');
    console.log(`  SMS Number : ${updated.smsNumber}`);
    return updated;
  }

  console.log('Creating Jedna LLC B2B tenant...');

  const tenant = await prisma.tenant.create({
    data: {
      businessName: BUSINESS_NAME,
      smsNumber: SMS_NUMBER,
      timezone: 'America/New_York',
      complianceEnabled: true,
      // Available Mon–Sat to cover dental practices in all US time zones
      businessHours: { start: '08:00', end: '20:00', days: [1, 2, 3, 4, 5, 6] },
      aiConfig: buildAiConfig(),
      notificationConfig: {
        newLead: true,
        booking: true,
        escalation: true,
        telegramChatId: process.env.TELEGRAM_CHAT_ID || null,
        ownerEmail: process.env.OWNER_EMAIL || null,
      },
      plan: 'pro',
      status: 'active',
    },
  });

  console.log('');
  console.log('=== Jedna LLC B2B Tenant Created ===');
  console.log(`  ID         : ${tenant.id}`);
  console.log(`  Name       : ${tenant.businessName}`);
  console.log(`  SMS Number : ${tenant.smsNumber}`);
  console.log(`  Timezone   : ${tenant.timezone}`);
  console.log(`  Status     : ${tenant.status}`);
  console.log('');
  console.log('NEXT STEPS:');
  console.log('  1. Set JEDNA_BOOKING_URL in .env to your Google Calendar appointment URL');
  console.log('  2. Set TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID for lead notifications');
  console.log('  3. Point JEDNA_SMS_NUMBER Twilio webhook to /webhook/sms');
  console.log('  4. Test: text "hi, I have a dental practice and want to learn more"');

  return tenant;
}

function buildAiConfig() {
  const bookingUrl = process.env.JEDNA_BOOKING_URL || process.env.CALENDLY_URL || '{{BOOKING_URL}}';
  const jednaPhone = process.env.PRACTICE_PHONE || '{{JEDNA_PHONE}}';

  return {
    model: 'claude',
    temperature: 0.55,
    tone: 'professional' as const,

    // ── Business Context ──────────────────────────────────────
    businessDescription:
      `Jedna LLC is a dental practice growth consultancy based in Newark, Delaware. We help independent dental practices and DSOs grow production by diagnosing and fixing the six systems that drive patient flow: Visibility, Capture & Response, Show-Up, Monetization, Recurrence, and Reputation. Every engagement starts with a free Practice X-Ray™ — a 30-minute diagnostic that maps exactly where the practice is leaking revenue and what to fix first. Our flagship pilot program, Revive™, reactivates dormant patients on a performance-only basis: the practice pays only when a patient actually books. We work with 12 practices per month maximum.`,

    targetAudience:
      'Dental practice owners, dental office managers, and DSO regional directors who want to grow production, recover dormant patients, or improve their new-patient conversion — and are open to a free 30-minute diagnostic call.',

    // ── Services ─────────────────────────────────────────────
    services: [
      {
        name: 'Practice X-Ray™',
        description:
          'Free 30-minute diagnostic. A senior Jedna operator audits all six growth engines (Visibility, Capture & Response, Show-Up, Monetization, Recurrence, Reputation) and delivers a written treatment plan. No pitch — diagnosis first. Yours to keep whether you hire us or not.',
      },
      {
        name: 'Revive™ — Patient Reactivation',
        description:
          'Turns dormant, unscheduled, and lapsed recall patients into booked appointments. Compliant outreach (voice + SMS), consent-screened, practice-approved scripts. Performance-only pricing — fee triggers only when a patient books. Typically 30–45 day campaign.',
      },
      {
        name: 'Intelligent Practice System™',
        description:
          'Full six-engine installation fitted to how the practice already runs. Covers everything from new-patient SEO and 60-second response to treatment plan acceptance and review generation. Revive™ is one engine; the X-Ray shows which engines need work and in what order.',
      },
    ],

    // ── FAQ / Objection Handling ──────────────────────────────
    faq: [
      {
        question: 'How much does it cost?',
        answer:
          "The Practice X-Ray™ is completely free — no strings. Revive™ is performance-only: you pay a flat fee per booked appointment, nothing upfront. The full system is scoped after the X-Ray based on what your practice actually needs. The X-Ray call is the right first step.",
      },
      {
        question: 'How is this different from other marketing agencies?',
        answer:
          "Two things: we diagnose before we prescribe (no cookie-cutter packages), and Revive™ is pure performance — if patients don't book, we don't get paid. Most agencies charge monthly retainers whether it works or not. We don't.",
      },
      {
        question: "We've tried patient reactivation before and it didn't work.",
        answer:
          "That's the most common thing we hear. It usually comes down to three things: no consent screen (carrier filtered), generic scripts (patients didn't feel recognized), or slow response time (someone else got there first). Happy to show you exactly what we do differently on the X-Ray call.",
      },
      {
        question: 'Do you only do reactivation?',
        answer:
          "Revive™ (reactivation) is where most practices start because it's the fastest win with zero upfront cost. But the full system covers every engine — new patient flow, show-up rates, treatment acceptance, reviews. The X-Ray tells us which ones matter most for your practice.",
      },
      {
        question: "We're a DSO / multi-location. Do you work with groups?",
        answer:
          "Yes. We work with single practices and groups. For multi-location engagements we typically start with one pilot location so you can see results before scaling. The X-Ray call is the right way to scope a group engagement.",
      },
      {
        question: 'How long until we see results?',
        answer:
          "Revive™ campaigns typically run 30–45 days. Practices usually see the first bookings within the first 2 weeks of outreach going live. The X-Ray call takes 30 minutes and you leave with the full picture that same day.",
      },
    ],

    // ── Qualification Criteria ─────────────────────────────────
    qualificationCriteria: [
      { field: 'is_decision_maker', label: 'Is a practice owner, office manager, or DSO director', weight: 35 },
      { field: 'has_growth_problem', label: 'Has identified a specific gap (reactivation, new patients, conversion, etc.)', weight: 30 },
      { field: 'open_to_call',      label: 'Open to a free 30-min Practice X-Ray call', weight: 25 },
      { field: 'us_based',          label: 'Practice is based in the United States', weight: 10 },
    ],

    // ── Conversation Flow ──────────────────────────────────────
    greeting:
      `Hi! Thanks for reaching out to Jedna. I'm here to help connect you with the right next step. Are you a dental practice owner or manager looking to grow production?`,

    qualifiedMessage:
      `Sounds like a great fit for a Practice X-Ray™. It's a free 30-min call where we map exactly where your practice is leaking revenue — no pitch, yours to keep. You can book directly here: ${bookingUrl}`,

    closingMessage:
      `Thanks for connecting! We'll be in touch shortly. Feel free to reply here anytime with questions before the call.`,

    escalationRules:
      'Hand off to a human Jedna team member when: (1) the contact asks to speak with someone directly, (2) they want to discuss pricing in detail, (3) they are a DSO with 5+ locations (high-value, needs senior attention), (4) they express frustration or have had a bad experience with another vendor, (5) they want a custom scope or contract discussion.',

    // ── Compliance ────────────────────────────────────────────
    forbiddenTopics: [
      'specific ROI guarantees (say "results vary by practice" instead)',
      'naming specific competitor agencies',
      'committing to custom pricing without a call',
      'clinical dental topics',
      'anything about patient health records',
    ],

    smsOptInConfirmation:
      `You're confirmed to receive messages from Jedna LLC. Reply STOP to opt out anytime. Msg & data rates may apply.`,

    helpResponse:
      `Jedna LLC SMS. Reply STOP to cancel. Questions? Call ${jednaPhone}. Msg & data rates may apply.`,

    // ── Booking Config ─────────────────────────────────────────
    calendlyUrl: bookingUrl,
    practicePhone: jednaPhone,

    // ── Max Questions ─────────────────────────────────────────
    maxQualificationQuestions: 3,
  };
}

main()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
