export interface SshKey {
  id: string;
  name: string;
  keyPath: string;
  keyType: string;
  fingerprint: string;
  comment: string;
  isEncrypted: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface GenerateKeyPayload {
  name: string;
  keyType: "ed25519" | "rsa" | "ecdsa";
  outputPath: string;
  passphrase?: string;
}
