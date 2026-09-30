import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import {
  AttendanceStatus,
  CheckpointEventType,
  CheckpointSource,
  DeviceType,
  JourneyDirection,
  JourneyStatus,
  RouteDirection
} from "../src/generated/prisma/client.js";
import { prisma } from "../src/services/database.js";
import { utcDateOnly } from "../src/services/projections.js";
import { sha256Token } from "../src/utils/auth-crypto.js";
import { app, bearer, createFixture, login, resetDatabase } from "./helpers/database.js";

beforeEach(resetDatabase);

describe("journey, attendance, device, and vehicle security integration", () => {
  it("does not infer boarding when a later school gate checkpoint exists", async () => {
    const fixture = await createFixture();
    const admin = await login(fixture.adminA.email);
    const parent = await login(fixture.parentA.email);
    await request(app).post("/api/checkpoints").set(bearer(admin)).send({
      studentId: fixture.studentA.id,
      eventType: CheckpointEventType.SCHOOL_GATE_ENTRY,
      source: CheckpointSource.SCHOOL_GATE
    });
    const response = await request(app).get(`/api/students/${fixture.studentA.id}/today`).set(bearer(parent));
    expect(response.status).toBe(200);
    expect(response.body.checkpoints.morning.BUS_BOARDING.status).toBe("NOT_RECORDED");
    expect(await prisma.checkpointEvent.count({
      where: { studentId: fixture.studentA.id, eventType: CheckpointEventType.BUS_BOARDING }
    })).toBe(0);
  });

  it("does not expose parent live GPS until an authorized journey is active", async () => {
    const fixture = await createFixture();
    const parent = await login(fixture.parentA.email);
    await prisma.vehicleLocation.create({
      data: { schoolId: fixture.schoolA.id, vehicleId: fixture.vehicleA.id, latitude: 13.08, longitude: 80.27, timestamp: new Date() }
    });

    const direct = await request(app).get(`/api/vehicles/${fixture.vehicleA.id}/location`).set(bearer(parent));
    expect(direct.status).toBe(403);

    const today = await request(app).get(`/api/students/${fixture.studentA.id}/today`).set(bearer(parent));
    expect(today.status).toBe(200);
    expect(today.body.vehicle.status).toBe("NOT_ACTIVE");
    expect(today.body.vehicle.location).toBeNull();
  });

  it("does not treat vehicle GPS as proof of student boarding during an active journey", async () => {
    const fixture = await createFixture();
    const driver = await login(fixture.driverA.email);
    const parent = await login(fixture.parentA.email);
    await prisma.journey.create({
      data: {
        schoolId: fixture.schoolA.id,
        studentId: fixture.studentA2.id,
        routeId: fixture.routeA.id,
        date: utcDateOnly(),
        direction: JourneyDirection.MORNING,
        status: JourneyStatus.IN_PROGRESS,
        startedAt: new Date()
      }
    });
    const write = await request(app).post(`/api/vehicles/${fixture.vehicleA.id}/location`).set(bearer(driver)).send({
      latitude: 13.08, longitude: 80.27, speed: 24, heading: 90
    });
    expect(write.status, JSON.stringify(write.body)).toBe(201);

    const response = await request(app).get(`/api/students/${fixture.studentA2.id}/today`).set(bearer(parent));
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(response.body.vehicle.status).toBe("CURRENT");
    expect(response.body.checkpoints.morning.BUS_BOARDING.status).toBe("AWAITING_RECORD");
    expect(await prisma.checkpointEvent.count({
      where: { studentId: fixture.studentA2.id, eventType: CheckpointEventType.BUS_BOARDING }
    })).toBe(0);
  });

  it("records an attendance correction with audit history", async () => {
    const fixture = await createFixture();
    const teacher = await login(fixture.teacherA.email);
    const date = new Date().toISOString().slice(0, 10);
    let response = await request(app).post(`/api/classes/${fixture.classA.id}/attendance`).set(bearer(teacher)).send({
      date, records: [{ studentId: fixture.studentA.id, status: AttendanceStatus.PRESENT }]
    });
    expect(response.status).toBe(200);

    response = await request(app).post(`/api/classes/${fixture.classA.id}/attendance`).set(bearer(teacher)).send({
      date,
      records: [{ studentId: fixture.studentA.id, status: AttendanceStatus.ABSENT, correctionReason: "Parent confirmed absence after initial entry" }]
    });
    expect(response.status).toBe(200);
    const record = await prisma.attendanceRecord.findFirstOrThrow({ where: { studentId: fixture.studentA.id }, include: { corrections: true } });
    expect(record.status).toBe(AttendanceStatus.ABSENT);
    expect(record.corrections).toHaveLength(1);
    expect(await prisma.auditLog.count({ where: { entityType: "AttendanceRecord", action: "ATTENDANCE_CORRECTED" } })).toBe(1);
  });

  it("creates a persistent guardian notification from a checkpoint", async () => {
    const fixture = await createFixture();
    const admin = await login(fixture.adminA.email);
    const response = await request(app).post("/api/checkpoints").set(bearer(admin)).send({
      studentId: fixture.studentA.id,
      eventType: CheckpointEventType.SCHOOL_GATE_ENTRY,
      source: CheckpointSource.MANUAL
    });
    expect(response.status).toBe(201);
    const notification = await prisma.notification.findFirst({ where: { userId: fixture.parentA.id, studentId: fixture.studentA.id } });
    expect(notification).not.toBeNull();
    expect(notification?.title).toContain("School entry");
  });

  it("marks an old vehicle sample stale when the parent has an active journey", async () => {
    const fixture = await createFixture();
    const parent = await login(fixture.parentA.email);
    await prisma.journey.create({
      data: {
        schoolId: fixture.schoolA.id, studentId: fixture.studentA.id, routeId: fixture.routeA.id,
        date: utcDateOnly(), direction: JourneyDirection.MORNING, status: JourneyStatus.IN_PROGRESS, startedAt: new Date()
      }
    });
    const old = new Date(Date.now() - 15 * 60_000);
    await prisma.vehicleLocation.create({
      data: { schoolId: fixture.schoolA.id, vehicleId: fixture.vehicleA.id, latitude: 13.08, longitude: 80.27, timestamp: old }
    });
    const response = await request(app).get(`/api/vehicles/${fixture.vehicleA.id}/location`).set(bearer(parent));
    expect(response.status).toBe(200);
    expect(response.body.location.stale).toBe(true);
    expect(new Date(response.body.location.timestamp).getTime()).toBe(old.getTime());
  });

  it("blocks transport staff from boarding an unassigned student", async () => {
    const fixture = await createFixture();
    const driver = await login(fixture.driverA.email);
    const response = await request(app).post(`/api/students/${fixture.studentB.id}/boarding`).set(bearer(driver)).send({});
    expect([403, 404]).toContain(response.status);
    expect(await prisma.checkpointEvent.count({ where: { studentId: fixture.studentB.id } })).toBe(0);
  });

  it("does not let a morning-route driver perform a return handover on another route", async () => {
    const fixture = await createFixture();
    await prisma.studentRouteAssignment.updateMany({
      where: { studentId: fixture.studentA.id, routeId: fixture.routeA.id },
      data: { direction: RouteDirection.MORNING }
    });
    const vehicleB = await prisma.vehicle.create({
      data: { schoolId: fixture.schoolA.id, registrationNumber: "TEST-BUS-2", label: "Bus 2", capacity: 30 }
    });
    const routeB = await prisma.route.create({ data: { schoolId: fixture.schoolA.id, name: "Route B", vehicleId: vehicleB.id } });
    const stopB = await prisma.routeStop.create({
      data: { routeId: routeB.id, name: "Stop B", latitude: 13.09, longitude: 80.28, sequence: 1 }
    });
    await prisma.studentRouteAssignment.create({
      data: { studentId: fixture.studentA.id, routeId: routeB.id, stopId: stopB.id, direction: RouteDirection.RETURN }
    });

    const driver = await login(fixture.driverA.email);
    const response = await request(app).post(`/api/students/${fixture.studentA.id}/handover`).set(bearer(driver)).send({});
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("STUDENT_ROUTE_NOT_AUTHORIZED");
  });

  it("forces trusted actor provenance and rejects idempotency-key collisions across checkpoints", async () => {
    const fixture = await createFixture();
    const admin = await login(fixture.adminA.email);
    const sourceEventId = "shared-external-event-id";
    const first = await request(app).post("/api/checkpoints").set(bearer(admin)).send({
      studentId: fixture.studentA.id,
      eventType: CheckpointEventType.SCHOOL_GATE_ENTRY,
      source: CheckpointSource.RFID,
      sourceEventId
    });
    expect(first.status).toBe(201);
    expect(first.body.event.source).toBe(CheckpointSource.MANUAL);

    const collision = await request(app).post("/api/checkpoints").set(bearer(admin)).send({
      studentId: fixture.studentA2.id,
      eventType: CheckpointEventType.SCHOOL_GATE_ENTRY,
      source: CheckpointSource.RFID,
      sourceEventId
    });
    expect(collision.status).toBe(409);
    expect(collision.body.error.code).toBe("IDEMPOTENCY_KEY_CONFLICT");
  });

  it("redacts internal recorder, device, source-event and metadata fields from parent journey responses", async () => {
    const fixture = await createFixture();
    const admin = await login(fixture.adminA.email);
    const parent = await login(fixture.parentA.email);
    const journey = await prisma.journey.create({
      data: {
        schoolId: fixture.schoolA.id, studentId: fixture.studentA.id, routeId: fixture.routeA.id,
        date: utcDateOnly(), direction: JourneyDirection.MORNING, status: JourneyStatus.IN_PROGRESS, startedAt: new Date()
      }
    });
    await request(app).post("/api/checkpoints").set(bearer(admin)).send({
      studentId: fixture.studentA.id,
      journeyId: journey.id,
      eventType: CheckpointEventType.SCHOOL_GATE_ENTRY,
      source: CheckpointSource.SYSTEM,
      sourceEventId: "private-provenance-id",
      metadata: { internalReader: "secret-reader-name" }
    });

    const response = await request(app).get(`/api/students/${fixture.studentA.id}/journeys`).set(bearer(parent));
    expect(response.status).toBe(200);
    const serialized = JSON.stringify(response.body);
    for (const hidden of ["recordedByUserId", "deviceId", "sourceEventId", "internalReader"]) expect(serialized).not.toContain(hidden);
  });

  it("enforces per-device checkpoint capability allowlists", async () => {
    const fixture = await createFixture();
    const token = "scanner-test-token-12345678901234567890";
    await prisma.device.create({
      data: {
        schoolId: fixture.schoolA.id,
        deviceKey: "gate-reader-test",
        tokenHash: sha256Token(token),
        deviceType: DeviceType.RFID_READER,
        allowedEventTypes: [CheckpointEventType.SCHOOL_GATE_ENTRY],
        location: "Main gate"
      }
    });
    const headers = { "x-device-id": "gate-reader-test", "x-device-token": token };

    const forbidden = await request(app).post("/api/device/checkpoints").set(headers).send({
      studentId: fixture.studentA.id, eventType: CheckpointEventType.BUS_BOARDING
    });
    expect(forbidden.status).toBe(403);
    expect(forbidden.body.error.code).toBe("DEVICE_EVENT_FORBIDDEN");

    const allowed = await request(app).post("/api/device/checkpoints").set(headers).send({
      studentId: fixture.studentA.id,
      eventType: CheckpointEventType.SCHOOL_GATE_ENTRY,
      sourceEventId: "gate-reader-test-event"
    });
    expect(allowed.status).toBe(201);
    expect(allowed.body.event.source).toBe(CheckpointSource.RFID);
  });

  it("lets a GPS tracker publish only for its bound vehicle", async () => {
    const fixture = await createFixture();
    const token = "gps-test-token-12345678901234567890123";
    await prisma.device.create({
      data: {
        schoolId: fixture.schoolA.id,
        deviceKey: "gps-test",
        tokenHash: sha256Token(token),
        deviceType: DeviceType.GPS_TRACKER,
        vehicleId: fixture.vehicleA.id,
        allowedEventTypes: []
      }
    });
    const vehicleB = await prisma.vehicle.create({
      data: { schoolId: fixture.schoolA.id, registrationNumber: "GPS-OTHER", label: "Other Bus", capacity: 20 }
    });
    const headers = { "x-device-id": "gps-test", "x-device-token": token };

    const correct = await request(app).post(`/api/device/vehicles/${fixture.vehicleA.id}/location`).set(headers).send({
      latitude: 13.08, longitude: 80.27, speed: 20, heading: 180
    });
    expect(correct.status).toBe(201);

    const wrongVehicle = await request(app).post(`/api/device/vehicles/${vehicleB.id}/location`).set(headers).send({
      latitude: 13.08, longitude: 80.27
    });
    expect(wrongVehicle.status).toBe(403);
    expect(wrongVehicle.body.error.code).toBe("DEVICE_VEHICLE_MISMATCH");
  });

  it("rejects checkpoint timestamps outside the accepted future window", async () => {
    const fixture = await createFixture();
    const admin = await login(fixture.adminA.email);
    const response = await request(app).post("/api/checkpoints").set(bearer(admin)).send({
      studentId: fixture.studentA.id,
      eventType: CheckpointEventType.SCHOOL_GATE_ENTRY,
      source: CheckpointSource.MANUAL,
      timestamp: new Date(Date.now() + 60 * 60_000).toISOString()
    });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("CHECKPOINT_TIME_INVALID");
  });
});
