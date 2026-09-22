import { randomUUID } from "node:crypto";
import type { ErrorRequestHandler, NextFunction, Response } from "express";
import type { GatewayRequest } from "./types.js";

export type GatewayLogger = Pick<Console, "info" | "error">;

const requestIdPattern = /^[A-Za-z0-9._:-]{1,128}$/;
const resourceIdInPath = /\/(users|patients|specialties|doctors|schedules|appointments|medical-records|notifications)\/[^/]+/g;

function safeLogPath(path: string): string {
  return path.replace(resourceIdInPath, "/$1/:id");
}

export function requestContext(logger: GatewayLogger) {
  return (req: GatewayRequest, res: Response, next: NextFunction) => {
    const incomingRequestId = req.header("x-request-id");
    req.requestId = incomingRequestId && requestIdPattern.test(incomingRequestId) ? incomingRequestId : randomUUID();
    res.setHeader("X-Request-Id", req.requestId);
    const startedAt = performance.now();

    res.on("finish", () => {
      logger.info(JSON.stringify({
        level: "info",
        event: "request.completed",
        requestId: req.requestId,
        method: req.method,
        path: safeLogPath(req.path),
        statusCode: res.statusCode,
        durationMs: Math.round(performance.now() - startedAt),
        actorRole: req.user?.role
      }));
    });
    next();
  };
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
  return (error: unknown, req: GatewayRequest, res, _next) => {
    logger.error(JSON.stringify({
      level: "error",
      event: "request.failed",
      requestId: req.requestId,
      method: req.method,
      path: safeLogPath(req.path),
      error: "Unexpected request failure"
    }));
    if (res.headersSent) return;
    sendError(res, 500, "INTERNAL_SERVER_ERROR", "An unexpected error occurred", [], req.requestId);
  };
}
