import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../src/services/database.js";
import { app, bearer, createFixture, login, loginSession, resetDatabase, TEST_PASSWORD } from "./helpers/database.js";

beforeEach(resetDatabase);

describe("authentication and authorization security", () => {
  it("rejects invalid login credentials without revealing account state", async () => {
    await createFixture();
    for (const email of ["parent.a@test.demo", "missing@test.demo"]) {
      const response = await request(app).post("/api/auth/login").send({ email, password: "wrong password" });
      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe("INVALID_CREDENTIALS");
      expect(response.body.error.message).toBe("Email or password is incorrect.");
    }
  });

  it("rate-limits repeated login attempts against the same account identifier", async () => {
    await createFixture();
    let lastStatus = 0;
    for (let attempt = 0; attempt < 11; attempt += 1) {
      const response = await request(app).post("/api/auth/login").send({ email: "parent.a@test.demo", password: "wrong password" });
      lastStatus = response.status;
    }
    expect(lastStatus).toBe(429);
  });

  it("allows only one concurrent refresh claim and revokes the replacement after replay detection", async () => {
    const fixture = await createFixture();
    const session = await loginSession(fixture.parentA.email);
    const [first, second] = await Promise.all([
      request(app).post("/api/auth/refresh").send({ refreshToken: session.refreshToken }),
      request(app).post("/api/auth/refresh").send({ refreshToken: session.refreshToken })
    ]);
    const success = [first, second].find((response) => response.status === 200);
    const replay = [first, second].find((response) => response.status === 401);
    expect(success, `responses: ${first.status}/${second.status}`).toBeDefined();
    expect(replay?.body.error.code).toBe("REFRESH_TOKEN_REUSED");

    const replacement = success!.body.refreshToken as string;
    const replacementUse = await request(app).post("/api/auth/refresh").send({ refreshToken: replacement });
    expect(replacementUse.status).toBe(401);

    const accessUse = await request(app).get("/api/auth/me").set(bearer(success!.body.accessToken));
    expect(accessUse.status).toBe(401);
    expect(await prisma.refreshSession.count({ where: { userId: fixture.parentA.id, revokedAt: null } })).toBe(0);
  });

  it("changes password, revokes refresh sessions and invalidates the current access token", async () => {
    const fixture = await createFixture();
    const session = await loginSession(fixture.parentA.email);
    const changed = await request(app).post("/api/auth/change-password").set(bearer(session.accessToken)).send({
      currentPassword: TEST_PASSWORD,
      newPassword: "SchoolTrackChanged!2026"
    });
    expect(changed.status).toBe(204);

    const oldAccess = await request(app).get("/api/auth/me").set(bearer(session.accessToken));
    expect(oldAccess.status).toBe(401);
    const oldRefresh = await request(app).post("/api/auth/refresh").send({ refreshToken: session.refreshToken });
    expect(oldRefresh.status).toBe(401);

    const oldLogin = await request(app).post("/api/auth/login").send({ email: fixture.parentA.email, password: TEST_PASSWORD });
    expect(oldLogin.status).toBe(401);
    const newLogin = await request(app).post("/api/auth/login").send({ email: fixture.parentA.email, password: "SchoolTrackChanged!2026" });
    expect(newLogin.status).toBe(200);
  });

  it("blocks unauthenticated protected access", async () => {
    await createFixture();
    const response = await request(app).get("/api/me/students");
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("AUTH_REQUIRED");
  });

  it("lets a parent access their own child with a minimal response", async () => {
    const fixture = await createFixture();
    const token = await login(fixture.parentA.email);
    const response = await request(app).get(`/api/students/${fixture.studentA.id}`).set(bearer(token));
    expect(response.status).toBe(200);
    expect(response.body.student.id).toBe(fixture.studentA.id);
    expect(response.body.student.guardians).toBeUndefined();
  });

  it("blocks transport role from generic student history", async () => {
    const f = await createFixture();
    const token = await login(f.driverA.email);
    const r = await request(app).get(`/api/students/${f.studentA.id}/journeys`).set(bearer(token));
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe("ROLE_FORBIDDEN");
  });

  it("does not let a parent access a child in another school", async () => {
    const fixture = await createFixture();
    const token = await login(fixture.parentA.email);
    const response = await request(app).get(`/api/students/${fixture.studentB.id}`).set(bearer(token));
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("STUDENT_NOT_FOUND");
  });

  it("does not let a teacher access an unrelated class", async () => {
    const fixture = await createFixture();
    const token = await login(fixture.teacherA.email);
    const response = await request(app).get(`/api/classes/${fixture.classAOther.id}/students`).set(bearer(token));
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("CLASS_NOT_AUTHORIZED");
  });

  it("keeps another school outside an admin tenant", async () => {
    const fixture = await createFixture();
    const token = await login(fixture.adminA.email);
    const response = await request(app).get(`/api/students/${fixture.studentB.id}`).set(bearer(token));
    expect(response.status).toBe(404);
  });

  it("keeps valid login working after abuse controls", async () => {
    const fixture = await createFixture();
    const response = await request(app).post("/api/auth/login").send({ email: fixture.parentA.email, password: TEST_PASSWORD });
    expect(response.status).toBe(200);
    expect(response.body.accessToken).toEqual(expect.any(String));
  });
});
