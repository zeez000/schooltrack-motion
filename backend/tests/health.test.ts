import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";

describe("Phase 1 service health", () => {
  it("reports process liveness with a request ID", async () => {
    const response = await request(createApp({ checkDatabase: async () => undefined })).get("/health");

    expect(response.status).toBe(200);
    expect(response.headers["x-request-id"]).toBeTypeOf("string");
    expect(response.body).toEqual({
      status: "ok",
      database: "not_checked",
      timestamp: expect.any(String)
    });
  });

  it("reports readiness when PostgreSQL is reachable", async () => {
    const response = await request(createApp({ checkDatabase: async () => undefined })).get("/ready");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: "ready",
      database: "connected",
      timestamp: expect.any(String)
    });
  });

  it("reports not ready without leaking a database error", async () => {
    const response = await request(createApp({
      checkDatabase: async () => { throw new Error("database details must not leak"); }
    })).get("/ready");

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      status: "not_ready",
      database: "disconnected",
      timestamp: expect.any(String)
    });
    expect(JSON.stringify(response.body)).not.toContain("database details must not leak");
  });

  it("uses the standard error envelope for unknown routes", async () => {
    const response = await request(createApp({ checkDatabase: async () => undefined })).get("/missing");

    expect(response.status).toBe(404);
    expect(response.body.error).toEqual({
      code: "ROUTE_NOT_FOUND",
      message: "No route exists for GET /missing.",
      requestId: response.headers["x-request-id"]
    });
  });

  it("rejects malformed JSON consistently", async () => {
    const response = await request(createApp({ checkDatabase: async () => undefined }))
      .post("/missing")
      .set("content-type", "application/json")
      .send('{"broken":');

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("INVALID_JSON");
    expect(response.body.error.requestId).toBe(response.headers["x-request-id"]);
  });
});
