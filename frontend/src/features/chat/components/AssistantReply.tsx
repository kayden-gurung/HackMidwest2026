import { Action, Icon } from "../../../components/ui";
import type { AssistantMessage } from "../types";
import { DestinationCard } from "./DestinationCard";
import { FlightCard } from "./FlightCard";

export function AssistantReply({ message, onSuggestion }: { message: AssistantMessage; onSuggestion: (text: string) => void }) {
  return (
    <div className="flex gap-3">
      <div className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-xl bg-sea text-white"><Icon name="sparkles" className="size-4" /></div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-bold">Roam</div>
        <div className="mt-2 text-[15px] leading-7 text-ink/80">{message.text}</div>
        {message.recommendation && <DestinationCard recommendation={message.recommendation} />}
        {message.flight && <FlightCard flight={message.flight} />}
        {message.suggestions && message.suggestions.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {message.suggestions.map((label) => (
              <Action key={label} onClick={() => onSuggestion(label)} className="rounded-full border border-line bg-white px-3.5 py-2 text-xs font-semibold hover:border-sea hover:text-sea">{label}</Action>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
