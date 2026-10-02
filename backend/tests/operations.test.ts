import { beforeEach, expect, it } from "vitest";
import request from "supertest";
import {
  app,
  bearer,
  createFixture,
  login,
  resetDatabase,
} from "./helpers/database.js";
import { bootstrapAdmin } from "../src/ops/bootstrap-admin.js";
import { prisma } from "../src/services/database.js";
import { dayBoundsInTimeZone } from "../src/services/school-time.js";
beforeEach(resetDatabase);
it("provisions the first real admin without demo data and refuses repeat provisioning", async () => {
  const input = {
    schoolName: "Pilot School",
    address: "Pilot campus",
    timezone: "Asia/Kolkata",
    email: "owner@pilot.test",
    password: "UniqueInitialAdmin!2026",
  };
  const result = await bootstrapAdmin(input);
  expect(await prisma.student.count()).toBe(0);
  expect(
    (await prisma.user.findUniqueOrThrow({ where: { id: result.userId } }))
      .role,
  ).toBe("ADMIN");
  expect(
    (
      await request(app)
        .post("/api/auth/login")
        .send({ email: input.email, password: input.password })
    ).status,
  ).toBe(200);
  await expect(bootstrapAdmin(input)).rejects.toThrow("empty database");
  expect(await prisma.school.count()).toBe(1);
});
it("lists scoped relationships without hashes and creates tenant-scoped route stops", async () => {
  const f = await createFixture(),
    admin = await login(f.adminA.email);
  for (const resource of [
    "guardians",
    "teacher-class-assignments",
    "student-route-assignments",
    "transport-assignments",
  ]) {
    const response = await request(app)
      .get(`/api/admin/${resource}`)
      .set(bearer(admin));
    expect(response.status).toBe(200);
    expect(JSON.stringify(response.body)).not.toContain(f.parentB.email);
    expect(JSON.stringify(response.body)).not.toContain("passwordHash");
  }
  const otherRoute = await prisma.route.create({
    data: { schoolId: f.schoolB.id, name: "Private" },
  });
  const body = { name: "New stop", sequence: 2, latitude: 14, longitude: 81 };
  expect(
    (
      await request(app)
        .post(`/api/admin/routes/${otherRoute.id}/stops`)
        .set(bearer(admin))
        .send(body)
    ).status,
  ).toBe(404);
  expect(
    (
      await request(app)
        .post(`/api/admin/routes/${f.routeA.id}/stops`)
        .set(bearer(admin))
        .send(body)
    ).status,
  ).toBe(201);
});
it("uses local timestamp boundaries rather than UTC date keys, including DST", () => {
  const india = dayBoundsInTimeZone(
    new Date("2026-10-01T20:00:00Z"),
    "Asia/Kolkata",
  );
  expect(india.date.toISOString()).toBe("2026-10-02T00:00:00.000Z");
  expect(india.start.toISOString()).toBe("2026-10-01T18:30:00.000Z");
  const dst = dayBoundsInTimeZone(
    new Date("2026-03-08T12:00:00Z"),
    "America/New_York",
  );
  expect(dst.end.getTime() - dst.start.getTime()).toBe(23 * 3600000);
});
