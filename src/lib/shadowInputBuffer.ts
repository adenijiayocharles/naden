// Reconstructs the "current command line" for a terminal session by replaying
// the raw keystroke bytes xterm hands to onData. The PTY is the only source of
// truth for what's actually on the line — this is a best-effort shadow used
// purely to drive local suggestions, so any input we can't interpret cleanly
// (arrow keys, tab-completion, ctrl sequences, pasted escape codes) clears the
// shadow rather than guessing, to avoid silently desyncing from the real line.

export type ShadowBufferListener = (line: string) => void;

const PRINTABLE_PATTERN = /^[\x20-\x7e]$/;
const ESCAPE_SEQUENCE_PATTERN = /^\x1b(\[[0-9;?]*[a-zA-Z~]|O[A-Za-z]|.)/;

class ShadowInputBuffer {
  private readonly lines = new Map<string, string>();
  private readonly listeners = new Map<string, ShadowBufferListener>();

  attach(sessionId: string): void {
    this.lines.set(sessionId, "");
  }

  detach(sessionId: string): void {
    this.lines.delete(sessionId);
    this.listeners.delete(sessionId);
  }

  getLine(sessionId: string): string {
    return this.lines.get(sessionId) ?? "";
  }

  /** Notified with the shadow line on every change, e.g. to refresh a suggestion overlay. */
  subscribe(sessionId: string, cb: ShadowBufferListener): () => void {
    this.listeners.set(sessionId, cb);
    return () => {
      if (this.listeners.get(sessionId) === cb) this.listeners.delete(sessionId);
    };
  }

  /**
   * Feeds a chunk of raw onData bytes into the shadow line for `sessionId`.
   * Returns the trimmed command when Enter finalizes a non-empty line, or null
   * if the chunk didn't complete one (the common case — most chunks are single
   * keystrokes).
   */
  feed(sessionId: string, data: string): string | null {
    let line = this.lines.get(sessionId) ?? "";
    let completed: string | null = null;
    let i = 0;

    while (i < data.length) {
      const escMatch = ESCAPE_SEQUENCE_PATTERN.exec(data.slice(i));
      if (escMatch) {
        line = "";
        i += escMatch[0].length;
        continue;
      }

      const ch = data[i];
      if (ch === "\r" || ch === "\n") {
        const trimmed = line.trim();
        if (trimmed) completed = trimmed;
        line = "";
      } else if (ch === "\x7f" || ch === "\x08") {
        line = line.slice(0, -1);
      } else if (ch === "\x03" || ch === "\x15") {
        line = "";
      } else if (PRINTABLE_PATTERN.test(ch)) {
        line += ch;
      } else {
        line = "";
      }
      i += 1;
    }

    this.lines.set(sessionId, line);
    this.listeners.get(sessionId)?.(line);
    return completed;
  }
}

export const shadowInputBuffer = new ShadowInputBuffer();
