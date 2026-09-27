import pino from "pino";
import { env } from "./env.js";

export const logger = pino({
  level: env.LOG_LEVEL,
  redact: {
    paths: [
      "req.headers.authorization", "req.headers.cookie", "req.headers.x-device-token",
      "res.headers.set-cookie", "password", "passwordHash", "accessToken", "refreshToken", "tokenHash"
    ],
    censor: "[REDACTED]"
  },
  base: { service: "schooltrack-backend" }
});
