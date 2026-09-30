import { createHash } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { ApiError } from "../utils/api-error.js";

type Bucket = { count: number; resetAt: number };
type KeyGenerator = (request: Request) => string;
const buckets = new Map<string, Bucket>();
const MAX_BUCKETS = 20_000;

const requestIp = (request: Request) => request.ip || request.socket.remoteAddress || "unknown";
const hashKey = (value: string) => createHash("sha256").update(value).digest("hex").slice(0, 24);

function prune(now: number): void {
  for (const [key, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(key);
  while (buckets.size >= MAX_BUCKETS) {
    const oldest = buckets.keys().next().value as string | undefined;
    if (!oldest) break;
    buckets.delete(oldest);
  }
}

export function createRateLimit({
  windowMs,
  max,
  prefix,
  keyGenerator = requestIp,
  exposeHeaders = true
}: {
  windowMs: number;
  max: number;
  prefix: string;
  keyGenerator?: KeyGenerator;
  exposeHeaders?: boolean;
}) {
  return (request: Request, response: Response, next: NextFunction): void => {
    const now = Date.now();
    const keyPart = keyGenerator(request);
    const key = `${prefix}:${keyPart}`;
    if (!buckets.has(key) && buckets.size >= MAX_BUCKETS) prune(now);

    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
    }

    bucket.count += 1;
    if (exposeHeaders) {
      response.setHeader("RateLimit-Limit", String(max));
      response.setHeader("RateLimit-Remaining", String(Math.max(0, max - bucket.count)));
      response.setHeader("RateLimit-Reset", String(Math.ceil(bucket.resetAt / 1000)));
    }

    if (bucket.count > max) {
      next(new ApiError(429, "RATE_LIMITED", "Too many requests. Please try again later."));
      return;
    }
    next();
  };
}

const accountKey: KeyGenerator = (request) => {
  const raw = typeof request.body === "object" && request.body !== null && "email" in request.body
    ? String((request.body as { email?: unknown }).email ?? "")
    : "";
  return hashKey(raw.trim().toLowerCase() || "invalid");
};
const deviceKey: KeyGenerator = (request) => hashKey(request.header("x-device-id")?.trim() || "missing");

export const authIpRateLimit = createRateLimit({ windowMs: 60_000, max: 20, prefix: "auth-ip", exposeHeaders: false });
export const loginAccountRateLimit = createRateLimit({ windowMs: 15 * 60_000, max: 10, prefix: "auth-account", keyGenerator: accountKey, exposeHeaders: false });
export const deviceIpRateLimit = createRateLimit({ windowMs: 60_000, max: 180, prefix: "device-ip", exposeHeaders: false });
export const deviceKeyRateLimit = createRateLimit({ windowMs: 60_000, max: 120, prefix: "device-key", keyGenerator: deviceKey, exposeHeaders: false });
export const apiRateLimit = createRateLimit({ windowMs: 60_000, max: 600, prefix: "api" });

export function resetRateLimitBucketsForTests(): void {
  buckets.clear();
}
