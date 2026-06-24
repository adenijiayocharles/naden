import type { Dispatch, SetStateAction, RefObject, KeyboardEvent } from "react";
import type { Group, Tag } from "../../../types/server";
import type { FormData } from "../serverFormTypes";
import { Field } from "../Field";
import { Input } from "../../ui/input";
import { Button } from "../../ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../ui/select";

export function OrganizeTab({
  form,
  setForm,
  setDirty,
  errors,
  tags,
  setTags,
  tagInput,
  setTagInput,
  tagDropdownOpen,
  setTagDropdownOpen,
  tagSuggestions,
  tagInputRef,
  tagDropdownRef,
  handleTagKeyDown,
  groups,
  newGroupName,
  setNewGroupName,
  showNewGroup,
  setShowNewGroup,
  handleCreateGroup,
}: {
  form: FormData;
  setForm: Dispatch<SetStateAction<FormData>>;
  setDirty: Dispatch<SetStateAction<boolean>>;
  errors: Record<string, string>;
  tags: Tag[];
  setTags: Dispatch<SetStateAction<Tag[]>>;
  tagInput: string;
  setTagInput: Dispatch<SetStateAction<string>>;
  tagDropdownOpen: boolean;
  setTagDropdownOpen: Dispatch<SetStateAction<boolean>>;
  tagSuggestions: Tag[];
  tagInputRef: RefObject<HTMLInputElement>;
  tagDropdownRef: RefObject<HTMLDivElement>;
  handleTagKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
  groups: Group[];
  newGroupName: string;
  setNewGroupName: Dispatch<SetStateAction<string>>;
  showNewGroup: boolean;
  setShowNewGroup: Dispatch<SetStateAction<boolean>>;
  handleCreateGroup: () => Promise<void>;
}) {
  return (
    <>
      <Field label="Group" error={errors.group}>
        {!showNewGroup ? (
          <Select
            value={form.groupId || "__none__"}
            onValueChange={(value) => {
              if (value === "__create_new__") {
                setShowNewGroup(true);
                setForm((f) => ({ ...f, groupId: "" }));
              } else {
                setShowNewGroup(false);
                setForm((f) => ({ ...f, groupId: value && value !== "__none__" ? value : "" }));
              }
              setDirty(true);
            }}
          >
            <SelectTrigger id="groupId" className="w-full h-10">
              <SelectValue placeholder="No Group">
                {(val) => (!val || val === "__none__") ? "No Group" : (groups.find((g) => g.id === val)?.name ?? String(val))}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">No Group</SelectItem>
              {groups.map((g) => (
                <SelectItem key={g.id} value={g.id} label={g.name}>{g.name}</SelectItem>
              ))}
              <SelectItem value="__create_new__">＋ Create new group…</SelectItem>
            </SelectContent>
          </Select>
        ) : (
          <div className="flex gap-2">
            <Input
              autoFocus
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void handleCreateGroup(); } }}
              placeholder="Group name"
              className="flex-1"
              autoComplete="off"
            />
            <Button
              type="button"
              onClick={() => { void handleCreateGroup(); }}
              className="px-3 shrink-0"
            >
              Add
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => { setShowNewGroup(false); setNewGroupName(""); }}
              className="px-3 shrink-0"
            >
              Cancel
            </Button>
          </div>
        )}
      </Field>

      <Field label="Tags" error={errors.tag}>
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-2">
            {tags.map((t) => (
              <span key={t.id} className="flex items-center gap-1 bg-surface-3 border border-stroke text-muted text-xs px-2 py-1 rounded-full">
                #{t.name}
                <button
                  type="button"
                  onClick={() => { setTags((ts) => ts.filter((x) => x.id !== t.id)); setDirty(true); }}
                  className="text-muted hover:text-white leading-none"
                  aria-label={`Remove tag ${t.name}`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="relative" ref={tagDropdownRef}>
          <Input
            ref={tagInputRef}
            value={tagInput}
            onChange={(e) => { setTagInput(e.target.value); setTagDropdownOpen(true); }}
            onFocus={() => setTagDropdownOpen(true)}
            onBlur={() => setTimeout(() => setTagDropdownOpen(false), 150)}
            onKeyDown={handleTagKeyDown}
            placeholder="Type a tag and press Enter"
            autoComplete="off"
          />
          {tagDropdownOpen && tagSuggestions.length > 0 && (
            <div className="absolute z-20 top-full mt-1 w-full bg-surface-2 border border-stroke rounded-lg shadow-overlay max-h-40 overflow-y-auto">
              {tagSuggestions.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); setTags((ts) => [...ts, t]); setTagInput(""); setTagDropdownOpen(false); setDirty(true); }}
                  className="w-full text-left px-3 py-2 text-sm text-secondary hover:bg-surface-4 hover:text-white transition-colors"
                >
                  #{t.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </Field>
    </>
  );
}
