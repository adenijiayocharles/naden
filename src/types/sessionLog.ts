export interface SessionLog {
  id: string;
  serverId: string | null;
  serverDisplayName: string;
  filePath: string;
  startTime: string;
  endTime: string | null;
  fileSizeBytes: number | null;
  createdAt: string;
}
