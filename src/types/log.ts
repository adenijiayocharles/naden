export type LogOutcome = "connecting" | "success" | "user_closed" | "failure" | "timeout";

export interface LogEntry {
  id: string;
  serverId: string | null;
  serverDisplayName: string;
  hostname: string;
  port: number;
  username: string;
  outcome: LogOutcome;
  errorMessage: string | null;
  sessionStart: string;
  sessionEnd: string | null;
  createdAt: string;
}
