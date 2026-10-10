import { Icon } from "../../../components/ui";
import { formatUsd } from "../../../lib/format";
import type { FlightOption } from "../types";

export function FlightCard({ flight }: { flight: FlightOption }) {
  const stopsLabel = flight.stops === 0 ? "Nonstop" : `${flight.stops} stop${flight.stops > 1 ? "s" : ""}`;

  return (
    <div className="mt-5 rounded-2xl border border-line bg-surface p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-bold"><Icon name="plane" className="size-4 text-sea" /> Best flight option</div>
        {flight.withinBudget && <div className="rounded-full bg-mint px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-sea">Within budget</div>}
      </div>
      <div className="mt-4 flex items-center gap-4">
        <div><div className="text-lg font-bold">{flight.departTime}</div><div className="text-xs text-muted">{flight.departAirport}</div></div>
        <div className="flex-1">
          <div className="flex items-center gap-2 text-[10px] text-muted"><div className="h-px flex-1 bg-line" /> {flight.duration} · {stopsLabel} <div className="h-px flex-1 bg-line" /></div>
        </div>
        <div className="text-right">
          <div className="text-lg font-bold">{flight.arriveTime}</div>
          <div className="text-xs text-muted">{flight.arriveAirport}{flight.arriveDayOffset > 0 && ` +${flight.arriveDayOffset}`}</div>
        </div>
        <div className="hidden border-l border-line pl-4 text-right sm:block"><div className="font-bold">{formatUsd(flight.pricePerPersonUsd)}</div><div className="text-xs text-muted">per person</div></div>
      </div>
    </div>
  );
}
