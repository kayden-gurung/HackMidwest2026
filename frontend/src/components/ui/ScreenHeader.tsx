import type { ReactNode } from "react";
import { BrandMark } from "./BrandMark";

/** Top bar for full-page screens (New journey, My trips, Explore, Settings): title, subtitle and an optional action on the right. */
export function ScreenHeader({ title, subtitle, action }: { title: string; subtitle: string; action?: ReactNode }) {
  return (
    <header className="flex h-[72px] shrink-0 items-center justify-between border-b border-line bg-canvas/90 px-5 backdrop-blur md:px-8">
      <div className="flex items-center gap-3">
        {/* The sidebar (with the logo) is hidden below lg, so show the logo here instead. */}
        <BrandMark className="lg:hidden" />
        <div>
          <div className="font-display text-xl font-semibold">{title}</div>
          <div className="hidden text-xs text-muted sm:block">{subtitle}</div>
        </div>
      </div>
      {action}
    </header>
  );
}
