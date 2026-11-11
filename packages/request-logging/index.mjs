import { randomUUID } from "node:crypto";

const requestIdPattern = /^[A-Za-z0-9._:-]{1,128}$/;
const resourceIdPattern = /\/(users|patients|specialties|doctors|schedules|appointments|medical-records|notifications)\/[^/]+/g;
const eventPattern = /^[a-z][a-z0-9_.-]{0,79}$/;
const fieldPattern = /^[a-z][a-zA-Z0-9_]{0,39}$/;
const sensitiveFieldPattern = /(token|secret|password|authorization|credential|email|phone|patient|record|body|query|url|connection)/i;

function safeRequestPath(request) {
  const rawPath = request.path ?? request.originalUrl?.split("?", 1)[0] ?? "/";
  return rawPath
    .replace(/\/(users|patients|doctors)\/by-user\/[^/]+/g, "/$1/by-user/:id")
    .replace(resourceIdPattern, "/$1/:id");
}

export function createRequestLoggingMiddleware(service, options = {}) {
  const logger = options.logger ?? ((line) => console.info(line));

  return (request, response, next) => {
    const suppliedRequestId = request.header("x-request-id");
    const requestId = suppliedRequestId && requestIdPattern.test(suppliedRequestId)
      ? suppliedRequestId
      : randomUUID();
    const startedAt = performance.now();

    options.setRequestId?.(request, requestId);
    response.setHeader("X-Request-Id", requestId);
    response.once("finish", () => {
      const durationMs = Math.max(0, Math.round(performance.now() - startedAt));
      logger(`[${service}] ${request.method} ${safeRequestPath(request)} ${response.statusCode} ${durationMs}ms rid=${requestId}`);
    });
    next();
  };
}

export function logServiceEvent(service, level, event, fields = {}, logger) {
  if (!eventPattern.test(event)) throw new TypeError("Invalid log event name");
  const write = logger ?? (line => {
    const method = level === "error" ? console.error : level === "warn" ? console.warn : console.info;
    method(line);
  });
  const safeFields = Object.entries(fields)
    .filter(([key, value]) => fieldPattern.test(key) && !sensitiveFieldPattern.test(key) && value !== undefined)
    .map(([key, value]) => `${key}=${String(value).replace(/[\s\r\n=]/g, "_").slice(0, 120)}`);
  write(`[${service}] ${level.toUpperCase()} ${event}${safeFields.length ? ` ${safeFields.join(" ")}` : ""}`);
}
