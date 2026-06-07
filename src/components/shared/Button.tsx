import { twMerge } from "tailwind-merge";

type Variant = "primary" | "secondary" | "danger" | "delete" | "ghost";
type Size = "sm" | "md";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const variants: Record<Variant, string> = {
  primary:   "bg-accent text-black font-semibold shadow-card hover:bg-accent-hover hover:shadow-card-hover hover:-translate-y-px disabled:opacity-50 disabled:translate-y-0 disabled:shadow-none",
  secondary: "bg-surface-3 text-secondary shadow-card hover:text-white hover:bg-surface-4 hover:shadow-card-hover hover:-translate-y-px disabled:opacity-40 disabled:translate-y-0 disabled:shadow-none",
  danger:    "bg-red-950/50 border border-red-900/50 text-red-400 shadow-card hover:bg-red-900/40 hover:text-red-300 hover:shadow-card-hover hover:-translate-y-px disabled:opacity-40 disabled:translate-y-0 disabled:shadow-none",
  delete:    "bg-red-600 text-white font-semibold shadow-card hover:bg-red-500 hover:shadow-card-hover hover:-translate-y-px disabled:opacity-50 disabled:translate-y-0 disabled:shadow-none",
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
        "inline-flex items-center justify-center rounded transition-[background-color,color,box-shadow,transform] duration-200 ease-premium",
        sizes[size],
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}
