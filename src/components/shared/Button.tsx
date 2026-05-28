import { twMerge } from "tailwind-merge";

type Variant = "primary" | "secondary" | "danger" | "delete" | "ghost";
type Size = "sm" | "md";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const variants: Record<Variant, string> = {
  primary:   "bg-accent text-black font-semibold hover:bg-accent-hover disabled:opacity-50",
  secondary: "bg-surface-3 text-secondary hover:text-white hover:bg-surface-4 disabled:opacity-40",
  danger:    "bg-red-950/50 border border-red-900/50 text-red-400 hover:bg-red-900/40 hover:text-red-300 disabled:opacity-40",
  delete:    "bg-red-600 text-white font-semibold hover:bg-red-500 disabled:opacity-50",
  ghost:     "text-faint hover:text-white disabled:opacity-40",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-sm",
  md: "h-10 px-4 text-sm",
};

export default function Button({
  variant = "secondary",
  size = "md",
  className,
  ...props
}: ButtonProps) {
  return (
    <button
      className={twMerge(
        "inline-flex items-center justify-center rounded transition-colors",
        sizes[size],
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}
