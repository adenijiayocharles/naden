import { create } from "zustand";
import { sessionBuffer } from "../lib/sessionBuffer";
import { sessionLogCommands } from "../lib/tauriCommands";

const FLUSH_THRESHOLD = 64 * 1024;

// Mutable pending buffer kept outside Zustand — avoiding a store update on every
// incoming terminal chunk eliminates cascading re-renders during active recording.
const pending = new Map<string, { chunks: Uint8Array[]; bytes: number }>();

// eslint-disable-next-line no-control-regex -- \x1b is the ESC byte that starts terminal escape sequences
const ANSI_RE = /\x1b(?:\[[0-9;?]*[a-zA-Z]|\][^\x07\x1b]*(?:\x07|\x1b\\)|[@-_])/g;

const decoder = new TextDecoder();
const encoder = new TextEncoder();

function stripAnsi(bytes: Uint8Array): Uint8Array {
  const text = decoder.decode(bytes);
  const clean = text
    .replace(ANSI_RE, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
  return encoder.encode(clean);
}

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

async function flushChunks(logId: string, chunks: Uint8Array[]): Promise<void> {
  if (chunks.length === 0) return;
  const combined = stripAnsi(concatChunks(chunks));
  await sessionLogCommands.appendSessionLog(logId, bytesToBase64(combined));
}

type RecordingEntry = {
  logId: string;
  unsub: () => void;
};

type SessionLoggingStore = {
  recordings: Record<string, RecordingEntry>;
  startRecording: (sessionId: string, serverId: string | undefined, serverName: string) => Promise<void>;
  stopRecording: (sessionId: string) => Promise<void>;
  isRecording: (sessionId: string) => boolean;
};

export const useSessionLoggingStore = create<SessionLoggingStore>((set, get) => ({
  recordings: {},

  isRecording: (sessionId) => sessionId in get().recordings,

  startRecording: async (sessionId, serverId, serverName) => {
    if (get().isRecording(sessionId)) return;

    const meta = await sessionLogCommands.createSessionLog(serverName, serverId);
    const logId = meta.id;

    pending.set(sessionId, { chunks: [], bytes: 0 });

    const { chunks: existingChunks, unsub } = sessionBuffer.subscribeAndReplay(
      sessionId,
      (data) => {
        const buf = pending.get(sessionId);
        if (!buf) return;
        buf.chunks.push(data);
        buf.bytes += data.length;
        if (buf.bytes >= FLUSH_THRESHOLD) {
          const toFlush = buf.chunks.splice(0);
          buf.bytes = 0;
          flushChunks(logId, toFlush).catch((e) => {
            // On failure restore the chunks so they are flushed on stop.
            const current = pending.get(sessionId);
            if (current) {
              current.chunks.unshift(...toFlush);
              current.bytes += toFlush.reduce((n, c) => n + c.length, 0);
            }
            console.error("[recording] flush failed:", e);
          });
        }
      },
    );

    set((s) => ({ recordings: { ...s.recordings, [sessionId]: { logId, unsub } } }));

    // Replay buffered history as the opening chunk.
    if (existingChunks.length > 0) {
      await flushChunks(logId, existingChunks).catch(console.error);
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

    const buf = pending.get(sessionId);
    pending.delete(sessionId);

    if (buf && buf.chunks.length > 0) {
      await flushChunks(rec.logId, buf.chunks).catch(console.error);
    }
    await sessionLogCommands.finishSessionLog(rec.logId).catch(console.error);
  },
}));
