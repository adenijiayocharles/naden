import type { Dispatch, SetStateAction } from "react";
import type { FormData, EnvVar, FieldSetter } from "../serverFormTypes";
import { Field } from "../Field";
import { Input } from "../../ui/input";
import { Button } from "../../ui/button";

export function SessionTab({
  form,
  set,
  envVars,
  setEnvVars,
  setDirty,
}: {
  form: FormData;
  set: FieldSetter;
  envVars: EnvVar[];
  setEnvVars: Dispatch<SetStateAction<EnvVar[]>>;
  setDirty: Dispatch<SetStateAction<boolean>>;
}) {
  return (
    <>
      <Field label="Initial Directory">
        <Input
          id="initialDir"
          value={form.initialDir}
          onChange={set("initialDir")}
          placeholder="/var/www/html"
          autoComplete="off"
        />
        <p className="mt-1 text-xs text-muted">
          Shell will <code className="text-accent-fg">cd</code> here immediately after connecting.
        </p>
      </Field>

      <div>
        <label className="block text-sm font-medium text-secondary mb-1">
          Environment Variables
        </label>
        <p className="text-xs text-muted mb-2">
          Exported to the shell immediately after connecting.
        </p>
        <div className="space-y-1.5">
          {envVars.map((v, i) => (
            <div key={i} className="flex gap-1.5 items-center">
              <Input
                value={v.key}
                onChange={(e) => { setEnvVars((prev) => prev.map((ev, j) => j === i ? { ...ev, key: e.target.value } : ev)); setDirty(true); }}
                placeholder="KEY"
                className="w-32 shrink-0 font-mono text-xs h-8"
                autoComplete="off"
                spellCheck={false}
              />
              <span className="text-dim text-xs shrink-0">=</span>
              <Input
                value={v.value}
                onChange={(e) => { setEnvVars((prev) => prev.map((ev, j) => j === i ? { ...ev, value: e.target.value } : ev)); setDirty(true); }}
                placeholder="value"
                className="flex-1 font-mono text-xs h-8"
                autoComplete="off"
                spellCheck={false}
              />
              <button
                type="button"
                onClick={() => { setEnvVars((prev) => prev.filter((_, j) => j !== i)); setDirty(true); }}
                className="text-dim hover:text-red-400 transition-colors shrink-0 text-sm leading-none px-1"
                title="Remove"
              >
                ×
              </button>
            </div>
          ))}
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => { setEnvVars((prev) => [...prev, { key: "", value: "" }]); setDirty(true); }}
            className="mt-1"
          >
            + Add variable
          </Button>
        </div>
      </div>
    </>
  );
}
