import type { Dispatch, SetStateAction } from "react";
import type { Server } from "../../../types/server";
import type { FormData } from "../serverFormTypes";
import { Field } from "../Field";
import { Checkbox } from "../../ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../ui/select";

export function NetworkTab({
  form,
  setForm,
  setDirty,
  servers,
  editingServerId,
}: {
  form: FormData;
  setForm: Dispatch<SetStateAction<FormData>>;
  setDirty: Dispatch<SetStateAction<boolean>>;
  servers: Server[];
  editingServerId: string | null;
}) {
  return (
    <>
      <Field label="">
        <label className="flex items-center gap-2 cursor-pointer">
          <Checkbox
            checked={form.isJumpHost}
            onCheckedChange={(checked) => {
              setForm((f) => ({ ...f, isJumpHost: checked === true }));
              setDirty(true);
            }}
          />
          <span className="text-sm text-secondary">This server is a jump host / bastion</span>
        </label>
      </Field>

      {!form.isJumpHost && (
        <Field label="Jump Through (optional)">
          <Select
            value={form.jumpHostId || "__none__"}
            onValueChange={(value) => {
              setForm((f) => ({ ...f, jumpHostId: value && value !== "__none__" ? value : "" }));
              setDirty(true);
            }}
          >
            <SelectTrigger id="jumpHostId" className="w-full h-10">
              <SelectValue placeholder="Direct connection">
                {(val) => (!val || val === "__none__") ? "Direct connection" : (servers.find((s) => s.id === val)?.displayName ?? String(val))}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Direct connection</SelectItem>
              {servers
                .filter((s) => s.isJumpHost && s.id !== editingServerId)
                .map((s) => (
                  <SelectItem key={s.id} value={s.id} label={s.displayName}>{s.displayName}</SelectItem>
                ))}
            </SelectContent>
          </Select>

          {form.jumpHostId && (() => {
            const chain: string[] = ["Your machine"];
            let id: string | undefined = form.jumpHostId;
            const visited = new Set<string>();
            while (id && !visited.has(id)) {
              visited.add(id);
              const hop = servers.find((s) => s.id === id);
              if (!hop) break;
              chain.push(hop.displayName);
              id = hop.jumpHostId ?? undefined;
            }
            const target = form.displayName.trim() || "this server";
            chain.push(target);
            return (
              <div className="mt-2 flex items-center flex-wrap gap-1 text-meta text-faint">
                {chain.map((label, i) => (
                  <span key={i} className="flex items-center gap-1">
                    <span className={i === 0 || i === chain.length - 1 ? "text-muted" : "text-secondary font-medium"}>
                      {label}
                    </span>
                    {i < chain.length - 1 && <span className="text-dim">→</span>}
                  </span>
                ))}
              </div>
            );
          })()}
        </Field>
      )}
    </>
  );
}
