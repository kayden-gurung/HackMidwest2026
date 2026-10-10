import { Action } from "./Action";

/** Shared loading / empty / error placeholders so every feature reports async state the same way. */

export function LoadingState({ label = "Loading…", className = "" }: { label?: string; className?: string }) {
  return (
    <div role="status" className={`animate-pulse px-2 py-3 text-xs text-muted ${className}`}>
      {label}
    </div>
  );
}

export function EmptyState({ message, className = "" }: { message: string; className?: string }) {
  return <div className={`px-2 py-3 text-xs text-muted ${className}`}>{message}</div>;
}

export function ErrorState({
  message = "Something went wrong.",
  onRetry,
  className = "",
}: {
  message?: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div role="alert" className={`flex items-center justify-between gap-3 px-2 py-3 text-xs text-coral ${className}`}>
      <span>{message}</span>
      {onRetry && (
        <Action onClick={onRetry} className="font-bold text-sea">
          Retry
        </Action>
      )}
    </div>
  );
}
