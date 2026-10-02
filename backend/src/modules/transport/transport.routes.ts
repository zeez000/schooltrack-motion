import { rateLimit } from "express-rate-limit";
import { Router } from "express";
import { z } from "zod";
import {
  CheckpointEventType,
  CheckpointSource,
  JourneyDirection,
  RouteDirection,
} from "../../generated/prisma/client.js";
import { env } from "../../config/env.js";
import { authenticate, requireRoles, roles } from "../../middleware/auth.js";
import {
  assertRouteAccess,
  assertStudentTransportAccess,
} from "../../services/authorization.js";
import { createCheckpoint } from "../../services/checkpoints.js";
import { prisma } from "../../services/database.js";
import { schoolDateOnly } from "../../services/school-time.js";
import {
  endRouteJourneys,
  startRouteJourneys,
} from "../../services/transport.js";
import { ApiError } from "../../utils/api-error.js";
const directionSchema = z.object({
  direction: z.enum(JourneyDirection),
  timestamp: z.iso.datetime().optional(),
});
const checkpointSchema = z.object({
  timestamp: z.iso.datetime().optional(),
  sourceEventId: z.string().max(160).optional(),
  direction: z.enum(JourneyDirection).optional(),
});
const handoverSchema = checkpointSchema.extend({ guardianId: z.uuid() });
async function currentJourney(
  schoolId: string,
  studentId: string,
  direction: JourneyDirection,
) {
  const date = await schoolDateOnly(schoolId);
  return prisma.journey.findUnique({
    where: { studentId_date_direction: { studentId, date, direction } },
  });
}
function safeEventTime(value: string | undefined) {
  const date = value ? new Date(value) : new Date();
  const delta = date.getTime() - Date.now();
  if (
    delta > env.EVENT_MAX_FUTURE_SKEW_SECONDS * 1000 ||
    delta < -env.CHECKPOINT_MAX_AGE_SECONDS * 1000
  )
    throw new ApiError(
      400,
      "EVENT_TIME_INVALID",
      "Event timestamp is outside the accepted recording window.",
    );
  return date;
}
export function createTransportRouter(): Router {
  const router = Router();
  const transportRateLimit = rateLimit({
    windowMs: 60000,
    limit: 180,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: (_request, _response, next) =>
      next(
        new ApiError(
          429,
          "RATE_LIMITED",
          "Too many transport requests. Please try again later.",
        ),
      ),
  });
  router.get(
    "/transport/routes/me",
    transportRateLimit,
    authenticate,
    requireRoles(roles.TRANSPORT, roles.ADMIN),
    async (request, response, next) => {
      try {
        const date = await schoolDateOnly(request.auth!.schoolId);
        const routeInclude = {
          vehicle: true,
          stops: { orderBy: { sequence: "asc" as const } },
          studentAssignments: {
            where: {
              active: true,
              student: {
                schoolId: request.auth!.schoolId,
                status: "ACTIVE" as const,
              },
            },
            include: {
              stop: { select: { id: true, name: true, sequence: true } },
              student: {
                select: {
                  id: true,
                  studentCode: true,
                  firstName: true,
                  lastName: true,
                  journeys: {
                    where: {
                      schoolId: request.auth!.schoolId,
                      date,
                      route: {
                        schoolId: request.auth!.schoolId,
                        ...(request.auth!.role === roles.TRANSPORT
                          ? {
                              transportAssignments: {
                                some: {
                                  userId: request.auth!.userId,
                                  active: true,
                                },
                              },
                            }
                          : {}),
                      },
                    },
                    select: {
                      routeId: true,
                      direction: true,
                      status: true,
                      events: {
                        select: { eventType: true, timestamp: true },
                        orderBy: { timestamp: "asc" as const },
                      },
                    },
                  },
                  guardians: {
                    where: {
                      active: true,
                      authorisedPickup: true,
                      user: {
                        status: "ACTIVE" as const,
                        schoolId: request.auth!.schoolId,
                      },
                    },
                    select: {
                      id: true,
                      relationship: true,
                      user: { select: { email: true, phone: true } },
                    },
                  },
                },
              },
            },
            orderBy: { student: { firstName: "asc" as const } },
          },
        };
        if (request.auth!.role === roles.ADMIN) {
          const routes = await prisma.route.findMany({
            where: { schoolId: request.auth!.schoolId, status: "ACTIVE" },
            include: routeInclude,
            orderBy: { name: "asc" },
          });
          response.json({ routes });
          return;
        }
        const assignments = await prisma.transportAssignment.findMany({
          where: {
            userId: request.auth!.userId,
            active: true,
            route: { schoolId: request.auth!.schoolId, status: "ACTIVE" },
          },
          include: { route: { include: routeInclude }, vehicle: true },
        });
        response.json({
          routes: assignments.map((a) => ({
            ...a.route,
            assignedVehicle: a.vehicle,
          })),
        });
      } catch (error) {
        next(error);
      }
    },
  );
  router.post(
    "/routes/:routeId/start",
    transportRateLimit,
    authenticate,
    requireRoles(roles.TRANSPORT, roles.ADMIN),
    async (request, response, next) => {
      try {
        const routeId = z.uuid().parse(request.params.routeId);
        await assertRouteAccess(request.auth!, routeId);
        const input = directionSchema.parse(request.body);
        const startedAt = safeEventTime(input.timestamp);
        const journeys = await startRouteJourneys(
          request.auth!.schoolId,
          routeId,
          input.direction,
          startedAt,
        );
        response
          .status(201)
          .json({
            routeId,
            direction: input.direction,
            startedAt,
            journeysCreatedOrStarted: journeys.length,
          });
      } catch (error) {
        next(error);
      }
    },
  );
  router.post(
    "/routes/:routeId/end",
    transportRateLimit,
    authenticate,
    requireRoles(roles.TRANSPORT, roles.ADMIN),
    async (request, response, next) => {
      try {
        const routeId = z.uuid().parse(request.params.routeId);
        await assertRouteAccess(request.auth!, routeId);
        const input = directionSchema.parse(request.body);
        const completedAt = safeEventTime(input.timestamp);
        const result = await endRouteJourneys(
          request.auth!.schoolId,
          routeId,
          input.direction,
          completedAt,
        );
        response.json({
          routeId,
          direction: input.direction,
          completedAt,
          journeysCompleted: result.count,
        });
      } catch (error) {
        next(error);
      }
    },
  );
  router.post(
    "/students/:studentId/boarding",
    transportRateLimit,
    authenticate,
    requireRoles(roles.TRANSPORT, roles.ADMIN),
    async (request, response, next) => {
      try {
        const studentId = z.uuid().parse(request.params.studentId);
        const input = checkpointSchema.parse(request.body);
        const direction = input.direction ?? JourneyDirection.MORNING;
        await assertStudentTransportAccess(
          request.auth!,
          studentId,
          direction === JourneyDirection.MORNING
            ? RouteDirection.MORNING
            : RouteDirection.RETURN,
        );
        const assignment = await prisma.studentRouteAssignment.findFirst({
          where: {
            studentId,
            active: true,
            student: { schoolId: request.auth!.schoolId },
            direction: {
              in: [
                RouteDirection.BOTH,
                direction === JourneyDirection.MORNING
                  ? RouteDirection.MORNING
                  : RouteDirection.RETURN,
              ],
            },
            route: {
              schoolId: request.auth!.schoolId,
              ...(request.auth!.role === roles.TRANSPORT
                ? {
                    transportAssignments: {
                      some: { userId: request.auth!.userId, active: true },
                    },
                  }
                : {}),
            },
          },
          include: { route: true },
        });
        if (!assignment)
          throw new ApiError(
            400,
            "NO_ACTIVE_ROUTE_ASSIGNMENT",
            "The student has no active route assignment for this direction.",
          );
        const journey = await currentJourney(
          request.auth!.schoolId,
          studentId,
          direction,
        );
        const event = await createCheckpoint({
          schoolId: request.auth!.schoolId,
          studentId,
          ...(journey ? { journeyId: journey.id } : {}),
          eventType:
            direction === JourneyDirection.MORNING
              ? CheckpointEventType.BUS_BOARDING
              : CheckpointEventType.RETURN_BUS_BOARDING,
          timestamp: safeEventTime(input.timestamp),
          source: CheckpointSource.DRIVER,
          ...(input.sourceEventId
            ? { sourceEventId: input.sourceEventId }
            : {}),
          actor: { userId: request.auth!.userId },
          requestId: String(request.id ?? ""),
          ipAddress: request.ip,
          metadata: { routeId: assignment.routeId },
        });
        response.status(201).json({ event });
      } catch (error) {
        next(error);
      }
    },
  );
  router.post(
    "/students/:studentId/handover",
    transportRateLimit,
    authenticate,
    requireRoles(roles.TRANSPORT, roles.ADMIN),
    async (request, response, next) => {
      try {
        const studentId = z.uuid().parse(request.params.studentId);
        await assertStudentTransportAccess(
          request.auth!,
          studentId,
          RouteDirection.RETURN,
        );
        const input = handoverSchema.parse(request.body);
        const guardian = await prisma.guardian.findFirst({
          where: {
            id: input.guardianId,
            studentId,
            active: true,
            authorisedPickup: true,
            user: { schoolId: request.auth!.schoolId, status: "ACTIVE" },
          },
          select: { id: true, relationship: true },
        });
        if (!guardian)
          throw new ApiError(
            403,
            "GUARDIAN_HANDOVER_NOT_AUTHORIZED",
            "The selected guardian is not authorized to receive this student.",
          );
        const journey = await currentJourney(
          request.auth!.schoolId,
          studentId,
          JourneyDirection.RETURN,
        );
        const event = await createCheckpoint({
          schoolId: request.auth!.schoolId,
          studentId,
          ...(journey ? { journeyId: journey.id } : {}),
          eventType: CheckpointEventType.GUARDIAN_HANDOVER,
          timestamp: safeEventTime(input.timestamp),
          source: CheckpointSource.DRIVER,
          ...(input.sourceEventId
            ? { sourceEventId: input.sourceEventId }
            : {}),
          actor: { userId: request.auth!.userId },
          requestId: String(request.id ?? ""),
          ipAddress: request.ip,
          metadata: {
            guardianId: guardian.id,
            relationship: guardian.relationship,
          },
        });
        response.status(201).json({ event });
      } catch (error) {
        next(error);
      }
    },
  );
  return router;
}
