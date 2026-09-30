import { createHmac, createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { env } from "../config/env.js";
import type { UserRole } from "../generated/prisma/client.js";
import { ApiError } from "./api-error.js";

const SCRYPT_N = 32_768;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_BYTES = 32;
const MAX_SCRYPT_N = 131_072;
const MAX_SCRYPT_R = 16;
const MAX_SCRYPT_P = 4;

function deriveKey(password: string, salt: Buffer, length: number, options: { N: number; r: number; p: number; maxmem: number }): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, length, options, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey);
    });
  });
}

export interface AccessTokenClaims {
  sub: string;
  schoolId: string;
  role: UserRole;
  tokenVersion: number;
  iat: number;
  exp: number;
  iss: string;
  aud: string;
  jti: string;
}

const encode = (value: unknown): string => Buffer.from(JSON.stringify(value)).toString("base64url");

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await deriveKey(password, salt, KEY_BYTES, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P, maxmem: 64 * 1024 * 1024 });
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [algorithm, nText, rText, pText, saltText, keyText] = encoded.split("$");
  if (algorithm !== "scrypt" || !nText || !rText || !pText || !saltText || !keyText) return false;
  const N = Number(nText), r = Number(rText), p = Number(pText);
  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p) || N < 16_384 || N > MAX_SCRYPT_N || r < 1 || r > MAX_SCRYPT_R || p < 1 || p > MAX_SCRYPT_P) return false;
  const expected = Buffer.from(keyText, "base64url");
  if (expected.length !== KEY_BYTES) return false;
  const actual = await deriveKey(password, Buffer.from(saltText, "base64url"), expected.length, { N, r, p, maxmem: 128 * 1024 * 1024 });
  return timingSafeEqual(actual, expected);
}

export function signAccessToken(input: Omit<AccessTokenClaims, "iat" | "exp" | "iss" | "aud" | "jti">): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: AccessTokenClaims = { ...input, iat: now, exp: now + env.ACCESS_TOKEN_TTL_SECONDS, iss: env.JWT_ISSUER, aud: env.JWT_AUDIENCE, jti: randomBytes(16).toString("base64url") };
  const header = encode({ alg: "HS256", typ: "JWT" });
  const body = encode(payload);
  const signature = createHmac("sha256", env.JWT_ACCESS_SECRET).update(`${header}.${body}`).digest("base64url");
  return `${header}.${body}.${signature}`;
}

export function verifyAccessToken(token: string): AccessTokenClaims {
  const parts = token.split(".");
  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) throw new ApiError(401, "INVALID_ACCESS_TOKEN", "The access token is invalid.");
  const [header, body, signature] = parts as [string, string, string];
  const expected = createHmac("sha256", env.JWT_ACCESS_SECRET).update(`${header}.${body}`).digest();
  let supplied: Buffer;
  try { supplied = Buffer.from(signature, "base64url"); } catch { throw new ApiError(401, "INVALID_ACCESS_TOKEN", "The access token is invalid."); }
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) throw new ApiError(401, "INVALID_ACCESS_TOKEN", "The access token is invalid.");
  try {
    const decodedHeader = JSON.parse(Buffer.from(header, "base64url").toString("utf8")) as { alg?: string; typ?: string };
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as AccessTokenClaims;
    const now = Math.floor(Date.now() / 1000);
    if (decodedHeader.alg !== "HS256" || decodedHeader.typ !== "JWT" || payload.iss !== env.JWT_ISSUER || payload.aud !== env.JWT_AUDIENCE ||
        !Number.isInteger(payload.exp) || !Number.isInteger(payload.iat) || !Number.isInteger(payload.tokenVersion) ||
        payload.exp <= now || payload.iat > now + 60 || !payload.sub || !payload.schoolId || !payload.role || !payload.jti) {
      throw new Error("claim validation failed");
    }
    return payload;
  } catch {
    throw new ApiError(401, "INVALID_ACCESS_TOKEN", "The access token is invalid or expired.");
  }
}

export function createOpaqueToken(bytes = 48): string {
  return randomBytes(bytes).toString("base64url");
}
export function sha256Token(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
