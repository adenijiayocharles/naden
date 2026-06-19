import type { ReactNode } from "react";

export function Field({
  label,
  children,
  error,
  required,
}: {
  label: string;
  children: ReactNode;
  error?: string;
  required?: boolean;
}) {
  return (
    <div>
      {label && (
        <label className="block text-sm font-medium text-secondary mb-1">
          {label}
          {required && <span className="text-error ml-0.5">*</span>}
        </label>
      )}
      {children}
      {error && <p className="text-xs text-error mt-1">{error}</p>}
    </div>
  );
}
