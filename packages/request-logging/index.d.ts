export interface RequestLike {
  method: string;
  path?: string;
  originalUrl?: string;
  header(name: string): string | undefined;
}

export interface ResponseLike {
  statusCode: number;
  setHeader(name: string, value: string): unknown;
  once(event: "finish", listener: () => void): unknown;
}

export type LogLevel = "info" | "warn" | "error";
export type LogWriter = (line: string) => void;
export type Next = (error?: unknown) => void;

export function createRequestLoggingMiddleware<Request extends RequestLike>(
  service: string,
  options?: {
    logger?: LogWriter;
    setRequestId?: (request: Request, requestId: string) => void;
  }
): (request: Request, response: ResponseLike, next: Next) => void;

export function logServiceEvent(
  service: string,
  level: LogLevel,
  event: string,
  fields?: Record<string, string | number | boolean | undefined>,
  logger?: LogWriter
): void;
