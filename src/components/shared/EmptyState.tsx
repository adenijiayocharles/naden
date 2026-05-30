import { twMerge } from "tailwind-merge";
import Button from "./Button";

interface EmptyStateProps {
  icon: React.ReactNode;
  heading: string;
  subline?: string;
  action?: { label: string; onClick: () => void };
  className?: string;
}

export default function EmptyState({ icon, heading, subline, action, className }: EmptyStateProps) {
  return (
    <div className={twMerge("flex flex-col items-center justify-center text-center px-6 h-full min-h-64", className)}>
      <div className="w-12 h-12 rounded-xl bg-surface-2 border border-stroke-subtle flex items-center justify-center text-faint mb-4">
        {icon}
      </div>
      <p className="text-muted font-medium mb-1">{heading}</p>
      {subline && <p className="text-muted text-sm font-medium mb-4">{subline}</p>}
      {action && (
        <Button variant="primary" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  );
}
