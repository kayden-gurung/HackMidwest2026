import { formatUsd } from "../../../lib/format";
import type { DestinationRecommendation } from "../types";

export function DestinationCard({ recommendation }: { recommendation: DestinationRecommendation }) {
  const stats = [
    { label: "Est. total", value: formatUsd(recommendation.estimatedTotalUsd) },
    { label: "Round trip", value: `${formatUsd(recommendation.flightPricePerPersonUsd)} pp` },
    { label: "Trip pace", value: recommendation.pace },
  ];

  return (
    <div className="mt-5 overflow-hidden rounded-2xl border border-line bg-white shadow-sm">
      <div className="relative h-48 overflow-hidden md:h-56">
        <img src={recommendation.imageUrl} alt={recommendation.imageAlt} className="size-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
        <div className="absolute bottom-0 p-5 text-white">
          <div className="mb-2 inline-flex rounded-full bg-white/20 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest backdrop-blur">Top match · {recommendation.matchPercent}%</div>
          <div className="font-display text-2xl font-semibold">{recommendation.destination}</div>
          <div className="mt-1 text-sm text-white/80">{recommendation.stops.join(" · ")}</div>
        </div>
      </div>
      <div className="grid grid-cols-3 divide-x divide-line">
        {stats.map((stat) => (
          <div key={stat.label} className="p-4">
            <div className="text-xs text-muted">{stat.label}</div>
            <div className="mt-1 font-bold">{stat.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
