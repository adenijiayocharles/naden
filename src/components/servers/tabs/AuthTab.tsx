import { useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { FolderOpen } from "lucide-react";
import type { SshKey } from "../../../types/sshKey";
import type { FormData, FieldSetter, PickKeyResult } from "../serverFormTypes";
import { Field } from "../Field";
import { Input } from "../../ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../ui/select";

type KeySource = "vault" | "browse";

export function AuthTab({
  form,
  set,
  setForm,
  setDirty,
  password,
  setPassword,
  passphrase,
  setPassphrase,
  isEdit,
  existingCredentialId,
  vaultAvailable,
  managedKeys,
  pickAndAddIdentityKey,
}: {
  form: FormData;
  set: FieldSetter;
  setForm: Dispatch<SetStateAction<FormData>>;
  setDirty: Dispatch<SetStateAction<boolean>>;
  password: string;
  setPassword: Dispatch<SetStateAction<string>>;
  passphrase: string;
  setPassphrase: Dispatch<SetStateAction<string>>;
  isEdit: boolean;
  existingCredentialId: string | undefined;
  vaultAvailable: boolean;
  managedKeys: SshKey[];
  pickAndAddIdentityKey: () => Promise<PickKeyResult | null>;
}) {
  // Defaults to whichever source already matches the current identity file
  // path, falling back to the vault when keys are available. Recomputed each
  // time the Auth tab mounts (it's conditionally rendered, so this only runs
  // when the user actually switches to it).
  const [keySource, setKeySource] = useState<KeySource>(() =>
    form.identityFilePath && !managedKeys.some((k) => k.keyPath === form.identityFilePath)
      ? "browse"
      : managedKeys.length > 0
        ? "vault"
        : "browse",
  );
  const [browseNotice, setBrowseNotice] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const handleBrowse = async () => {
    const result = await pickAndAddIdentityKey();
    if (!result) return;
    setForm((f) => ({ ...f, identityFilePath: result.path }));
    setDirty(true);
    if (result.error) {
      setBrowseNotice({ type: "error", message: `Not added to vault: ${result.error}` });
    } else {
      setBrowseNotice({ type: "success", message: "Key added to vault." });
      setKeySource("vault");
    }
  };
  return (
    <>
      <Field label="Auth Method">
        <div className="flex h-10 rounded border border-stroke overflow-hidden">
          {(["key", "password", "agent"] as const).map((method) => (
            <button
              key={method}
              type="button"
              onClick={() => { setForm((f) => ({ ...f, authMethod: method })); setDirty(true); }}
              className={`flex-1 h-full text-sm transition-colors ${
                form.authMethod === method
                  ? "bg-accent text-black font-semibold"
                  : "bg-surface-3 text-muted hover:text-white hover:bg-surface-4"
              }`}
            >
              {method === "key" ? "SSH Key" : method === "password" ? "Password" : "SSH Agent"}
            </button>
          ))}
        </div>
        {form.authMethod === "agent" && (
          <p className="mt-1.5 text-xs text-muted">
            Uses your running ssh-agent. Run <code className="text-accent-fg">ssh-add</code> to load keys into the agent.
          </p>
        )}
      </Field>

      {form.authMethod === "password" && (
        <Field label={isEdit && existingCredentialId ? "New Password (leave blank to keep existing)" : "Password"}>
          {!vaultAvailable ? (
            <p className="text-xs text-yellow-500">Unlock the vault to store a password.</p>
          ) : (
            <Input
              type="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setDirty(true); }}
              placeholder={isEdit && existingCredentialId ? "Enter new password to change…" : "SSH password"}
              autoComplete="new-password"
            />
          )}
        </Field>
      )}

      {form.authMethod === "key" && (
        <Field label="Identity File">
          <div className="flex h-9 rounded border border-stroke overflow-hidden mb-2 text-sm">
            {(["vault", "browse"] as const).map((source) => (
              <button
                key={source}
                type="button"
                onClick={() => { setKeySource(source); setBrowseNotice(null); }}
                className={`flex-1 h-full transition-colors ${
                  keySource === source
                    ? "bg-accent text-black font-semibold"
                    : "bg-surface-3 text-muted hover:text-white hover:bg-surface-4"
                }`}
              >
                {source === "vault" ? "Select from Vault" : "Add from ~/.ssh"}
              </button>
            ))}
          </div>

          {keySource === "vault" ? (
            managedKeys.length > 0 ? (
              <Select
                value={managedKeys.some((k) => k.keyPath === form.identityFilePath) ? form.identityFilePath : "__none__"}
                onValueChange={(value) => {
                  if (value && value !== "__none__") {
                    setForm((f) => ({ ...f, identityFilePath: value }));
                    setDirty(true);
                  }
                }}
              >
                <SelectTrigger className="w-full h-10">
                  <SelectValue placeholder="— pick a managed key —">
                    {(val) => {
                      if (!val || val === "__none__") return "— pick a managed key —";
                      const k = managedKeys.find((mk) => mk.keyPath === val);
                      return k ? `${k.name} (${k.keyType.toUpperCase()})` : String(val);
                    }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— pick a managed key —</SelectItem>
                  {managedKeys.map((k) => (
                    <SelectItem key={k.id} value={k.keyPath} label={`${k.name} (${k.keyType.toUpperCase()})`}>
                      {k.name} ({k.keyType.toUpperCase()})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <p className="text-xs text-muted">
                No keys in the vault yet — switch to "Add from ~/.ssh" to import one.
              </p>
            )
          ) : (
            <div className="flex flex-col gap-1.5">
              <div className="relative">
                <Input
                  id="identityFilePath"
                  value={form.identityFilePath}
                  onChange={set("identityFilePath")}
                  placeholder="~/.ssh/id_ed25519"
                  className="pr-9"
                  autoComplete="off"
                />
                <button
                  type="button"
                  onClick={() => { void handleBrowse(); }}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1.5 text-muted hover:text-white rounded transition-colors"
                  aria-label="Browse for identity file"
                >
                  <FolderOpen className="size-4" />
                </button>
              </div>
              {browseNotice && (
                <p className={`text-xs ${browseNotice.type === "error" ? "text-error" : "text-success"}`}>
                  {browseNotice.message}
                </p>
              )}
            </div>
          )}
        </Field>
      )}

      {form.authMethod === "key" && (
        <Field label={isEdit && existingCredentialId ? "New Passphrase (leave blank to keep existing)" : "Passphrase (optional)"}>
          {!vaultAvailable ? (
            <p className="text-xs text-yellow-500">Unlock the vault to store a passphrase.</p>
          ) : (
            <Input
              type="password"
              value={passphrase}
              onChange={(e) => { setPassphrase(e.target.value); setDirty(true); }}
              placeholder={isEdit && existingCredentialId ? "Enter new passphrase to change…" : "Leave empty if the key has no passphrase"}
              autoComplete="new-password"
            />
          )}
        </Field>
      )}
    </>
  );
}
