import type { ErrorRequestHandler } from "express";
import { logger } from "../config/logger.js";
import { ApiError } from "../utils/api-error.js";

type JsonParseError = SyntaxError & { status?: number; body?: unknown };

export const errorHandler: ErrorRequestHandler = (error: unknown, request, response, next) => {
  if (response.headersSent) {
    next(error);
    return;
  }

  const malformedJson = error instanceof SyntaxError && (error as JsonParseError).status === 400 && "body" in error;
  const apiError = error instanceof ApiError ? error : malformedJson
    ? new ApiError(400, "INVALID_JSON", "The request body contains malformed JSON.")
    : new ApiError(500, "INTERNAL_SERVER_ERROR", "An unexpected error occurred.");
  const requestId = String(request.id ?? response.getHeader("x-request-id") ?? "unknown");

  if (apiError.status >= 500) {
    logger.error({ err: error, requestId }, "Unhandled request error");
  }

  response.status(apiError.status).json({
    error: {
      code: apiError.code,
      message: apiError.message,
      requestId
    }
  });
};
