export type AuditOutcome = "connecting" | "success" | "user_closed" | "failure" | "timeout";

export interface AuditEntry {
  id: string;
  serverId: string | null;
  serverDisplayName: string;
  hostname: string;
  port: number;
  username: string;
  outcome: AuditOutcome;
  errorMessage: string | null;
  sessionStart: string;
  sessionEnd: string | null;
  createdAt: string;
}
