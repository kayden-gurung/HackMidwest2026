import { Icon } from "../../../components/ui";
import { formatUsd } from "../../../lib/format";
import type { FlightOption } from "../types";

export function FlightCard({ flight }: { flight: FlightOption }) {
  const stopsLabel = flight.stops === 0 ? "Nonstop" : `${flight.stops} stop${flight.stops > 1 ? "s" : ""}`;

  return (
    <details className="postcard-flight group mt-3 rounded-2xl border border-line bg-surface">
      <summary className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl px-4 py-3.5 text-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sea">
        <Icon name="plane" className="size-4 shrink-0 text-sea" />
        <span className="mr-auto font-semibold">{flight.departAirport} → {flight.arriveAirport}</span>
        <span className="text-muted">{stopsLabel} · {formatUsd(flight.pricePerPersonUsd)} / person</span>
        <Icon name="chevron" className="size-3.5 rotate-90 transition-transform group-open:-rotate-90" />
      </summary>
      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-line px-4 py-4">
        <div><div className="text-base font-semibold">{flight.departTime}</div><div className="mt-1 text-xs text-muted">{flight.departAirport}</div></div>
        <div className="text-center text-xs leading-5 text-muted">{flight.duration}<br />{stopsLabel}</div>
        <div className="text-right"><div className="text-base font-semibold">{flight.arriveTime}</div><div className="mt-1 text-xs text-muted">{flight.arriveAirport}{flight.arriveDayOffset > 0 && ` +${flight.arriveDayOffset}`}</div></div>
        {flight.withinBudget && <span className="rounded-lg bg-mint px-2 py-1 text-[10px] font-semibold text-sea">Within budget</span>}
      </div>
    </details>
  );
}
