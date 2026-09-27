import type { Prisma } from "../generated/prisma/client.js";
import { prisma } from "./database.js";

export interface AuditInput {
  schoolId: string;
  actorUserId?: string;
  action: string;
  entityType: string;
  entityId: string;
  oldValue?: Prisma.InputJsonValue;
  newValue?: Prisma.InputJsonValue;
  ipAddress?: string;
  requestId?: string;
}

export async function recordAudit(input: AuditInput, db: Prisma.TransactionClient | typeof prisma = prisma) {
  return db.auditLog.create({
    data: {
      schoolId: input.schoolId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      ...(input.actorUserId ? { actorUserId: input.actorUserId } : {}),
      ...(input.oldValue !== undefined ? { oldValue: input.oldValue } : {}),
      ...(input.newValue !== undefined ? { newValue: input.newValue } : {}),
      ...(input.ipAddress ? { ipAddress: input.ipAddress.slice(0, 128) } : {}),
      ...(input.requestId ? { requestId: input.requestId.slice(0, 160) } : {})
    }
  });
}
