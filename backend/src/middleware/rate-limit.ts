import type { NextFunction, Request, Response } from "express";
import { ApiError } from "../utils/api-error.js";

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

export function createRateLimit({ windowMs, max, prefix }: { windowMs: number; max: number; prefix: string }) {
  return (request: Request, response: Response, next: NextFunction): void => {
    const now = Date.now();
    const key = `${prefix}:${request.ip || request.socket.remoteAddress || "unknown"}`;
    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
    }
    bucket.count += 1;
    response.setHeader("RateLimit-Limit", String(max));
    response.setHeader("RateLimit-Remaining", String(Math.max(0, max - bucket.count)));
    response.setHeader("RateLimit-Reset", String(Math.ceil(bucket.resetAt / 1000)));
    if (bucket.count > max) {
      next(new ApiError(429, "RATE_LIMITED", "Too many requests. Please try again later."));
      return;
    }
    if (buckets.size > 10_000) {
      for (const [bucketKey, value] of buckets) if (value.resetAt <= now) buckets.delete(bucketKey);
    }
    next();
  };
}

export const authRateLimit = createRateLimit({ windowMs: 60_000, max: 12, prefix: "auth" });
export const deviceRateLimit = createRateLimit({ windowMs: 60_000, max: 120, prefix: "device" });
