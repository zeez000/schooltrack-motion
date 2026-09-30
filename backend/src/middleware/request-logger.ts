import { randomUUID } from "node:crypto";
import pinoHttpModule, { type HttpLogger, type Options } from "pino-http";
import { logger } from "../config/logger.js";

const safeRequestId = /^[A-Za-z0-9._:-]{1,64}$/;
const pathOnly = (url?: string) => (url ?? "").split("?", 1)[0] || "/";

const options: Options = {
  logger,
  genReqId(request, response) {
    const supplied = request.headers["x-request-id"];
    const id = typeof supplied === "string" && safeRequestId.test(supplied) ? supplied : randomUUID();
    response.setHeader("x-request-id", id);
    return id;
  },
  customLogLevel(_request, response, error) {
    if (error || response.statusCode >= 500) return "error";
    if (response.statusCode >= 400) return "warn";
    return "info";
  },
  customSuccessMessage(request, response) {
    return `${request.method} ${pathOnly(request.url)} ${response.statusCode}`;
  },
  customErrorMessage(request, response) {
    return `${request.method} ${pathOnly(request.url)} ${response.statusCode}`;
  }
};

const createHttpLogger = pinoHttpModule as unknown as (loggerOptions: Options) => HttpLogger;
export const requestLogger = createHttpLogger(options);
