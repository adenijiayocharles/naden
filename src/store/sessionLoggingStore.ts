import { create } from "zustand";
import { sessionBuffer } from "../lib/sessionBuffer";
import { sessionLogCommands } from "../lib/tauriCommands";

const FLUSH_THRESHOLD = 64 * 1024; // flush every 64 KB

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 8192;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunk, bytes.length)));
  }
  return btoa(binary);
}

function concatChunks(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out;
}

type RecordingEntry = {
  logId: string;
  pending: Uint8Array[];
  pendingBytes: number;
  unsub: () => void;
};

type SessionLoggingStore = {
  recordings: Record<string, RecordingEntry>;
  startRecording: (
    sessionId: string,
    serverId: string | undefined,
    serverName: string,
  ) => Promise<void>;
  stopRecording: (sessionId: string) => Promise<void>;
  isRecording: (sessionId: string) => boolean;
};

async function flushPending(logId: string, chunks: Uint8Array[]): Promise<void> {
  if (chunks.length === 0) return;
  const combined = concatChunks(chunks);
  await sessionLogCommands.appendSessionLog(logId, bytesToBase64(combined));
}

export const useSessionLoggingStore = create<SessionLoggingStore>((set, get) => ({
  recordings: {},

  isRecording: (sessionId) => sessionId in get().recordings,

  startRecording: async (sessionId, serverId, serverName) => {
    if (get().isRecording(sessionId)) return;

    const meta = await sessionLogCommands.createSessionLog(serverName, serverId);
    const logId = meta.id;

    // Subscribe and capture the existing buffer snapshot for replay.
    const { chunks: existingChunks, unsub } = sessionBuffer.subscribeAndReplay(
      sessionId,
      (data) => {
        set((s) => {
          const rec = s.recordings[sessionId];
          if (!rec) return s;
          const newPending = [...rec.pending, data];
          const newBytes = rec.pendingBytes + data.length;
          if (newBytes >= FLUSH_THRESHOLD) {
            // Fire-and-forget flush; don't update pending until after flush settles
            // to avoid a race with the next chunk. Instead flush synchronously resets.
            void flushPending(logId, newPending).catch(() => {});
            return {
              recordings: {
                ...s.recordings,
                [sessionId]: { ...rec, pending: [], pendingBytes: 0 },
              },
            };
          }
          return {
            recordings: {
              ...s.recordings,
              [sessionId]: { ...rec, pending: newPending, pendingBytes: newBytes },
            },
          };
        });
      },
    );

    const entry: RecordingEntry = { logId, pending: [], pendingBytes: 0, unsub };
    set((s) => ({ recordings: { ...s.recordings, [sessionId]: entry } }));

    // Flush the replayed history as the first chunk if any exists.
    if (existingChunks.length > 0) {
      const combined = concatChunks(existingChunks);
      await flushPending(logId, [combined]).catch(() => {});
    }
  },

  stopRecording: async (sessionId) => {
    const rec = get().recordings[sessionId];
    if (!rec) return;

    rec.unsub();
    set((s) => {
      const next = { ...s.recordings };
      delete next[sessionId];
      return { recordings: next };
    });

    // Flush remaining bytes then close.
    await flushPending(rec.logId, rec.pending).catch(() => {});
    await sessionLogCommands.finishSessionLog(rec.logId).catch(() => {});
  },
}));
