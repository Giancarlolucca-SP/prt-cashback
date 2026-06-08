import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.string().default("development"),
  APP_ENV: z.enum(["development", "staging", "homologacao", "production"]).default("development"),
  API_PORT: z.coerce.number().int().positive().default(3333),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  DATABASE_URL: z.string().min(1),
  DIRECT_URL: z.string().optional(),
  SUPABASE_URL: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  WEBHOOK_SHARED_SECRET: z.string().optional(),
  BACKUP_DIR: z.string().default("backups")
});

export type AppEnv = z.infer<typeof envSchema>;

export function readEnv(source = process.env): AppEnv {
  return envSchema.parse(source);
}
