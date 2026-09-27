import type { NextFunction, Request, Response } from "express";
import { UserRole, UserStatus } from "../generated/prisma/client.js";
import { prisma } from "../services/database.js";
import { ApiError } from "../utils/api-error.js";
import { verifyAccessToken } from "../utils/auth-crypto.js";

export async function authenticate(request: Request, _response: Response, next: NextFunction): Promise<void> {
  try {
    const authorization = request.header("authorization");
    if (!authorization?.startsWith("Bearer ")) throw new ApiError(401, "AUTH_REQUIRED", "Authentication is required.");
    const token = authorization.slice(7).trim();
    const claims = verifyAccessToken(token);
    const user = await prisma.user.findUnique({
      where: { id: claims.sub },
      select: { id: true, schoolId: true, role: true, status: true, tokenVersion: true }
    });
    if (!user || user.status !== UserStatus.ACTIVE || user.schoolId !== claims.schoolId || user.role !== claims.role || user.tokenVersion !== claims.tokenVersion) {
      throw new ApiError(401, "SESSION_INVALID", "The session is no longer valid.");
    }
    request.auth = { userId: user.id, schoolId: user.schoolId, role: user.role, tokenVersion: user.tokenVersion };
    next();
  } catch (error) {
    next(error);
  }
}

export function requireRoles(...roles: UserRole[]) {
  return (request: Request, _response: Response, next: NextFunction): void => {
    if (!request.auth) { next(new ApiError(401, "AUTH_REQUIRED", "Authentication is required.")); return; }
    if (!roles.includes(request.auth.role)) { next(new ApiError(403, "ROLE_FORBIDDEN", "This action is not allowed for your role.")); return; }
    next();
  };
}

export const roles = UserRole;
