// ESM config for production — used by prisma db push at deploy time.
// Avoids needing tsx at runtime (the .ts config needs tsx).
import { defineConfig } from "prisma/config";

// Append ?schema=lk_chatbot (or &schema= if query params exist) so our
// tables live in a separate PostgreSQL schema from Evolution API's "public".
const baseUrl = process.env["DATABASE_URL"] ?? "";
const separator = baseUrl.includes("?") ? "&" : "?";
const url = baseUrl ? `${baseUrl}${separator}schema=lk_chatbot` : baseUrl;

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: { url },
});
