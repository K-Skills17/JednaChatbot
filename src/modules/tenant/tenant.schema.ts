import { z } from 'zod';

export const createTenantSchema = z.object({
  businessName: z.string().min(1).max(255),
  whatsappNumber: z.string().min(10).max(20),
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
    })
    .default({ model: 'claude', temperature: 0.7, qualificationCriteria: [] }),
  plan: z.enum(['starter', 'pro', 'enterprise']).default('starter'),
});

export const updateTenantSchema = createTenantSchema.partial();

export type CreateTenantInput = z.infer<typeof createTenantSchema>;
export type UpdateTenantInput = z.infer<typeof updateTenantSchema>;
