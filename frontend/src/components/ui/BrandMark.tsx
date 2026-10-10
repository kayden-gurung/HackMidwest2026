import { Icon } from "./Icon";

/** The Roam compass logo tile. */
export function BrandMark({ className = "" }: { className?: string }) {
  return (
    <div className={`grid size-8 place-items-center rounded-xl bg-ink text-white ${className}`}>
      <Icon name="compass" className="size-5" />
    </div>
  );
}
