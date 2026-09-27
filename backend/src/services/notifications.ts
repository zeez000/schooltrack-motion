import { UserStatus, type NotificationType, type Prisma } from "../generated/prisma/client.js";
import { prisma } from "./database.js";

interface GuardianNotificationInput {
  schoolId: string;
  studentId: string;
  type: NotificationType;
  title: string;
  body: string;
  metadata?: Prisma.InputJsonValue;
}

export async function notifyGuardians(input: GuardianNotificationInput, db: Prisma.TransactionClient | typeof prisma = prisma) {
  const guardians = await db.guardian.findMany({
    where: {
      studentId: input.studentId,
      active: true,
      user: { schoolId: input.schoolId, status: UserStatus.ACTIVE }
    },
    select: { userId: true }
  });
  if (!guardians.length) return { count: 0 };
  return db.notification.createMany({
    data: guardians.map(({ userId }) => ({
      schoolId: input.schoolId,
      userId,
      studentId: input.studentId,
      type: input.type,
      title: input.title,
      body: input.body,
      ...(input.metadata !== undefined ? { metadata: input.metadata } : {})
    }))
  });
}
