import type { FormData, FieldSetter } from "../serverFormTypes";
import { Field } from "../Field";
import { Input } from "../../ui/input";

export function ConnectionTab({
  form,
  set,
  errors,
  validateField,
}: {
  form: FormData;
  set: FieldSetter;
  errors: Record<string, string>;
  validateField: (field: keyof FormData, value: unknown) => void;
}) {
  return (
    <>
      <Field label="Display Name" error={errors.displayName} required>
        <Input
          id="displayName"
          value={form.displayName}
          onChange={set("displayName")}
          onBlur={(e) => validateField("displayName", e.target.value)}
          placeholder="Production Web Server"
          aria-invalid={!!errors.displayName}
          autoComplete="off"
        />
      </Field>

      <Field label="Hostname / IP" error={errors.hostname} required>
        <Input
          id="hostname"
          value={form.hostname}
          onChange={set("hostname")}
          onBlur={(e) => validateField("hostname", e.target.value)}
          placeholder="web.example.com"
          aria-invalid={!!errors.hostname}
          autoComplete="off"
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Port" error={errors.port} required>
          <Input
            id="port"
            type="number"
            min={1}
            max={65535}
            value={form.port}
            onChange={set("port")}
            onBlur={(e) => validateField("port", e.target.value)}
            aria-invalid={!!errors.port}
            autoComplete="off"
          />
        </Field>
        <Field label="Username">
          <Input
            id="username"
            value={form.username}
            onChange={set("username")}
            placeholder="ubuntu"
            autoComplete="off"
          />
        </Field>
      </div>
    </>
  );
}
