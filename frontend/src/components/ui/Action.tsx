import type { ReactNode } from "react";

/** Clickable surface used for every button-like element in the design (works with mouse and Enter key). */
export function Action({
  children,
  onClick,
  className = "",
  label,
}: {
  children: ReactNode;
  onClick?: () => void;
  className?: string;
  label?: string;
}) {
  return (
    <div role="button" aria-label={label} tabIndex={0} onClick={onClick} onKeyDown={(event) => event.key === "Enter" && onClick?.()} className={`cursor-pointer select-none transition-all active:scale-[0.98] ${className}`}>
      {children}
    </div>
  );
}
