export type AuthMethod = "key" | "password" | "agent";

export interface Server {
  id: string;
  displayName: string;
  hostname: string;
  port: number;
  username: string;
  authMethod: AuthMethod;
  identityFilePath?: string;
  vaultCredentialId?: string;
  groupId?: string;
  notes?: string;
  isJumpHost: boolean;
  jumpHostId?: string;
  tags: Tag[];
  createdAt: string;
  updatedAt: string;
}

export interface Group {
  id: string;
  name: string;
  color?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Tag {
  id: string;
  name: string;
}

export interface CreateServerPayload {
  displayName: string;
  hostname: string;
  port?: number;
  username?: string;
  authMethod?: AuthMethod;
  identityFilePath?: string;
  groupId?: string;
  notes?: string;
  isJumpHost?: boolean;
  jumpHostId?: string;
  tagIds?: string[];
}

export type UpdateServerPayload = Partial<CreateServerPayload>;
