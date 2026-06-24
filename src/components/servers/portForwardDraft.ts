import type { ForwardType } from "../../types/portForward";
import type { DraftPortForward } from "./serverFormTypes";

export interface PortForwardDraftInput {
  forwardType: ForwardType;
  localPort: string;
  remoteHost: string;
  remotePort: string;
}

export function validatePortForwardDraft(input: PortForwardDraftInput): string | null {
  const lp = Number(input.localPort);
  if (!input.localPort || isNaN(lp) || lp < 1 || lp > 65535) return "Local port must be 1–65535";
  if (input.forwardType !== "dynamic") {
    if (!input.remoteHost.trim()) return "Remote host is required";
    const rp = Number(input.remotePort);
    if (!input.remotePort || isNaN(rp) || rp < 1 || rp > 65535) return "Remote port must be 1–65535";
  }
  return null;
}

export function upsertDraft(
  drafts: DraftPortForward[],
  editingId: string | null,
  payload: Omit<DraftPortForward, "id">,
  generateId: () => string = () => crypto.randomUUID(),
): DraftPortForward[] {
  if (editingId) {
    return drafts.map((d) => (d.id === editingId ? { ...payload, id: editingId } : d));
  }
  return [...drafts, { ...payload, id: generateId() }];
}

export function removeDraft(drafts: DraftPortForward[], id: string): DraftPortForward[] {
  return drafts.filter((d) => d.id !== id);
}
