import { config } from "dotenv";
import { defineConfig, env } from "prisma/config";

config({ path: ".env.local" });

export default defineConfig({
  schema: "prisma/schema.prisma",
  // Migrate needs the direct (non-pooled) connection, per Supabase's pooler setup (architecture.md §3).
  // The runtime PrismaClient uses the pooled DATABASE_URL via the adapter in lib/prisma.ts instead.
  datasource: {
    url: env("DIRECT_URL"),
  },
});
