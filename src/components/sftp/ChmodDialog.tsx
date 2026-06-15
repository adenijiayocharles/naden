import React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "../ui/dialog";
import { Checkbox } from "../ui/checkbox";
import { Button } from "../ui/button";

interface Props {
  target: { path: string; mode: number } | null;
  mode: number;
  disabled: boolean;
  onModeChange: (mode: number) => void;
  onApply: () => void;
  onCancel: () => void;
}

export default function ChmodDialog({ target, mode, disabled, onModeChange, onApply, onCancel }: Props) {
  if (!target) return null;

  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="w-80 max-w-sm gap-4 p-5">
        <DialogHeader>
          <DialogTitle className="text-title">Change Permissions</DialogTitle>
          <DialogDescription className="font-mono truncate">{target.path}</DialogDescription>
        </DialogHeader>

        {/* Permission checkboxes */}
        <div className="grid grid-cols-4 gap-y-2 text-xs">
          <div /> {/* spacer */}
          {["Owner", "Group", "Other"].map((label) => (
            <div key={label} className="text-center text-faint font-medium">{label}</div>
          ))}
          {(["r", "w", "x"] as const).map((bit, row) => {
            const shifts = [6, 3, 0]; // owner, group, other offsets
            return (
              <React.Fragment key={bit}>
                <div className="text-muted font-mono pr-2">{bit}</div>
                {shifts.map((shift) => {
                  const mask = 1 << (shift + (2 - row));
                  const checked = (mode & mask) !== 0;
                  return (
                    <div key={`${bit}-${shift}`} className="flex justify-center">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => onModeChange(checked ? mode & ~mask : mode | mask)}
                      />
                    </div>
                  );
                })}
              </React.Fragment>
            );
          })}
        </div>

        {/* Octal display */}
        <div className="text-xs text-center">
          <span className="text-faint">Octal: </span>
          <span className="font-mono text-white">
            {mode.toString(8).padStart(4, "0")}
          </span>
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={onCancel} className="px-3 py-1.5 text-xs h-auto">
            Cancel
          </Button>
          <Button onClick={onApply} disabled={disabled} className="px-3 py-1.5 text-xs h-auto">
            Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
