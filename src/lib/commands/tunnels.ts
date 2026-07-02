import { invoke } from "@tauri-apps/api/core";
import type {
  PortForward,
  CreatePortForwardPayload,
  UpdatePortForwardPayload,
} from "../../types/portForward";

export const tunnelCommands = {
  listPortForwards: (serverId?: string) =>
    invoke<PortForward[]>("list_port_forwards", { serverId: serverId ?? null }),

  createPortForward: (payload: CreatePortForwardPayload) =>
    invoke<PortForward>("create_port_forward", { payload }),

  updatePortForward: (id: string, payload: UpdatePortForwardPayload) =>
    invoke<PortForward>("update_port_forward", { id, payload }),

  deletePortForward: (id: string) =>
    invoke<void>("delete_port_forward", { id }),

  startTunnel: (forwardId: string) =>
    invoke<void>("start_tunnel", { forwardId }),

  stopTunnel: (forwardId: string) =>
    invoke<void>("stop_tunnel", { forwardId }),

  listActiveTunnelIds: () =>
    invoke<string[]>("list_active_tunnel_ids"),
};
