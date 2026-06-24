import type { ChangeEvent } from "react";
import type { AuthMethod } from "../../types/server";
import type { TerminalThemeId } from "../../lib/terminalSettings";
import type { ForwardType } from "../../types/portForward";

export interface EnvVar { key: string; value: string; }

// A port forward queued in the Add Server modal before the server (and its
// real serverId) exists. Flushed into real PortForward rows once the server
// is created.
export interface DraftPortForward {
  id: string;
  label: string;
  forwardType: ForwardType;
  localPort: number;
  remoteHost: string;
  remotePort: number;
  autoStart: boolean;
}

export interface FormData {
  displayName: string;
  hostname: string;
  port: number;
  username: string;
  authMethod: AuthMethod;
  identityFilePath: string;
  groupId: string;
  isJumpHost: boolean;
  jumpHostId: string;
  initialDir: string;
  preConnectHook: string;
  postDisconnectHook: string;
  terminalTheme: TerminalThemeId | "";
}

export type FieldSetter = (field: keyof FormData) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => void;
