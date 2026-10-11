import { useState } from "react";
import { Icon } from "../../../components/ui";
import { formatUsd } from "../../../lib/format";
import { safeWebUrl } from "../../itinerary/lib/itinerary";
import type { DestinationRecommendation } from "../types";

function DestinationCover({ imageUrl, imageAlt, destination }: { imageUrl?: string; imageAlt?: string; destination: string }) {
  const [failed, setFailed] = useState(false);
  const url = safeWebUrl(imageUrl);
  return (
    <div className="postcard-cover">
      {url && !failed ? (
        <img src={url} alt={imageAlt || destination} className="size-full object-cover" loading="lazy" onError={() => setFailed(true)} />
      ) : (
        <div className="postcard-art" aria-hidden="true">
          <div className="postcard-orbit postcard-orbit-one" />
          <div className="postcard-orbit postcard-orbit-two" />
          <div className="postcard-orbit postcard-orbit-three" />
          <Icon name="compass" className="relative size-16 text-sea/70" />
          <span className="absolute bottom-5 left-6 text-[10px] font-semibold uppercase tracking-[0.25em] text-sea">A new perspective</span>
        </div>
      )}
    </div>
  );
}

export function DestinationCard({ recommendation }: { recommendation: DestinationRecommendation }) {
  const { estimatedTotalUsd, budgetUsd, unknownCosts = 0 } = recommendation;
  const remaining = budgetUsd != null && estimatedTotalUsd != null && unknownCosts === 0 ? budgetUsd - estimatedTotalUsd : null;
  const stats = [
    { label: unknownCosts > 0 ? "Known estimates" : "Estimated total", value: estimatedTotalUsd == null ? "To be estimated" : formatUsd(estimatedTotalUsd) },
    { label: remaining == null ? "Trip budget" : remaining < 0 ? "Over budget" : "Budget remaining", value: remaining == null ? budgetUsd == null ? "Flexible" : formatUsd(budgetUsd) : formatUsd(Math.abs(remaining)), over: remaining != null && remaining < 0 },
    { label: recommendation.pace ? "Your rhythm" : "Trip length", value: recommendation.pace || (recommendation.durationDays ? `${recommendation.durationDays} day${recommendation.durationDays === 1 ? "" : "s"}` : "Flexible") },
  ];

  return (
    <section className="mt-5" aria-label={`Trip recommendation: ${recommendation.destination}`}>
      <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-sea">Your next chapter</div>
      <h2 className="mt-2 text-xl font-semibold leading-snug tracking-tight md:text-2xl">{recommendation.headline || "Your next chapter, taking shape."}</h2>
      {(recommendation.dateLabel || budgetUsd != null) && (
        <div className="mb-4 mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
          {recommendation.dateLabel && <span className="inline-flex items-center gap-1.5"><Icon name="calendar" className="size-3.5" />{recommendation.dateLabel}</span>}
          {budgetUsd != null && <span className="inline-flex items-center gap-1.5"><Icon name="wallet" className="size-3.5" />{formatUsd(budgetUsd)} total budget</span>}
        </div>
      )}
      <article className="mt-4 overflow-hidden rounded-[20px] border border-line bg-surface shadow-[0_8px_32px_rgba(18,38,38,0.035)]">
        <DestinationCover key={recommendation.imageUrl} imageUrl={recommendation.imageUrl} imageAlt={recommendation.imageAlt} destination={recommendation.destination} />
        <div className="p-5 md:px-6">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <h3 className="font-display text-[28px] font-semibold leading-tight tracking-tight md:text-[32px]">{recommendation.destination}</h3>
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-mint px-2.5 py-1 text-[10px] font-semibold text-sea"><Icon name="sparkles" className="size-3" />Recommended for you</span>
          </div>
          {recommendation.description && <p className="mt-2 text-sm leading-6 text-ink/75">{recommendation.description}</p>}
          {recommendation.stops.length > 0 && <p className="mt-2 text-xs leading-5 text-muted">{recommendation.stops.join(" · ")}</p>}
        </div>
        <div className="grid grid-cols-3 divide-x divide-line border-t border-line">
          {stats.map((stat) => <div key={stat.label} className="min-w-0 px-3 py-4 md:px-6"><div className="text-[10px] leading-4 text-muted md:text-xs">{stat.label}</div><div className={`mt-1 break-words text-sm font-semibold md:text-lg ${stat.over ? "text-coral" : "text-ink"}`}>{stat.value}</div></div>)}
        </div>
        {unknownCosts > 0 && <p className="border-t border-line px-5 py-3 text-xs leading-5 text-muted">{unknownCosts} cost{unknownCosts === 1 ? " is" : "s are"} still to be estimated and excluded from this total.</p>}
      </article>
    </section>
  );
}
