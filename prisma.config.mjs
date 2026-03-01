// ESM config for production — used by prisma db push at deploy time.
// Avoids needing tsx at runtime (the .ts config needs tsx).
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: process.env["DATABASE_URL"],
  },
});
