import "dotenv/config";
import { z } from "zod";

const bool = z.string().optional().transform((value) => value === "true");
const environmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(4_000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  CORS_ORIGINS: z.string().default("http://localhost:4173"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  JSON_BODY_LIMIT: z.string().default("100kb"),
  JWT_ACCESS_SECRET: z.string().min(32).default("development-only-schooltrack-secret-change-me"),
  JWT_ISSUER: z.string().min(1).default("schooltrack-api"),
  JWT_AUDIENCE: z.string().min(1).default("schooltrack-clients"),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).max(86_400).default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(180).default(30),
  ENABLE_DEV_REGISTRATION: bool,
  VEHICLE_LOCATION_STALE_SECONDS: z.coerce.number().int().min(30).max(86_400).default(300),
  VEHICLE_LOCATION_RETENTION_DAYS: z.coerce.number().int().min(1).max(90).default(7),
  CHECKPOINT_MAX_AGE_SECONDS: z.coerce.number().int().min(60).max(172_800).default(86_400),
  EVENT_MAX_FUTURE_SKEW_SECONDS: z.coerce.number().int().min(0).max(3_600).default(300),
  SSE_MAX_CONNECTION_SECONDS: z.coerce.number().int().min(60).max(3_600).default(900),
  TRUST_PROXY: bool
});

const parsed = environmentSchema.safeParse(process.env);
if (!parsed.success) {
  const fields = parsed.error.issues.map((issue) => issue.path.join(".") || "environment").join(", ");
  throw new Error(`Invalid backend environment configuration: ${fields}`);
}

const corsOrigins = parsed.data.CORS_ORIGINS.split(",").map((origin) => origin.trim()).filter(Boolean);
if (parsed.data.NODE_ENV === "production") {
  if (parsed.data.JWT_ACCESS_SECRET.includes("development-only") || parsed.data.JWT_ACCESS_SECRET.length < 48) {
    throw new Error("Invalid backend environment configuration: JWT_ACCESS_SECRET must be a production secret of at least 48 characters");
  }
  if (!corsOrigins.length || corsOrigins.includes("*")) {
    throw new Error("Invalid backend environment configuration: production CORS_ORIGINS must explicitly list trusted HTTPS origins");
  }
  for (const origin of corsOrigins) {
    let url: URL;
    try { url = new URL(origin); }
    catch { throw new Error(`Invalid backend environment configuration: invalid CORS origin ${origin}`); }
    if (url.protocol !== "https:" || url.origin !== origin.replace(/\/$/, "")) {
      throw new Error("Invalid backend environment configuration: production CORS origins must be HTTPS origins without paths");
    }
  }
}

export const env = { ...parsed.data, corsOrigins } as const;
