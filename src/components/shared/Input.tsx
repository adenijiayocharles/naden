import { forwardRef } from "react";
import { twMerge } from "tailwind-merge";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ error, className, ...props }, ref) => (
    <input
      ref={ref}
      className={twMerge(
        "w-full h-10 bg-surface-3 border rounded px-3 text-sm text-white placeholder-faint",
        "focus:outline-none focus:border-accent/30 transition-colors",
        error ? "border-red-500" : "border-white/5",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";

export default Input;
