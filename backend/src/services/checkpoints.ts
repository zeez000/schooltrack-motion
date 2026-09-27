import { CheckpointEventType, JourneyStatus, NotificationType, type CheckpointSource, type Prisma } from "../generated/prisma/client.js";
import { prisma } from "./database.js";
import { recordAudit } from "./audit.js";
import { notifyGuardians } from "./notifications.js";
import { ApiError } from "../utils/api-error.js";

export interface CheckpointActor {
  userId?: string;
  deviceId?: string;
}

export interface CreateCheckpointInput {
  schoolId: string;
  studentId: string;
  journeyId?: string;
  eventType: CheckpointEventType;
  timestamp: Date;
  source: CheckpointSource;
  sourceEventId?: string;
  metadata?: Prisma.InputJsonValue;
  actor: CheckpointActor;
  requestId?: string;
  ipAddress?: string;
}

const eventLabel: Record<CheckpointEventType, string> = {
  HOME_CONFIRMED: "Home status confirmed",
  BUS_BOARDING: "Bus boarding recorded",
  SCHOOL_GATE_ENTRY: "School entry recorded",
  CLASSROOM_ENTRY: "Classroom check-in recorded",
  ATTENDANCE_PRESENT: "Attendance marked present",
  ATTENDANCE_ABSENT: "Attendance marked absent",
  RETURN_BUS_BOARDING: "Return bus boarding recorded",
  STOP_ARRIVAL: "Assigned stop arrival recorded",
  GUARDIAN_HANDOVER: "Guardian handover recorded"
};

export async function createCheckpoint(input: CreateCheckpointInput) {
  return prisma.$transaction(async (tx) => {
    const student = await tx.student.findFirst({ where: { id: input.studentId, schoolId: input.schoolId }, select: { id: true, firstName: true } });
    if (!student) throw new ApiError(404, "STUDENT_NOT_FOUND", "Student was not found.");
    if (input.journeyId) {
      const journey = await tx.journey.findFirst({ where: { id: input.journeyId, schoolId: input.schoolId, studentId: input.studentId }, select: { id: true } });
      if (!journey) throw new ApiError(400, "INVALID_JOURNEY", "The journey does not belong to this student.");
    }
    if (input.sourceEventId) {
      const existing = await tx.checkpointEvent.findFirst({ where: { schoolId: input.schoolId, sourceEventId: input.sourceEventId } });
      if (existing) return existing;
    }

    const event = await tx.checkpointEvent.create({
      data: {
        schoolId: input.schoolId,
        studentId: input.studentId,
        eventType: input.eventType,
        timestamp: input.timestamp,
        source: input.source,
        ...(input.journeyId ? { journeyId: input.journeyId } : {}),
        ...(input.actor.userId ? { recordedByUserId: input.actor.userId } : {}),
        ...(input.actor.deviceId ? { deviceId: input.actor.deviceId } : {}),
        ...(input.sourceEventId ? { sourceEventId: input.sourceEventId } : {}),
        ...(input.metadata !== undefined ? { metadata: input.metadata } : {})
      }
    });

    if (input.journeyId) {
      await tx.journey.updateMany({
        where: { id: input.journeyId, schoolId: input.schoolId, studentId: input.studentId, status: JourneyStatus.NOT_STARTED },
        data: { status: JourneyStatus.IN_PROGRESS, startedAt: input.timestamp }
      });
    }

    const label = eventLabel[input.eventType];
    await notifyGuardians({
      schoolId: input.schoolId,
      studentId: input.studentId,
      type: input.eventType.startsWith("ATTENDANCE_") ? NotificationType.ATTENDANCE : NotificationType.JOURNEY_UPDATE,
      title: label,
      body: `${student.firstName}: ${label.toLowerCase()} at ${input.timestamp.toISOString()}.`,
      metadata: { checkpointEventId: event.id, eventType: input.eventType }
    }, tx);

    await recordAudit({
      schoolId: input.schoolId,
      action: "CHECKPOINT_CREATED",
      entityType: "CheckpointEvent",
      entityId: event.id,
      newValue: { studentId: input.studentId, eventType: input.eventType, source: input.source, timestamp: input.timestamp.toISOString() },
      ...(input.actor.userId ? { actorUserId: input.actor.userId } : {}),
      ...(input.ipAddress ? { ipAddress: input.ipAddress } : {}),
      ...(input.requestId ? { requestId: input.requestId } : {})
    }, tx);

    return event;
  });
}
