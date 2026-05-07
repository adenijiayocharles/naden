import { listen, type UnlistenFn } from "@tauri-apps/api/event";

type OutputCallback = (data: Uint8Array) => void;

function base64ToBytes(encoded: string): Uint8Array {
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

class SessionBuffer {
  private readonly chunks = new Map<string, Uint8Array[]>();
  private readonly unlisteners = new Map<string, UnlistenFn>();
  private readonly subscribers = new Map<string, OutputCallback>();

  async attach(sessionId: string): Promise<void> {
    if (this.unlisteners.has(sessionId)) return;
    this.chunks.set(sessionId, []);

    const unlisten = await listen<string>(`terminal:output:${sessionId}`, ({ payload }) => {
      const bytes = base64ToBytes(payload);
      this.chunks.get(sessionId)?.push(bytes);
      this.subscribers.get(sessionId)?.(bytes);
    });

    this.unlisteners.set(sessionId, unlisten);
  }

  detach(sessionId: string): void {
    this.unlisteners.get(sessionId)?.();
    this.unlisteners.delete(sessionId);
    this.chunks.delete(sessionId);
    this.subscribers.delete(sessionId);
  }

  /**
   * Subscribe to live output AND atomically snapshot the existing buffer.
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
    this.subscribers.set(sessionId, cb);
    const chunks = [...(this.chunks.get(sessionId) ?? [])];
    const unsub = () => {
      if (this.subscribers.get(sessionId) === cb) this.subscribers.delete(sessionId);
    };
    return { chunks, unsub };
  }
}

export const sessionBuffer = new SessionBuffer();
