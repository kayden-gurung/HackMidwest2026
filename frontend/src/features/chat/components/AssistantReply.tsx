import { Icon } from "../../../components/ui";
import Markdown from "react-markdown";
import type { AssistantMessage } from "../types";
import { DestinationCard } from "./DestinationCard";
import { FlightCard } from "./FlightCard";
import { postcardFromItinerary } from "../lib/tripPostcard";

export function AssistantReply({ message, onSuggestion }: { message: AssistantMessage; onSuggestion: (text: string) => void }) {
  const recommendation = message.itinerary ? postcardFromItinerary(message.itinerary) : message.recommendation;
  const suggestions = message.suggestions?.length ? message.suggestions : recommendation ? ["Explore stays", "Slow it down"] : [];
  return (
    <div className="flex gap-3">
      <div className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-xl bg-sea text-white"><Icon name="sparkles" className="size-4" /></div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-bold">Roam</div>
        <div className="chat-response mt-2 text-[15px] leading-7 text-ink/80"><Markdown components={{ a: ({ children, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer">{children}</a> }}>{message.text}</Markdown></div>
        {recommendation && <DestinationCard recommendation={recommendation} />}
        {message.flight && <FlightCard flight={message.flight} />}
        {(recommendation || suggestions.length > 0) && (
          <div className="mt-4 flex flex-wrap gap-2">
            {recommendation && <button type="button" onClick={() => onSuggestion(`Build a detailed day-by-day itinerary for ${recommendation.destination === "Your journey" ? "this trip" : recommendation.destination}, keeping my budget, dates and preferences.`)} className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-sea px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-deep">Build this trip <Icon name="chevron" className="size-3.5" /></button>}
            {suggestions.map((label) => (
              <button type="button" key={label} onClick={() => onSuggestion(label)} className="cursor-pointer rounded-xl border border-line bg-surface px-3.5 py-2.5 text-xs font-medium transition-colors hover:border-sea hover:text-sea">{label}</button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
