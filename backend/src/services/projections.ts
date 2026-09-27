import { CheckpointEventType, RouteDirection } from "../generated/prisma/client.js";
import { env } from "../config/env.js";
import { prisma } from "./database.js";

export type ProjectionState = "RECORDED" | "AWAITING_RECORD" | "NOT_RECORDED" | "NOT_APPLICABLE" | "UPDATE_UNAVAILABLE";

const morningOrder = [CheckpointEventType.HOME_CONFIRMED, CheckpointEventType.BUS_BOARDING, CheckpointEventType.SCHOOL_GATE_ENTRY, CheckpointEventType.CLASSROOM_ENTRY] as const;
const returnOrder = [CheckpointEventType.RETURN_BUS_BOARDING, CheckpointEventType.STOP_ARRIVAL, CheckpointEventType.GUARDIAN_HANDOVER] as const;

export function utcDateOnly(input = new Date()): Date { return new Date(Date.UTC(input.getUTCFullYear(), input.getUTCMonth(), input.getUTCDate())); }
export function nextUtcDay(input: Date): Date { return new Date(input.getTime() + 86_400_000); }

function projectSequence(types: readonly CheckpointEventType[], recorded: Map<CheckpointEventType, { id: string; timestamp: Date; source: string }>, applicable: (type: CheckpointEventType) => boolean) {
  const highest = types.reduce((index, type, i) => recorded.has(type) ? Math.max(index, i) : index, -1);
  return Object.fromEntries(types.map((type, index) => {
    const event = recorded.get(type);
    const status: ProjectionState = event ? "RECORDED" : !applicable(type) ? "NOT_APPLICABLE" : highest > index ? "NOT_RECORDED" : "AWAITING_RECORD";
    return [type, event ? { status, eventId: event.id, timestamp: event.timestamp, source: event.source } : { status }];
  }));
}

export async function buildTodayProjection(schoolId: string, studentId: string, now = new Date()) {
  const date = utcDateOnly(now);
  const end = nextUtcDay(date);
  const student = await prisma.student.findFirst({
    where: { id: studentId, schoolId },
    select: { id: true, firstName: true, lastName: true, studentCode: true, classroom: { select: { id: true, name: true, section: true } } }
  });
  if (!student) return null;

  const [events, assignments, journeys] = await Promise.all([
    prisma.checkpointEvent.findMany({ where: { schoolId, studentId, timestamp: { gte: date, lt: end } }, orderBy: { timestamp: "asc" } }),
    prisma.studentRouteAssignment.findMany({ where: { studentId, active: true }, include: { route: { include: { vehicle: true } }, stop: true } }),
    prisma.journey.findMany({ where: { schoolId, studentId, date }, orderBy: { createdAt: "asc" } })
  ]);
  const recorded = new Map<CheckpointEventType, { id: string; timestamp: Date; source: string }>();
  for (const event of events) if (!recorded.has(event.eventType)) recorded.set(event.eventType, { id: event.id, timestamp: event.timestamp, source: event.source });
  const morningAssignment = assignments.find(a => a.direction === RouteDirection.MORNING || a.direction === RouteDirection.BOTH);
  const returnAssignment = assignments.find(a => a.direction === RouteDirection.RETURN || a.direction === RouteDirection.BOTH);
  const applicable = (type: CheckpointEventType) => {
    if (type === CheckpointEventType.BUS_BOARDING) return Boolean(morningAssignment);
    if ([CheckpointEventType.RETURN_BUS_BOARDING, CheckpointEventType.STOP_ARRIVAL].includes(type)) return Boolean(returnAssignment);
    return true;
  };
  const morning = projectSequence(morningOrder, recorded, applicable);
  const returning = projectSequence(returnOrder, recorded, applicable);

  const assignment = morningAssignment ?? returnAssignment;
  let vehicle: null | Record<string, unknown> = null;
  if (assignment?.route.vehicleId) {
    const location = await prisma.vehicleLocation.findFirst({ where: { vehicleId: assignment.route.vehicleId, schoolId }, orderBy: { timestamp: "desc" } });
    const ageSeconds = location ? Math.max(0, Math.floor((now.getTime() - location.timestamp.getTime()) / 1000)) : null;
    vehicle = {
      id: assignment.route.vehicle?.id,
      label: assignment.route.vehicle?.label,
      routeId: assignment.route.id,
      routeName: assignment.route.name,
      location: location ? { latitude: location.latitude, longitude: location.longitude, speed: location.speed, heading: location.heading, timestamp: location.timestamp } : null,
      lastUpdatedSecondsAgo: ageSeconds,
      status: !location || ageSeconds === null || ageSeconds > env.VEHICLE_LOCATION_STALE_SECONDS ? "UPDATE_UNAVAILABLE" : "CURRENT"
    };
  }
  const latestEvent = events.at(-1) ?? null;
  return { student, date, latestEvent, journeys, checkpoints: { morning, return: returning }, vehicle };
}
