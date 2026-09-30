import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";

describe("service health", () => {
  it("reports process liveness with a request ID", async () => {
    const response = await request(createApp({ checkDatabase: async () => undefined })).get("/health");
    expect(response.status).toBe(200);
    expect(response.headers["x-request-id"]).toBeTypeOf("string");
    expect(response.body.status).toBe("ok");
  });

  it("preserves a safe request ID and replaces unsafe client values", async () => {
    const app = createApp({ checkDatabase: async () => undefined });
    const safe = await request(app).get("/health").set("x-request-id", "client-safe_123");
    expect(safe.headers["x-request-id"]).toBe("client-safe_123");

    const unsafe = await request(app).get("/health").set("x-request-id", "bad id with spaces and controls");
    expect(unsafe.headers["x-request-id"]).not.toBe("bad id with spaces and controls");
    expect(String(unsafe.headers["x-request-id"])).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it("reports readiness when PostgreSQL is reachable", async () => {
    const response = await request(createApp({ checkDatabase: async () => undefined })).get("/ready");
    expect(response.status).toBe(200);
    expect(response.body.database).toBe("connected");
  });

  it("reports not ready without leaking database errors", async () => {
    const response = await request(createApp({
      checkDatabase: async () => { throw new Error("secret database details"); }
    })).get("/ready");
    expect(response.status).toBe(503);
    expect(JSON.stringify(response.body)).not.toContain("secret database details");
  });

  it("uses the standard error envelope for unknown routes", async () => {
    const response = await request(createApp({ checkDatabase: async () => undefined })).get("/missing");
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("ROUTE_NOT_FOUND");
    expect(response.body.error.requestId).toBe(response.headers["x-request-id"]);
  });

  it("rejects malformed JSON consistently", async () => {
    const response = await request(createApp({ checkDatabase: async () => undefined }))
      .post("/missing")
      .set("content-type", "application/json")
      .send('{"broken":');
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("INVALID_JSON");
  });
});
