export interface AppError {
  kind: "Database" | "Vault" | "Ssh" | "NotFound" | "Validation" | "Io" | "AlreadyExists" | "Cancelled";
  message: string;
}

export function isAppError(e: unknown): e is AppError {
  return (
    typeof e === "object" &&
    e !== null &&
    "kind" in e &&
    "message" in e &&
    typeof (e as AppError).message === "string"
  );
}

export function isAlreadyExistsError(e: unknown): boolean {
  return isAppError(e) && e.kind === "AlreadyExists";
}

export function isCancelledError(e: unknown): boolean {
  return isAppError(e) && e.kind === "Cancelled";
}

export function formatError(e: unknown): string {
  if (isAppError(e)) return e.message;
  if (e instanceof Error) return e.message;
  return String(e);
}
