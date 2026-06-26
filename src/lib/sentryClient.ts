import * as Sentry from "@sentry/react";

// Gate checked in beforeSend — starts enabled (opt-out default).
let enabled = true;

export function initSentry(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  if (!dsn) return;

  Sentry.init({
    dsn,
    sendDefaultPii: false,
    // No performance tracing — error capture only.
    tracesSampleRate: 0,
    beforeSend(event) {
      if (!enabled) return null;
      // Strip fields that could identify a machine or user regardless of
      // how Sentry's own integrations populate them.
      event.server_name = undefined;
      event.request = undefined;
      event.user = undefined;
      return event;
    },
  });
}

export function setSentryEnabled(value: boolean): void {
  enabled = value;
}

export function isSentryConfigured(): boolean {
  return !!(import.meta.env.VITE_SENTRY_DSN as string | undefined);
}
