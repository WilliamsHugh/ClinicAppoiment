import type { Session } from "../session/session";

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
}

export interface ApiResult<T> {
  data: T;
  pagination?: PaginationMeta;
  requestId?: string;
}

export interface ApiErrorShape {
  code?: string;
  message?: string;
  details?: unknown[];
}

export class ApiClientError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
    public readonly details: unknown[] = [],
    public readonly requestId?: string
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

type QueryValue = string | number | boolean | null | undefined;

export interface RequestOptions {
  query?: Record<string, QueryValue>;
  body?: unknown;
  headers?: HeadersInit;
  idempotencyKey?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface ApiClientOptions {
  baseUrl: string;
  session: Pick<Session, "getAccessToken">;
  fetcher?: typeof fetch;
  timeoutMs?: number;
}

interface SuccessEnvelope<T> {
  success: true;
  data: T;
  requestId?: string;
}

interface ErrorEnvelope {
  success: false;
  error?: ApiErrorShape;
  requestId?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

function paginationFrom(data: unknown): PaginationMeta | undefined {
  if (!data || typeof data !== "object") return undefined;
  const candidate = data as Record<string, unknown>;
  return typeof candidate.page === "number" && typeof candidate.limit === "number" && typeof candidate.total === "number"
    ? { page: candidate.page, limit: candidate.limit, total: candidate.total }
    : undefined;
}

function appendQuery(path: string, query?: Record<string, QueryValue>): string {
  if (!query) return path;
  const [pathname, existing = ""] = path.split("?", 2);
  const params = new URLSearchParams(existing);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null) params.set(key, String(value));
  }
  const serialized = params.toString();
  return serialized ? `${pathname}?${serialized}` : pathname;
}

export class ApiClient {
  private readonly fetcher: typeof fetch;
  private readonly timeoutMs: number;
  private readonly baseUrl: string;

  constructor(private readonly options: ApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.fetcher = options.fetcher ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 10_000;
  }

  get<T>(path: string, options?: RequestOptions) {
    return this.request<T>("GET", path, options);
  }

  post<T>(path: string, options?: RequestOptions) {
    return this.request<T>("POST", path, options);
  }

  patch<T>(path: string, options?: RequestOptions) {
    return this.request<T>("PATCH", path, options);
  }

  private async request<T>(method: "GET" | "POST" | "PATCH", path: string, options: RequestOptions = {}): Promise<ApiResult<T>> {
    let token: string | null;
    try {
      token = await this.options.session.getAccessToken();
    } catch {
      throw new ApiClientError("Không thể đọc phiên đăng nhập.", 0, "SESSION_UNAVAILABLE");
    }
    if (!token) {
      throw new ApiClientError("Phiên đăng nhập không khả dụng.", 0, "SESSION_REQUIRED");
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort("timeout"), options.timeoutMs ?? this.timeoutMs);
    const abortFromCaller = () => controller.abort(options.signal?.reason);
    options.signal?.addEventListener("abort", abortFromCaller, { once: true });
    if (options.signal?.aborted) abortFromCaller();

    const headers = new Headers(options.headers);
    headers.delete("X-Role");
    headers.delete("X-User-Id");
    headers.set("Accept", "application/json");
    headers.set("Authorization", `Bearer ${token}`);
    if (options.body !== undefined) headers.set("Content-Type", "application/json");
    if (options.idempotencyKey) headers.set("Idempotency-Key", options.idempotencyKey);

    try {
      const response = await this.fetcher(`${this.baseUrl}${appendQuery(path, options.query)}`, {
        method,
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: controller.signal
      });
      const requestId = response.headers.get("X-Request-Id") ?? undefined;
      const text = await response.text();
      let parsed: unknown;

      try {
        parsed = JSON.parse(text) as unknown;
      } catch {
        throw new ApiClientError("Gateway trả về dữ liệu không hợp lệ.", response.status, "INVALID_RESPONSE", [], requestId);
      }
      if (!isRecord(parsed) || typeof parsed.success !== "boolean") {
        throw new ApiClientError("Gateway trả về dữ liệu không hợp lệ.", response.status, "INVALID_RESPONSE", [], requestId);
      }
      const envelope = parsed as unknown as SuccessEnvelope<T> | ErrorEnvelope;

      if (!response.ok || envelope.success !== true) {
        const failure = envelope as ErrorEnvelope;
        throw new ApiClientError(
          failure.error?.message ?? `Yêu cầu thất bại (${response.status}).`,
          response.status,
          failure.error?.code ?? "REQUEST_FAILED",
          Array.isArray(failure.error?.details) ? failure.error.details : [],
          failure.requestId ?? requestId
        );
      }

      return {
        data: envelope.data,
        pagination: paginationFrom(envelope.data),
        requestId: envelope.requestId ?? requestId
      };
    } catch (error) {
      if (error instanceof ApiClientError) throw error;
      if (controller.signal.aborted) {
        const timedOut = options.signal?.aborted !== true;
        throw new ApiClientError(
          timedOut ? "Yêu cầu đã quá thời gian chờ." : "Yêu cầu đã bị hủy.",
          0,
          timedOut ? "REQUEST_TIMEOUT" : "REQUEST_ABORTED"
        );
      }
      throw new ApiClientError("Không thể kết nối tới Gateway.", 0, "NETWORK_ERROR");
    } finally {
      clearTimeout(timeout);
      options.signal?.removeEventListener("abort", abortFromCaller);
    }
  }
}

export function createBrowserApiClient(session: Pick<Session, "getAccessToken">): ApiClient {
  return new ApiClient({
    baseUrl: process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080",
    session
  });
}
