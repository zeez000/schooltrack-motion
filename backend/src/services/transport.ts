import { JourneyDirection, JourneyStatus, RouteDirection } from "../generated/prisma/client.js";
import { prisma } from "./database.js";
import { utcDateOnly } from "./projections.js";

const directionMatches = (assignment: RouteDirection, direction: JourneyDirection) => assignment === RouteDirection.BOTH || assignment === direction;

export async function startRouteJourneys(schoolId: string, routeId: string, direction: JourneyDirection, startedAt = new Date()) {
  const assignments = await prisma.studentRouteAssignment.findMany({ where: { routeId, active: true }, select: { studentId: true, direction: true } });
  const date = utcDateOnly(startedAt);
  const eligible = assignments.filter(a => directionMatches(a.direction, direction));
  return prisma.$transaction(eligible.map(a => prisma.journey.upsert({
    where: { studentId_date_direction: { studentId: a.studentId, date, direction } },
    update: { routeId, schoolId, status: JourneyStatus.IN_PROGRESS, startedAt, completedAt: null },
    create: { schoolId, studentId: a.studentId, routeId, date, direction, status: JourneyStatus.IN_PROGRESS, startedAt }
  })));
}

export async function endRouteJourneys(schoolId: string, routeId: string, direction: JourneyDirection, completedAt = new Date()) {
  const date = utcDateOnly(completedAt);
  return prisma.journey.updateMany({
    where: { schoolId, routeId, date, direction, status: { in: [JourneyStatus.NOT_STARTED, JourneyStatus.IN_PROGRESS, JourneyStatus.EXCEPTION] } },
    data: { status: JourneyStatus.COMPLETED, completedAt }
  });
}
