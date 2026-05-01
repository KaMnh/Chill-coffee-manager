export function unwrapJson<T>(data: unknown, fallback: T): T {
  if (!data) return fallback;
  return data as T;
}

export async function getFunctionErrorMessage(error: unknown, fallback: string) {
  const context = (error as { context?: Response })?.context;
  if (context && typeof context.clone === "function") {
    try {
      const body = (await context.clone().json()) as Record<string, unknown>;
      const message = String(body.error ?? body.message ?? fallback);
      const details = [
        body.n8n_status ? `n8n HTTP ${body.n8n_status}` : "",
        body.detail ? String(body.detail) : ""
      ].filter(Boolean);
      return details.length ? `${message} ${details.join(" - ")}` : message;
    } catch {
      try {
        const text = await context.clone().text();
        if (text) return text;
      } catch {
        // Fall through to the generic error message.
      }
    }
  }
  return error instanceof Error ? error.message : fallback;
}
