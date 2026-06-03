export type ForwardType = "local" | "remote" | "dynamic";
export type TunnelStatus = "idle" | "connecting" | "active" | "error";

export interface PortForward {
  id: string;
  serverId: string;
  label: string;
  forwardType: ForwardType;
  localPort: number;
  remoteHost: string;
  remotePort: number;
  autoStart: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePortForwardPayload {
  serverId: string;
  label: string;
  forwardType: ForwardType;
  localPort: number;
  remoteHost: string;
  remotePort: number;
  autoStart: boolean;
}

export interface UpdatePortForwardPayload {
  label: string;
  forwardType: ForwardType;
  localPort: number;
  remoteHost: string;
  remotePort: number;
  autoStart: boolean;
}
