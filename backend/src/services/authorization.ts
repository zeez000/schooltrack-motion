import { JourneyStatus, RouteDirection, type UserRole } from "../generated/prisma/client.js";
import { prisma } from "./database.js";
import { ApiError } from "../utils/api-error.js";
import { schoolDateOnly } from "./school-time.js";

export interface AuthContext {
  userId: string;
  schoolId: string;
  role: UserRole;
  tokenVersion: number;
}

const notFound = (entity: string): never => {
  throw new ApiError(404, `${entity.toUpperCase()}_NOT_FOUND`, `${entity} was not found.`);
};

export async function assertStudentAccess(auth: AuthContext, studentId: string): Promise<void> {
  const student = await prisma.student.findFirst({
    where: { id: studentId, schoolId: auth.schoolId },
    select: { id: true, classId: true }
  });
  if (!student) return notFound("student");
  if (auth.role === "ADMIN") return;

  if (auth.role === "PARENT") {
    const guardian = await prisma.guardian.findFirst({
      where: { userId: auth.userId, studentId, active: true },
      select: { id: true }
    });
    if (guardian) return;
  }

  if (auth.role === "TEACHER" && student.classId) {
    const assignment = await prisma.teacherClass.findFirst({
      where: { userId: auth.userId, classId: student.classId, active: true },
      select: { id: true }
    });
    if (assignment) return;
  }

  if (auth.role === "TRANSPORT") {
    const studentAssignments = await prisma.studentRouteAssignment.findMany({
      where: { studentId, active: true },
      select: { routeId: true }
    });
    const routeIds = studentAssignments.map((assignment) => assignment.routeId);
    if (routeIds.length) {
      const transportAssignment = await prisma.transportAssignment.findFirst({
        where: { userId: auth.userId, active: true, routeId: { in: routeIds } },
        select: { routeId: true }
      });
      if (transportAssignment) {
        const route = await prisma.route.findFirst({
          where: { id: transportAssignment.routeId, schoolId: auth.schoolId },
          select: { id: true }
        });
        if (route) return;
      }
    }
  }

  throw new ApiError(403, "STUDENT_NOT_AUTHORIZED", "You do not have access to this student.");
}

export async function assertClassAccess(auth: AuthContext, classId: string): Promise<void> {
  const classroom = await prisma.classroom.findFirst({
    where: { id: classId, schoolId: auth.schoolId },
    select: { id: true }
  });
  if (!classroom) notFound("class");
  if (auth.role === "ADMIN") return;

  if (auth.role === "TEACHER") {
    const assignment = await prisma.teacherClass.findFirst({
      where: { userId: auth.userId, classId, active: true },
      select: { id: true }
    });
    if (assignment) return;
  }

  throw new ApiError(403, "CLASS_NOT_AUTHORIZED", "You do not have access to this class.");
}

export async function assertRouteAccess(auth: AuthContext, routeId: string): Promise<void> {
  const route = await prisma.route.findFirst({
    where: { id: routeId, schoolId: auth.schoolId },
    select: { id: true }
  });
  if (!route) notFound("route");
  if (auth.role === "ADMIN") return;

  if (auth.role === "TRANSPORT") {
    const assignment = await prisma.transportAssignment.findFirst({
      where: { userId: auth.userId, routeId, active: true },
      select: { id: true }
    });
    if (assignment) return;
  }

  throw new ApiError(403, "ROUTE_NOT_AUTHORIZED", "You do not have access to this route.");
}

export async function assertVehicleAccess(auth: AuthContext, vehicleId: string): Promise<void> {
  const vehicle = await prisma.vehicle.findFirst({
    where: { id: vehicleId, schoolId: auth.schoolId },
    select: { id: true }
  });
  if (!vehicle) notFound("vehicle");
  if (auth.role === "ADMIN") return;

  if (auth.role === "TRANSPORT") {
    const assignments = await prisma.transportAssignment.findMany({
      where: { userId: auth.userId, active: true },
      select: { routeId: true, vehicleId: true }
    });

    if (assignments.some((assignment) => assignment.vehicleId === vehicleId)) return;

    const routeIds = assignments.map((assignment) => assignment.routeId);
    if (routeIds.length) {
      const route = await prisma.route.findFirst({
        where: { id: { in: routeIds }, schoolId: auth.schoolId, vehicleId },
        select: { id: true }
      });
      if (route) return;
    }
  }

  if (auth.role === "PARENT") {
    const date = await schoolDateOnly(auth.schoolId);
    const linkedStudents = await prisma.guardian.findMany({
      where: { userId: auth.userId, active: true, student: { schoolId: auth.schoolId, status: "ACTIVE" } },
      select: { studentId: true }
    });
    const studentIds = linkedStudents.map((link) => link.studentId);
    if (studentIds.length) {
      const activeJourney = await prisma.journey.findFirst({
        where: {
          schoolId: auth.schoolId,
          studentId: { in: studentIds },
          date,
          status: { in: [JourneyStatus.IN_PROGRESS, JourneyStatus.EXCEPTION] },
          route: { schoolId: auth.schoolId, vehicleId }
        },
        select: { id: true }
      });
      if (activeJourney) return;
    }
  }

  throw new ApiError(403, "VEHICLE_NOT_AUTHORIZED", "You do not have access to this vehicle.");
}

export async function assertStudentTransportAccess(
  auth: AuthContext,
  studentId: string,
  direction?: "MORNING" | "RETURN"
): Promise<void> {
  if (auth.role === "ADMIN") {
    await assertStudentAccess(auth, studentId);
    return;
  }
  if (auth.role !== "TRANSPORT") {
    throw new ApiError(403, "TRANSPORT_ROLE_REQUIRED", "Transport access is required.");
  }

  const student = await prisma.student.findFirst({
    where: { id: studentId, schoolId: auth.schoolId, status: "ACTIVE" },
    select: { id: true }
  });
  if (!student) notFound("student");

  const routeAssignments = await prisma.studentRouteAssignment.findMany({
    where: {
      studentId,
      active: true,
      ...(direction ? { direction: { in: [RouteDirection.BOTH, direction] } } : {})
    },
    select: { routeId: true }
  });
  const routeIds = routeAssignments.map((assignment) => assignment.routeId);
  if (!routeIds.length) {
    throw new ApiError(403, "STUDENT_ROUTE_NOT_AUTHORIZED", "This student is not assigned to your active route for this journey direction.");
  }

  const transportAssignment = await prisma.transportAssignment.findFirst({
    where: {
      userId: auth.userId,
      active: true,
      routeId: { in: routeIds },
      route: { schoolId: auth.schoolId, status: "ACTIVE" }
    },
    select: { routeId: true }
  });
  if (transportAssignment) return;

  throw new ApiError(403, "STUDENT_ROUTE_NOT_AUTHORIZED", "This student is not assigned to your active route for this journey direction.");
}
