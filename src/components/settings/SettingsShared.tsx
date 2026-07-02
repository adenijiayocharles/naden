import { Input } from "../ui/input";

export function PasswordInput({
  value,
  onChange,
  placeholder,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  autoFocus?: boolean;
}) {
  return (
    <Input
      autoFocus={autoFocus}
      type="password"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
    />
  );
}

export function SectionHeader({ title, description }: { title: string; description?: string }) {
  return (
    <div className="mb-6 pb-4 border-b border-stroke-subtle">
      <h2 className="text-base font-semibold text-white">{title}</h2>
      {description && <p className="text-sm text-muted mt-0.5">{description}</p>}
    </div>
  );
}

export function Row({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-stroke-subtle last:border-b-0">
      {children}
    </div>
  );
}

export function RowLabel({ title, description }: { title: string; description?: string }) {
  return (
    <div className="min-w-0 mr-6">
      <p className="text-sm text-white font-medium">{title}</p>
      {description && <p className="text-meta text-muted mt-0.5">{description}</p>}
    </div>
  );
}
