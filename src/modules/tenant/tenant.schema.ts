import { z } from 'zod';

export const createTenantSchema = z.object({
  businessName: z.string().min(1).max(255),
  whatsappNumber: z.string().min(10).max(20).optional(),
  timezone: z.string().default('America/Sao_Paulo'),
  businessHours: z
    .object({
      start: z.string().regex(/^\d{2}:\d{2}$/), // "09:00"
      end: z.string().regex(/^\d{2}:\d{2}$/),   // "18:00"
      days: z.array(z.number().min(0).max(6)),   // [1,2,3,4,5] = Mon-Fri
    })
    .default({ start: '09:00', end: '18:00', days: [1, 2, 3, 4, 5] }),
  aiConfig: z
    .object({
      systemPrompt: z.string().optional(),
      model: z.enum(['claude', 'openai']).default('claude'),
      temperature: z.number().min(0).max(1).default(0.7),
      qualificationCriteria: z.array(z.any()).default([]),
      // Business context fields — this is how you "train" the chatbot for each business
      businessDescription: z.string().optional(),     // What the business does
      services: z.array(z.object({                    // Products/services offered
        name: z.string(),
        description: z.string().optional(),
        price: z.string().optional(),                 // e.g. "R$ 150" or "a partir de R$ 200"
      })).optional(),
      faq: z.array(z.object({                         // Frequently asked questions
        question: z.string(),
        answer: z.string(),
      })).optional(),
      targetAudience: z.string().optional(),           // Who the business serves
      tone: z.enum(['formal', 'casual', 'friendly']).default('friendly'),
      greeting: z.string().optional(),                 // Custom first-message greeting
      closingMessage: z.string().optional(),           // Custom goodbye message
      escalationRules: z.string().optional(),          // When to escalate to human
      forbiddenTopics: z.array(z.string()).optional(), // Topics the bot must NOT discuss
    })
    .default({ model: 'claude', temperature: 0.7, qualificationCriteria: [], tone: 'friendly' as const }),
  widgetConfig: z
    .object({
      primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#2563eb'),
      headerTitle: z.string().max(60).optional(),           // defaults to businessName
      welcomeMessage: z.string().max(500).optional(),       // auto-greeting when chat opens
      position: z.enum(['bottom-right', 'bottom-left']).default('bottom-right'),
      avatarUrl: z.string().url().optional(),               // custom bot avatar
      bubbleIcon: z.enum(['chat', 'message', 'help']).default('chat'),
    })
    .optional(),
  notificationConfig: z
    .object({
      newLead: z.boolean().default(true),
      booking: z.boolean().default(true),
      escalation: z.boolean().default(true),
      ownerPhone: z.string().optional(),
      ownerEmail: z.string().optional(),
      webhookUrl: z.string().optional(),
    })
    .optional(),
  plan: z.enum(['starter', 'pro', 'enterprise']).default('starter'),
});

export const updateTenantSchema = createTenantSchema.partial();

export type CreateTenantInput = z.infer<typeof createTenantSchema>;
export type UpdateTenantInput = z.infer<typeof updateTenantSchema>;
