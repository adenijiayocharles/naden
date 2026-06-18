import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      autoCapitalize="off"
      autoCorrect="off"
      spellCheck={false}
      className={cn(
        "flex w-full rounded border border-input bg-surface-3 px-3 py-2 text-sm text-white placeholder-faint transition-[border-color,box-shadow] duration-200 ease-premium outline-none",
        "focus-visible:border-ring/30 focus-visible:ring-0",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "aria-invalid:border-destructive",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
