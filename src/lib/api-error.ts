import { AppError } from "./room-service";

export function handleApiError(err: unknown): Response {
  if (err instanceof AppError) {
    return Response.json(
      { error: err.message },
      { status: err.statusCode }
    );
  }
  console.error("[API Error]", err);
  const message =
    err instanceof Error ? err.message : "Unexpected server error.";
  return Response.json({ error: message }, { status: 500 });
}
