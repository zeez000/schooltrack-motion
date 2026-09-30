import { Router } from "express";
import { z } from "zod";
import { authenticate, requireRoles, roles } from "../../middleware/auth.js";
import { assertStudentAccess } from "../../services/authorization.js";
import { prisma } from "../../services/database.js";
import { buildTodayProjection, nextUtcDay } from "../../services/projections.js";
import { schoolDateOnly } from "../../services/school-time.js";
import { ApiError } from "../../utils/api-error.js";

const idSchema = z.uuid();
const dateQuery = z.object({ from: z.iso.date().optional(), to: z.iso.date().optional() });
const parseDate = (value: string) => new Date(`${value}T00:00:00.000Z`);

export function createStudentRouter(): Router {
  const router = Router();
  router.use(authenticate);

  router.get("/:studentId", requireRoles(roles.PARENT, roles.TEACHER, roles.ADMIN), async (request, response, next) => {
    try {
      const studentId = idSchema.parse(request.params.studentId);
      await assertStudentAccess(request.auth!, studentId);
      const student = await prisma.student.findFirst({
        where: { id: studentId, schoolId: request.auth!.schoolId },
        select: {
          id: true, studentCode: true, firstName: true, lastName: true, status: true,
          classroom: { select: { id: true, name: true, section: true, academicYear: true } }
        }
      });
      if (!student) throw new ApiError(404, "STUDENT_NOT_FOUND", "Student was not found.");
      response.json({ student });
    } catch (error) { next(error); }
  });

  router.get("/:studentId/today", requireRoles(roles.PARENT, roles.ADMIN), async (request, response, next) => {
    try {
      const studentId = idSchema.parse(request.params.studentId);
      await assertStudentAccess(request.auth!, studentId);
      const projection = await buildTodayProjection(request.auth!.schoolId, studentId);
      if (!projection) throw new ApiError(404, "STUDENT_NOT_FOUND", "Student was not found.");
      response.json(projection);
    } catch (error) { next(error); }
  });

  router.get("/:studentId/journeys", requireRoles(roles.PARENT, roles.ADMIN), async (request, response, next) => {
    try {
      const studentId = idSchema.parse(request.params.studentId);
      await assertStudentAccess(request.auth!, studentId);
      const journeys = await prisma.journey.findMany({
        where: { schoolId: request.auth!.schoolId, studentId },
        include: {
          route: { select: { id: true, name: true } },
          events: { select: { id: true, eventType: true, timestamp: true, source: true }, orderBy: { timestamp: "asc" } }
        },
        orderBy: [{ date: "desc" }, { direction: "asc" }], take: 60
      });
      response.json({ journeys });
    } catch (error) { next(error); }
  });

  router.get("/:studentId/attendance", requireRoles(roles.PARENT, roles.TEACHER, roles.ADMIN), async (request, response, next) => {
    try {
      const studentId = idSchema.parse(request.params.studentId);
      await assertStudentAccess(request.auth!, studentId);
      const query = dateQuery.parse(request.query);
      const endDefault = nextUtcDay(await schoolDateOnly(request.auth!.schoolId));
      const from = query.from ? parseDate(query.from) : new Date(endDefault.getTime() - 31 * 86_400_000);
      const to = query.to ? nextUtcDay(parseDate(query.to)) : endDefault;
      const records = await prisma.attendanceRecord.findMany({
        where: { schoolId: request.auth!.schoolId, studentId, date: { gte: from, lt: to } },
        include: {
          classroom: { select: { id: true, name: true, section: true } },
          corrections: { select: { fromStatus: true, toStatus: true, reason: true, createdAt: true }, orderBy: { createdAt: "asc" } }
        },
        orderBy: { date: "desc" }
      });
      response.json({ records });
    } catch (error) { next(error); }
  });

  router.get("/:studentId/notifications", requireRoles(roles.PARENT), async (request, response, next) => {
    try {
      const studentId = idSchema.parse(request.params.studentId);
      await assertStudentAccess(request.auth!, studentId);
      const notifications = await prisma.notification.findMany({
        where: { schoolId: request.auth!.schoolId, userId: request.auth!.userId, studentId },
        orderBy: { createdAt: "desc" }, take: 100
      });
      response.json({ notifications });
    } catch (error) { next(error); }
  });

  return router;
}
