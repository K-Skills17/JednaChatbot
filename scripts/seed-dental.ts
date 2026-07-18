/**
 * Seed script — creates/updates a Jedna Marketing dental practice tenant.
 *
 * Usage:
 *   npx tsx scripts/seed-dental.ts                         # uses SMS_NUMBER from .env or default
 *   npx tsx scripts/seed-dental.ts +15555550100             # pass SMS number as argument
 *   SMS_NUMBER=+15555550100 npx tsx scripts/seed-dental.ts  # via env var
 *
 * If a tenant with businessName matching PRACTICE_NAME already exists,
 * it updates the aiConfig and smsNumber (if changed).
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

const SMS_NUMBER   = process.argv[2] || process.env.SMS_NUMBER || '+15555550100';
const PRACTICE_NAME = process.env.PRACTICE_NAME || 'Smile Bright Dental';

async function main() {
  console.log(`Practice name : ${PRACTICE_NAME}`);
  console.log(`SMS number    : ${SMS_NUMBER}`);
  console.log('');
  console.log('Checking for existing tenant...');

  const existing = await prisma.tenant.findFirst({
    where: {
      OR: [
        { businessName: PRACTICE_NAME },
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
    console.log('=== Tenant Updated Successfully ===');
    console.log(`  SMS Number : ${updated.smsNumber}`);
    return updated;
  }

  console.log('Creating tenant...');

  const tenant = await prisma.tenant.create({
    data: {
      businessName: PRACTICE_NAME,
      smsNumber: SMS_NUMBER,
      timezone: process.env.PRACTICE_TIMEZONE || 'America/New_York',
      complianceEnabled: true,
      businessHours: { start: '08:00', end: '17:00', days: [1, 2, 3, 4, 5] },
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
  console.log('=== Tenant Created Successfully ===');
  console.log(`  ID         : ${tenant.id}`);
  console.log(`  Name       : ${tenant.businessName}`);
  console.log(`  SMS Number : ${tenant.smsNumber}`);
  console.log(`  Timezone   : ${tenant.timezone}`);
  console.log(`  Status     : ${tenant.status}`);
  console.log('');
  console.log('NEXT STEPS:');
  console.log('  1. Set CALENDLY_URL in .env to your scheduling link');
  console.log('  2. Set TELEGRAM_BOT_WEBHOOK in .env for lead notifications');
  console.log('  3. Verify Twilio A2P 10DLC registration for SMS_NUMBER');
  console.log('  4. Test with a message to', SMS_NUMBER);

  return tenant;
}

function buildAiConfig() {
  const calendlyUrl = process.env.CALENDLY_URL || '{{CALENDLY_URL}}';
  const practicePhone = process.env.PRACTICE_PHONE || '{{PRACTICE_PHONE}}';

  return {
    model: 'claude',
    temperature: 0.6,
    tone: 'friendly' as const,

    // ── Business Context ──────────────────────────────────────
    businessDescription:
      `${PRACTICE_NAME} is a patient-focused dental practice dedicated to helping patients achieve comfortable, healthy, confident smiles. We offer comprehensive dental care in a welcoming environment where every patient is treated with respect and compassion. Our team believes great dental care should be accessible, stress-free, and built around each patient's unique needs.`,

    targetAudience:
      'Adults in the local area who are looking for a new dental home, need a specific dental procedure (cleaning, whitening, implants, Invisalign, etc.), or have been putting off dental care due to anxiety, cost concerns, or difficulty finding an available provider.',

    // ── Services ─────────────────────────────────────────────
    services: [
      {
        name: 'New Patient Exam & Cleaning',
        description: 'Comprehensive oral exam, digital X-rays, and professional cleaning. The perfect starting point for new patients.',
      },
      {
        name: 'Teeth Whitening',
        description: 'Professional in-office and take-home whitening treatments for a brighter smile.',
      },
      {
        name: 'Dental Implants',
        description: 'Permanent tooth replacement that looks and functions like a natural tooth.',
      },
      {
        name: 'Invisalign Clear Aligners',
        description: 'Straighten teeth discreetly with removable clear aligners — no metal braces required.',
      },
      {
        name: 'Porcelain Veneers',
        description: 'Thin porcelain shells that correct chips, stains, and gaps for a complete smile transformation.',
      },
      {
        name: 'Emergency Dental Care',
        description: 'Same-day or next-day appointments for toothaches, broken teeth, and other urgent dental needs.',
      },
      {
        name: 'Preventive Care',
        description: 'Regular cleanings, exams, fluoride treatments, and sealants to keep your smile healthy long-term.',
      },
    ],

    // ── FAQ / Objection Handling ──────────────────────────────
    faq: [
      {
        question: 'Do you accept my insurance?',
        answer: 'We work with most major dental insurance plans and will verify your benefits before your visit. Our team can also discuss flexible payment options for any out-of-pocket costs. The best way to confirm is to schedule a quick call with our front desk.',
      },
      {
        question: 'How much does it cost?',
        answer: "Treatment costs vary based on your specific needs and insurance coverage. We provide a clear treatment plan with costs before any work is done — no surprises. I'd love to get you scheduled so our team can give you an accurate estimate based on your situation.",
      },
      {
        question: "I'm nervous / I have dental anxiety",
        answer: "You're not alone — many of our patients feel the same way. Our team is specially trained to work with anxious patients. We go at your pace, explain every step, and offer comfort options. The first step is just a conversation, and there's no pressure.",
      },
      {
        question: 'How soon can I get an appointment?',
        answer: "We typically have availability within a few days for new patients, and same-day or next-day slots for urgent needs. Once I have a bit more info, I can connect you with our scheduling team to find a time that works for you.",
      },
      {
        question: 'Do you do payment plans?',
        answer: "Yes — we offer flexible financing options so cost doesn't have to be a barrier to the care you need. Our front desk can walk you through the options during your visit or before.",
      },
      {
        question: 'Are you accepting new patients?',
        answer: "Yes, we're welcoming new patients! We'd love to have you join our practice family.",
      },
    ],

    // ── Qualification Criteria ─────────────────────────────────
    qualificationCriteria: [
      { field: 'treatment_need', label: 'Has a specific dental need or goal', weight: 30 },
      { field: 'location_ok',    label: 'Located in or near the practice service area', weight: 20 },
      { field: 'near_term',      label: 'Looking to be seen within the next 1-4 weeks', weight: 25 },
      { field: 'has_time_slot',  label: 'Has provided a preferred day or time', weight: 15 },
      { field: 'prior_patient',  label: 'Was a previous patient (higher close rate)', weight: 10 },
    ],

    // ── Conversation Flow ──────────────────────────────────────
    greeting:
      `Hi! Thanks for reaching out to ${PRACTICE_NAME}. I'm here to help you get connected with our team. What brings you in — is there something specific you're looking to address with your smile?`,

    qualifiedMessage:
      `Great news — it sounds like we'd be a great fit! You can book your appointment directly here: ${calendlyUrl} — it only takes a minute. Or if you'd prefer, just reply with a couple of times that work for you and I'll have our scheduling team reach out.`,

    closingMessage:
      `It was great connecting with you! Our team will be in touch shortly. If you have any questions in the meantime, feel free to reach out anytime. We look forward to seeing you!`,

    escalationRules:
      'Hand off to a human team member when: (1) the contact explicitly asks to speak with someone, (2) the conversation involves a complex insurance or billing question, (3) the contact has a dental emergency, (4) the contact expresses frustration or dissatisfaction, (5) clinical questions that require a licensed dentist to answer.',

    // ── Compliance ────────────────────────────────────────────
    forbiddenTopics: [
      'specific price quotes',
      'clinical diagnoses',
      'treatment outcome guarantees',
      'competitor practice names',
      'medical advice beyond scheduling',
    ],

    smsOptInConfirmation:
      `You're confirmed to receive appointment reminders and updates from ${PRACTICE_NAME}. Reply STOP to opt out anytime. Msg & data rates may apply.`,

    helpResponse:
      `${PRACTICE_NAME} SMS alerts. Reply STOP to cancel. For help call ${practicePhone}. Msg & data rates may apply.`,

    // ── Booking Config ─────────────────────────────────────────
    calendlyUrl,
    practicePhone,

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
