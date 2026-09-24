import cors from "cors";
import express, { type Express } from "express";
import helmet from "helmet";
import { env } from "./config/env.js";
import { errorHandler } from "./middleware/error-handler.js";
import { notFoundHandler } from "./middleware/not-found.js";
import { requestLogger } from "./middleware/request-logger.js";
import { createHealthRouter, type DatabaseCheck } from "./modules/health/health.routes.js";
import { checkDatabaseConnection } from "./services/database.js";

export interface AppDependencies {
  checkDatabase?: DatabaseCheck;
}

export function createApp(dependencies: AppDependencies = {}): Express {
  const app = express();
  const checkDatabase = dependencies.checkDatabase ?? checkDatabaseConnection;

  app.disable("x-powered-by");
  app.use(requestLogger);
  app.use(helmet());
  app.use(cors({
    origin(origin, callback) {
      if (!origin || env.corsOrigins.includes("*") || env.corsOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(null, false);
    },
    credentials: true
  }));
  app.use(express.json({ limit: env.JSON_BODY_LIMIT }));

  app.use(createHealthRouter(checkDatabase));
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
