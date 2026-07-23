export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const API_UNAUTHORIZED_EVENT = "ucms:api-unauthorized";

interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

export async function request<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const headers = new Headers(init.headers);

  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(path, {
    credentials: "include",
    ...init,
    headers
  });

  if (!response.ok) {
    const body = await readResponseBody(response);
    // 2026-07-23: Any API 401 invalidates the client-side identity immediately.
    if (response.status === 401 && typeof window !== "undefined") {
      window.dispatchEvent(new Event(API_UNAUTHORIZED_EVENT));
    }
    const message =
      typeof body === "object" &&
      body !== null &&
      "error" in body &&
      typeof (body as { error?: { message?: string } }).error?.message === "string"
        ? (body as { error: { message: string } }).error.message
        : response.statusText;
    throw new ApiError(message, response.status, body);
  }

  return response.json() as Promise<T>;
}

export async function requestData<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const envelope = await request<ApiEnvelope<T>>(path, init);

  if (!envelope.success) {
    throw new ApiError(
      envelope.error?.message ?? "API request failed.",
      200,
      envelope
    );
  }

  return envelope.data as T;
}

// 2026-07-16: Backend contract now returns JSON envelopes; parse JSON errors
// instead of falling back to local demo data so integration failures are visible.
async function readResponseBody(response: Response) {
  const text = await response.text();

  if (!text) {
    return "";
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
