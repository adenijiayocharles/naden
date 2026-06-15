import { Button } from "../ui/button";

interface Props {
  error: string;
  onDismiss: () => void;
}

export default function ErrorBanner({ error, onDismiss }: Props) {
  return (
    <div className="px-4 py-2 bg-error-subtle border-b border-error-subtle text-xs text-error flex items-center justify-between shrink-0">
      {error}
      <Button variant="ghost" size="icon-xs" onClick={onDismiss} className="text-red-600 hover:text-red-400 ml-4">×</Button>
    </div>
  );
}
