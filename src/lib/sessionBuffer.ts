import { listen, type UnlistenFn } from "@tauri-apps/api/event";

type OutputCallback = (data: Uint8Array) => void;

function base64ToBytes(encoded: string): Uint8Array {
  const binary = atob(encoded);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

class SessionBuffer {
  private static readonly MAX_BYTES = 1 * 1024 * 1024; // 1 MB scrollback per session

  private readonly chunks = new Map<string, Uint8Array[]>();
  private readonly chunkBytes = new Map<string, number>();
  private readonly unlisteners = new Map<string, UnlistenFn>();
  private readonly subscribers = new Map<string, Set<OutputCallback>>();

  async attach(sessionId: string): Promise<void> {
    if (this.unlisteners.has(sessionId)) return;
    this.chunks.set(sessionId, []);
    this.chunkBytes.set(sessionId, 0);

    const unlisten = await listen<string>(`terminal:output:${sessionId}`, ({ payload }) => {
      const bytes = base64ToBytes(payload);
      const arr = this.chunks.get(sessionId);
      if (arr) {
        arr.push(bytes);
        let total = (this.chunkBytes.get(sessionId) ?? 0) + bytes.length;
        // Evict oldest chunks to stay within the cap (always keep the latest chunk)
        while (total > SessionBuffer.MAX_BYTES && arr.length > 1) {
          total -= arr.shift()!.length;
        }
        this.chunkBytes.set(sessionId, total);
      }
      this.subscribers.get(sessionId)?.forEach((cb) => cb(bytes));
    });

    this.unlisteners.set(sessionId, unlisten);
  }

  detach(sessionId: string): void {
    this.unlisteners.get(sessionId)?.();
    this.unlisteners.delete(sessionId);
    this.chunks.delete(sessionId);
    this.chunkBytes.delete(sessionId);
    this.subscribers.delete(sessionId);
  }

  /**
   * Subscribe to live output AND atomically snapshot the existing buffer.
   * Multiple subscribers per session are supported — each receives every chunk.
   * Setting the subscriber before snapshotting prevents any gap: events that
   * arrive after this call go straight to the callback; events already in the
   * buffer are returned as `chunks` for the caller to replay synchronously.
   * No double-delivery is possible because JavaScript is single-threaded —
   * the Tauri event queue cannot fire between two synchronous statements.
   */
  subscribeAndReplay(
    sessionId: string,
    cb: OutputCallback,
  ): { chunks: Uint8Array[]; unsub: () => void } {
    if (!this.subscribers.has(sessionId)) this.subscribers.set(sessionId, new Set());
    this.subscribers.get(sessionId)!.add(cb);
    const chunks = [...(this.chunks.get(sessionId) ?? [])];
    const unsub = () => {
      this.subscribers.get(sessionId)?.delete(cb);
    };
    return { chunks, unsub };
  }
}

export const sessionBuffer = new SessionBuffer();
