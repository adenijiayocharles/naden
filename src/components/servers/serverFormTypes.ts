import type { ChangeEvent } from "react";
import type { AuthMethod } from "../../types/server";
import type { TerminalThemeId } from "../../lib/terminalSettings";

export interface EnvVar { key: string; value: string; }

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
