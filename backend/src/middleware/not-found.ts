import type { RequestHandler } from "express";
import { ApiError } from "../utils/api-error.js";

export const notFoundHandler: RequestHandler = (request, _response, next) => {
  next(new ApiError(404, "ROUTE_NOT_FOUND", `No route exists for ${request.method} ${request.path}.`));
};
