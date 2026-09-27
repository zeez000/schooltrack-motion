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
  TRUST_PROXY: bool
});

const parsed = environmentSchema.safeParse(process.env);
if (!parsed.success) {
  const fields = parsed.error.issues.map((issue) => issue.path.join(".") || "environment").join(", ");
  throw new Error(`Invalid backend environment configuration: ${fields}`);
}
if (parsed.data.NODE_ENV === "production" && parsed.data.JWT_ACCESS_SECRET.includes("development-only")) {
  throw new Error("Invalid backend environment configuration: JWT_ACCESS_SECRET must be replaced in production");
}

export const env = {
  ...parsed.data,
  corsOrigins: parsed.data.CORS_ORIGINS.split(",").map((origin) => origin.trim()).filter(Boolean)
} as const;
