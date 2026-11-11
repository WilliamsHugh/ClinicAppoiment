import type { ErrorRequestHandler, Response } from "express";
import { createRequestLoggingMiddleware, logServiceEvent } from "@clinic/request-logging";
import type { GatewayRequest } from "./types.js";

export type GatewayLogger = Pick<Console, "info" | "error">;

export function requestContext(logger: GatewayLogger) {
  return createRequestLoggingMiddleware<GatewayRequest>("api-gateway", {
    logger: (line) => logger.info(line),
    setRequestId: (req, requestId) => { req.requestId = requestId; }
  });
}

export function sendError(
  res: Response,
  status: number,
  code: string,
  message: string,
  details: unknown[] = [],
  requestId?: string
) {
  return res.status(status).json({
    success: false,
    error: { code, message, details },
    ...(requestId ? { requestId } : {})
  });
}

export function notFoundHandler(req: GatewayRequest, res: Response) {
  return sendError(res, 404, "ROUTE_NOT_FOUND", "Route not found", [], req.requestId);
}

export function createErrorHandler(logger: GatewayLogger): ErrorRequestHandler {
  return (_error: unknown, req: GatewayRequest, res, _next) => {
    logServiceEvent("api-gateway", "error", "request.failed", {
      requestId: req.requestId,
      code: "INTERNAL_SERVER_ERROR"
    }, (line) => logger.error(line));
    if (res.headersSent) return;
    sendError(res, 500, "INTERNAL_SERVER_ERROR", "An unexpected error occurred", [], req.requestId);
  };
}
