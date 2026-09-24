import { Router } from "express";

export type DatabaseCheck = () => Promise<void>;

export function createHealthRouter(checkDatabase: DatabaseCheck): Router {
  const router = Router();

  router.get("/health", (_request, response) => {
    response.json({
      status: "ok",
      database: "not_checked",
      timestamp: new Date().toISOString()
    });
  });

  router.get("/ready", async (_request, response) => {
    try {
      await checkDatabase();
      response.json({
        status: "ready",
        database: "connected",
        timestamp: new Date().toISOString()
      });
    } catch {
      response.status(503).json({
        status: "not_ready",
        database: "disconnected",
        timestamp: new Date().toISOString()
      });
    }
  });

  return router;
}
