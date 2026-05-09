// Tracks the last time a vault heartbeat was acknowledged by Rust.
// The auto-lock countdown is based on this — it mirrors the Rust-side
// last_vault_activity timestamp that the auto-lock task reads.
let lastHeartbeatMs = Date.now();

export function recordHeartbeat() {
  lastHeartbeatMs = Date.now();
}

export function getLastHeartbeatMs() {
  return lastHeartbeatMs;
}
