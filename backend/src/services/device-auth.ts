import { timingSafeEqual } from "node:crypto";
import type { Request } from "express";
import { DeviceStatus } from "../generated/prisma/client.js";
import { prisma } from "./database.js";
import { ApiError } from "../utils/api-error.js";
import { sha256Token } from "../utils/auth-crypto.js";

export async function authenticateDevice(request: Request) {
  const deviceKey = request.header("x-device-id");
  const token = request.header("x-device-token");
  if (!deviceKey || !token) throw new ApiError(401, "DEVICE_AUTH_REQUIRED", "Device authentication is required.");
  const device = await prisma.device.findUnique({ where: { deviceKey } });
  if (!device || device.status !== DeviceStatus.ACTIVE) throw new ApiError(401, "DEVICE_INVALID", "The device is invalid or inactive.");
  const expected = Buffer.from(device.tokenHash, "hex");
  const supplied = Buffer.from(sha256Token(token), "hex");
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
    throw new ApiError(401, "DEVICE_INVALID", "The device is invalid or inactive.");
  }
  return device;
}
