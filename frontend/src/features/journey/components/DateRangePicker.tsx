import { useEffect, useRef, useState } from "react";
import { Action, Icon } from "../../../components/ui";
import { parseIsoDate } from "../../../lib/format";
import { describeLength, formatTripDates, toIsoDate } from "../lib/dates";
import type { DateRange } from "../types";

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

/** The days of one month laid out in weeks, with nulls padding the first week. */
function monthGrid(month: Date): (Date | null)[] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells: (Date | null)[] = Array.from({ length: first.getDay() }, () => null);
  for (let day = 1; day <= daysInMonth; day++) cells.push(new Date(month.getFullYear(), month.getMonth(), day));
  return cells;
}

/**
 * The "When" field: shows "I’m flexible" or the chosen dates, and opens a calendar to pick a trip window.
 * The first click sets the start, the second the end (clicking an earlier day restarts the range).
 * `value` is null for flexible dates.
 */
export function DateRangePicker({ value, onChange }: { value: DateRange | null; onChange: (value: DateRange | null) => void }) {
  const [open, setOpen] = useState(false);
  // A start picked while the end is still to come.
  const [pendingStart, setPendingStart] = useState<string | null>(null);
  const [month, setMonth] = useState(() => {
    const shown = value ? parseIsoDate(value.start) : new Date();
    return new Date(shown.getFullYear(), shown.getMonth(), 1);
  });
  const rootRef = useRef<HTMLDivElement>(null);

  const close = () => {
    setOpen(false);
    setPendingStart(null);
  };

  // Close on a click outside the field or on Escape.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) close();
    };
    const onKeyDown = (event: KeyboardEvent) => event.key === "Escape" && close();
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const today = toIsoDate(new Date());
  const thisMonth = toIsoDate(new Date()).slice(0, 7);
  const canGoBack = toIsoDate(month).slice(0, 7) > thisMonth;

  const pickDay = (iso: string) => {
    if (pendingStart === null || iso < pendingStart) {
      setPendingStart(iso);
      return;
    }
    onChange({ start: pendingStart, end: iso });
    close();
  };

  // While picking, highlight only the pending start; otherwise the saved range.
  const rangeStart = pendingStart ?? value?.start;
  const rangeEnd = pendingStart ? undefined : value?.end;

  return (
    <div ref={rootRef} className="relative">
      <Action onClick={() => (open ? close() : setOpen(true))} label="Choose trip dates" className="mt-3 flex items-center justify-between text-sm font-bold">
        {value ? formatTripDates(value) : "I’m flexible"}
        <span className="flex items-center gap-2">
          {value && <span className="text-xs font-semibold text-muted">{describeLength(value)}</span>}
          <Icon name="chevron" className={`size-4 text-muted transition-transform ${open ? "-rotate-90" : "rotate-90"}`} />
        </span>
      </Action>

      {open && (
        <div className="absolute left-0 top-full z-20 mt-3 w-72 rounded-2xl border border-line bg-surface p-4 shadow-[0_20px_60px_rgba(18,38,38,0.18)]">
          <div className="flex items-center justify-between">
            <Action
              onClick={() => canGoBack && setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
              label="Previous month"
              className={`grid size-7 place-items-center rounded-full ${canGoBack ? "hover:bg-panel" : "pointer-events-none opacity-30"}`}
            >
              <Icon name="chevron" className="size-4 rotate-180" />
            </Action>
            <div className="text-sm font-bold">{month.toLocaleDateString("en-US", { month: "long", year: "numeric" })}</div>
            <Action onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} label="Next month" className="grid size-7 place-items-center rounded-full hover:bg-panel">
              <Icon name="chevron" className="size-4" />
            </Action>
          </div>

          <div className="mt-3 grid grid-cols-7 text-center text-[10px] font-bold uppercase text-muted">
            {WEEKDAYS.map((day, index) => (
              <div key={index} className="py-1">{day}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-y-0.5 text-center text-xs">
            {monthGrid(month).map((date, index) => {
              if (!date) return <div key={index} />;
              const iso = toIsoDate(date);
              const past = iso < today;
              const isEdge = iso === rangeStart || iso === rangeEnd;
              const inRange = rangeStart && rangeEnd && iso > rangeStart && iso < rangeEnd;
              return (
                <Action
                  key={iso}
                  onClick={() => !past && pickDay(iso)}
                  label={date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
                  className={`grid h-8 place-items-center rounded-lg font-semibold ${
                    past ? "pointer-events-none text-muted/40" : isEdge ? "bg-deep text-white" : inRange ? "bg-mint text-sea" : "hover:bg-panel"
                  } ${iso === today && !isEdge ? "ring-1 ring-line" : ""}`}
                >
                  {date.getDate()}
                </Action>
              );
            })}
          </div>

          <div className="mt-3 flex items-center justify-between border-t border-line pt-3 text-xs">
            <span className="text-muted">{pendingStart ? "Now pick the last day" : "Pick the first day"}</span>
            <Action
              onClick={() => {
                onChange(null);
                close();
              }}
              className="rounded-full border border-line px-3 py-1.5 font-semibold text-muted hover:border-sea hover:text-sea"
            >
              I’m flexible
            </Action>
          </div>
        </div>
      )}
    </div>
  );
}
