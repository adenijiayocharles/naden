export interface DiscoveredHost {
  ip: string;
  hostname?: string;
  port: number;
  source: "lan" | "knownHosts";
  identityFilePath?: string;
  username?: string;
  needsPassphrase?: boolean;
}

export interface ScanProgress {
  scanned: number;
  total: number;
}
