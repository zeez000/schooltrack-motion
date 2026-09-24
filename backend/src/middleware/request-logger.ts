import { randomUUID } from "node:crypto";
import pinoHttpModule, { type HttpLogger, type Options } from "pino-http";
import { logger } from "../config/logger.js";

const options: Options = {
  logger,
  genReqId(request, response) {
    const supplied = request.headers["x-request-id"];
    const requestId = typeof supplied === "string" && supplied.length <= 128 ? supplied : randomUUID();
    response.setHeader("x-request-id", requestId);
    return requestId;
  },
  customLogLevel(_request, response, error) {
    if (error || response.statusCode >= 500) return "error";
    if (response.statusCode >= 400) return "warn";
    return "info";
  },
  customSuccessMessage(request, response) {
    return `${request.method} ${request.url} ${response.statusCode}`;
  },
  customErrorMessage(request, response) {
    return `${request.method} ${request.url} ${response.statusCode}`;
  }
};

const createHttpLogger = pinoHttpModule as unknown as (loggerOptions: Options) => HttpLogger;

export const requestLogger = createHttpLogger(options);
