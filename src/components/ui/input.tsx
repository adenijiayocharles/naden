import * as React from "react"

import { cn } from "@/lib/utils"

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        ref={ref}
        type={type}
        data-slot="input"
        className={cn(
          "flex h-10 w-full min-w-0 rounded border border-input bg-surface-3 px-3 text-sm text-white placeholder-faint transition-[border-color,box-shadow] duration-200 ease-premium outline-none",
          "focus-visible:ring-0",
          "disabled:cursor-not-allowed disabled:opacity-50",
          "aria-invalid:border-destructive",
          className
        )}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
