import { ApiError } from "../api/http";

interface ApiIssueBannerProps {
  error: Error | null;
  label: string;
  message?: string;
}

export function ApiIssueBanner({ error, label, message }: ApiIssueBannerProps) {
  if (!error) {
    return null;
  }

  return (
    <div className="api-issue-banner" role="status">
      {/* 2026-07-16: Auth/API failures should be visible without replacing the page content. */}
      <strong>{label}</strong>
      <span>{message ?? formatApiError(error)}</span>
    </div>
  );
}

function formatApiError(error: Error) {
  if (error instanceof ApiError) {
    const code =
      typeof error.body === "object" &&
      error.body !== null &&
      "error" in error.body &&
      typeof (error.body as { error?: { code?: string } }).error?.code === "string"
        ? (error.body as { error: { code: string } }).error.code
        : null;

    return [`HTTP ${error.status}`, code, error.message].filter(Boolean).join(" - ");
  }

  return error.message;
}
