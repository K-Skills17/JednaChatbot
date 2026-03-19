-- Add channel column to contacts table
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "channel" TEXT NOT NULL DEFAULT 'whatsapp';

-- Add channel column to conversations table
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "channel" TEXT NOT NULL DEFAULT 'whatsapp';
