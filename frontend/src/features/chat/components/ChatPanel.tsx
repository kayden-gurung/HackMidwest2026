import { useEffect, useRef, useState } from "react";
import { ErrorState, LoadingState } from "../../../components/ui";
import { useChat } from "../hooks/useChat";
import type { AskRequest, TravelPreferences } from "../types";
import { AssistantReply } from "./AssistantReply";
import { Composer } from "./Composer";
import { UserBubble } from "./UserBubble";
import { AgentXrayPanel } from "./AgentXrayPanel";
import { ReplanApproval } from "./ReplanApproval";
import { JourneyStarters } from "../../journey/components/JourneyStarters";

/** What the status line says while Roam uses each backend tool. */
const toolStatus: Record<string, string> = {
  find_places: "Searching real places…",
  locate: "Looking up locations…",
  plan_drive: "Checking driving routes…",
  get_forecast: "Checking the live forecast…",
  check_budget: "Checking your budget…",
  update_itinerary: "Updating your plan…",
  research_places: "Places specialist is researching…",
  plan_transport: "Transport specialist is checking routes…",
  review_trip_budget: "Budget specialist is reviewing estimates…",
};

/**
 * The center column: conversation with Roam plus the message composer.
 * `preferences` are the traveler's settings, sent to Roam with every message.
 * `onUserMessage` fires with each message the traveler sends, before Roam replies.
 */
export function ChatPanel({
  tripId,
  preferences,
  mode,
  onUserMessage,
}: {
  tripId: string;
  preferences?: TravelPreferences;
  mode?: AskRequest["mode"];
  onUserMessage?: (text: string) => void;
}) {
  const { messages, sendStatus, error, draft: streamedReply, send, retry, agentState, resolveApproval } = useChat(tripId, preferences, mode);
  const busy = sendStatus === "sending" || sendStatus === "awaiting_approval";
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [draft, setDraft] = useState("");

  // Keep the newest message in view, including when a saved conversation is reopened.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, sendStatus, streamedReply?.text.length]);

  const handleSend = (text: string) => {
    if (!text.trim() || busy) return;
    onUserMessage?.(text);
    send(text);
  };

  return (
    <section className="flex min-h-0 min-w-0 flex-col border-line xl:border-r">
      <div className="flex-1 overflow-y-auto px-5 py-7 md:px-10 lg:px-12">
        <div className="mx-auto w-full max-w-3xl space-y-8">
          {messages.length === 0 && (
            <div className="py-6 md:py-12">
              <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-sea">A new journey</div>
              <h2 className="mt-4 max-w-md font-display text-4xl font-semibold leading-tight tracking-tight md:text-5xl">Where would you<br className="hidden sm:block" /> rather be?</h2>
              <p className="mt-4 max-w-md text-sm leading-6 text-muted">A place, a feeling, a budget. Start with whatever you know.</p>
              <div className="mb-3 mt-9 text-[10px] font-semibold uppercase tracking-[0.15em] text-muted">Find your starting point</div>
              <JourneyStarters onChoose={(prompt) => { setDraft(prompt); inputRef.current?.focus(); }} />
            </div>
          )}
          {messages.map((message) =>
            message.role === "user" ? (
              <UserBubble key={message.id} text={message.text} />
            ) : (
              <AssistantReply key={message.id} message={message} onSuggestion={handleSend} />
            ),
          )}
          {/* While streaming: the reply so far, then a status line that names the tool Roam is using. */}
          {sendStatus === "sending" && streamedReply?.text && <AssistantReply message={{ id: "draft", role: "assistant", text: streamedReply.text, toolSteps: streamedReply.toolSteps }} onSuggestion={handleSend} />}
          {sendStatus === "sending" && (
            <LoadingState label={(streamedReply?.tool && toolStatus[streamedReply.tool]) || (streamedReply?.tool ? "Working…" : streamedReply?.text ? "Writing…" : "Roam is thinking…")} className="pl-11" />
          )}
          {agentState.approval && <ReplanApproval approval={agentState.approval} busy={sendStatus === "sending"} onResolve={resolveApproval} />}
          {sendStatus === "error" && <ErrorState message={error ?? "Roam couldn’t reply. Please try again."} onRetry={retry} className="pl-11" />}
          <AgentXrayPanel events={agentState.events} running={sendStatus === "sending"} awaiting={sendStatus === "awaiting_approval"} failed={sendStatus === "error"} />
          <div ref={endRef} />
        </div>
      </div>

      <div className="shrink-0 px-5 pb-5 pt-2 md:px-10 lg:px-12">
        <Composer onSend={handleSend} disabled={busy} draft={draft} onDraftChange={setDraft} inputRef={inputRef} placeholder={sendStatus === "awaiting_approval" ? "Review the proposed re-plan above…" : messages.length === 0 ? "Describe your next trip…" : undefined} />
      </div>
    </section>
  );
}
