import type { ReactNode } from "react";

/** Clickable surface used for every button-like element in the design (works with mouse and Enter key). */
export function Action({
  children,
  onClick,
  className = "",
  label,
  disabled = false,
}: {
  children: ReactNode;
  onClick?: () => void;
  className?: string;
  label?: string;
  disabled?: boolean;
}) {
  return (
    <div role="button" aria-label={label} aria-disabled={disabled} tabIndex={disabled ? -1 : 0} onClick={() => !disabled && onClick?.()} onKeyDown={(event) => {
      if (!disabled && (event.key === "Enter" || event.key === " ")) {
        event.preventDefault();
        onClick?.();
      }
    }} className={`select-none transition-all active:scale-[0.98] ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"} ${className}`}>
      {children}
    </div>
  );
}
