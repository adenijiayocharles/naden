import type { FormData, FieldSetter } from "../serverFormTypes";
import { Field } from "../Field";

export function HooksTab({
  form,
  set,
}: {
  form: FormData;
  set: FieldSetter;
}) {
  return (
    <>
      <Field label="Pre-connect Hook">
        <textarea
          value={form.preConnectHook}
          onChange={set("preConnectHook")}
          placeholder={"#!/bin/sh\n# Runs locally before connecting\naws sso login --profile prod"}
          rows={4}
          spellCheck={false}
          className="w-full rounded-md border border-stroke bg-surface-2 px-3 py-2 text-xs font-mono text-white placeholder-[#555] focus:outline-none focus:ring-1 focus:ring-accent resize-none"
        />
        <p className="mt-1 text-xs text-muted">
          Runs locally before the SSH connection. Non-zero exit cancels the connection.
          Env: <code className="text-accent-fg">NADEN_HOST</code>, <code className="text-accent-fg">NADEN_PORT</code>, <code className="text-accent-fg">NADEN_USER</code>.
        </p>
      </Field>

      <Field label="Post-disconnect Hook">
        <textarea
          value={form.postDisconnectHook}
          onChange={set("postDisconnectHook")}
          placeholder={"#!/bin/sh\n# Runs locally after session ends\nnotify-send \"Disconnected from $NADEN_HOST\""}
          rows={4}
          spellCheck={false}
          className="w-full rounded-md border border-stroke bg-surface-2 px-3 py-2 text-xs font-mono text-white placeholder-[#555] focus:outline-none focus:ring-1 focus:ring-accent resize-none"
        />
        <p className="mt-1 text-xs text-muted">
          Runs locally after disconnect. Spawned in the background — does not block cleanup.
        </p>
      </Field>
    </>
  );
}
