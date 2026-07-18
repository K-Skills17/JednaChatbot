# NEEDS-OWNER — Jedna Marketing Dental Bot

This file lists every configuration step that **must be completed by the practice owner
or implementation engineer** before the bot goes live.  Nothing here is handled by code;
all items require external accounts, credentials, or legal sign-off.

---

## 1. Twilio — SMS Transport

| Item | Action |
|------|--------|
| Twilio account | Create at twilio.com and fund it |
| A2P 10DLC brand registration | Register your business in the Twilio console (required for US business SMS) |
| A2P 10DLC campaign registration | Register the "dental lead qualification" use-case campaign |
| Phone number purchase | Buy a local 10DLC number (or toll-free) and assign it to the campaign |
| Inbound webhook | Set the SMS inbound webhook URL to `https://YOUR_DOMAIN/webhook/sms` |
| Status callback | Optionally configure delivery status callbacks |

**Environment variables to set:**
```
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_FROM_NUMBER=+1XXXXXXXXXX
TWILIO_WEBHOOK_SECRET=  # optional — shared secret for request validation
```

> **TCPA note**: A2P 10DLC registration is legally required for application-to-person SMS in the US.
> Sending without registration risks carrier filtering and FCC violations.

---

## 2. Practice Information

Set these in your `.env` (or Railway/Vercel environment settings):

```
PRACTICE_NAME=Smile Bright Dental
PRACTICE_PHONE=+1XXXXXXXXXX
PRACTICE_TIMEZONE=America/New_York   # or America/Chicago, America/Denver, America/Los_Angeles
```

Then re-run the seed script to update the tenant record:
```bash
npx tsx scripts/seed-dental.ts
```

---

## 3. Calendly — Appointment Scheduling

1. Create or log into your Calendly account
2. Set up an event type for new patient consultations
3. Copy the booking link (e.g. `https://calendly.com/your-practice/new-patient`)
4. Add to `.env`:
   ```
   CALENDLY_URL=https://calendly.com/your-practice/new-patient
   ```

The bot sends this link to qualified leads automatically.

---

## 4. Telegram — Lead Notifications

The bot sends structured lead handoff notifications to a Telegram chat.

### Setup steps:
1. Message `@BotFather` on Telegram → `/newbot` → follow prompts → copy the bot token
2. Add the bot to a group or use a private chat
3. Send a message to the bot/group, then call:
   `https://api.telegram.org/botTOKEN/getUpdates`
   to find the `chat.id`
4. Set up the webhook receiver (your existing Telegram bot or n8n/Make.com flow)

**Environment variables:**
```
TELEGRAM_BOT_TOKEN=123456:ABCdefGHI...
TELEGRAM_CHAT_ID=-1001234567890        # negative number for groups
TELEGRAM_BOT_WEBHOOK=https://YOUR_DOMAIN/your-telegram-handler  # where lead payloads POST to
```

The `TELEGRAM_BOT_WEBHOOK` endpoint receives a JSON payload:
```json
{
  "event": "lead_handoff",
  "timestamp": "2025-01-01T00:00:00Z",
  "phone": "+15555550100",
  "message": "Telegram-formatted summary with lead data",
  "qualificationData": { "treatment_need": "...", "preferred_day": "..." }
}
```

---

## 5. AI Provider

Choose your primary AI provider and set credentials:

**Claude (recommended):**
```
ANTHROPIC_API_KEY=sk-ant-...
AI_PRIMARY_PROVIDER=claude
```

**OpenAI (fallback):**
```
OPENAI_API_KEY=sk-...
AI_PRIMARY_PROVIDER=openai
```

---

## 6. Database

PostgreSQL is required.  Recommended: Railway Postgres or Supabase.

```
DATABASE_URL=postgresql://user:password@host:5432/jedna_chatbot
```

After setting the URL, run migrations:
```bash
npx prisma migrate deploy
npx tsx scripts/seed-dental.ts
```

---

## 7. Redis

Required for BullMQ job queues (message debounce, notification delivery).
Recommended: Railway Redis or Upstash.

```
REDIS_URL=redis://default:password@host:6379
```

---

## 8. Security

```
JWT_SECRET=<random 64+ char string>
API_KEY=<random 32+ char string for dashboard access>
ADMIN_PASSWORD=<strong password for /api/admin/login>
```

Generate with: `openssl rand -hex 32`

---

## 9. Webchat Widget (Optional)

If you want the embeddable chat widget on your website:

1. Ensure `EVOLUTION_API_URL` is set (Evolution API instance for webchat backend)
2. Add the widget script to your website `<head>`:
   ```html
   <script src="https://YOUR_DOMAIN/api/webchat/YOUR_TENANT_ID/widget.js" async></script>
   ```
3. Customize colors, header title, and welcome message via the tenant API

---

## 10. HIPAA Compliance

> **This is not legal advice.** Consult your healthcare compliance officer or attorney.

- Sign a Business Associate Agreement (BAA) with Anthropic (if using Claude for PHI-adjacent workflows)
- Sign a BAA with Twilio (available in their compliance portal)
- Ensure your PostgreSQL host offers a BAA (Railway Pro, AWS RDS, etc.)
- Enable encryption at rest on your database
- Review and limit which staff have access to conversation logs
- The bot is designed to **never ask for PHI** (SSN, insurance ID, full DOB, etc.).
  PHI redaction is applied to message history before it reaches the AI, but the raw
  messages are stored in the database — ensure DB access is appropriately restricted.

---

## 11. Post-Launch Checklist

- [ ] Twilio A2P 10DLC approved
- [ ] Test STOP → receive CTIA opt-out confirmation → no further messages
- [ ] Test HELP → receive help message with practice phone number
- [ ] Test price question → bot deflects without quoting a price
- [ ] Test "talk to a person" → handoff notification arrives in Telegram
- [ ] Test qualified lead → Calendly link delivered in ≤ 300 chars
- [ ] Verify PHI patterns are redacted in AI context (check logs)
- [ ] Confirm new lead Telegram notifications are arriving
- [ ] Confirm booking notifications are arriving
- [ ] Set up database backups
- [ ] Run `npx vitest run` — all acceptance tests pass

---

*Last updated: 2025-07-18*
