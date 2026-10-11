import { useEffect, useRef, useState } from "react";
import { ErrorState, LoadingState } from "../../../components/ui";
import { useChat } from "../hooks/useChat";
import type { AskRequest, TravelPreferences } from "../types";
import { AssistantReply } from "./AssistantReply";
import { Composer } from "./Composer";
import { UserBubble } from "./UserBubble";
import { JourneyStarters } from "../../journey/components/JourneyStarters";

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
  const { messages, sendStatus, error, send, retry } = useChat(tripId, preferences, mode);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [draft, setDraft] = useState("");

  // Keep the newest message in view, including when a saved conversation is reopened.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, sendStatus]);

  const handleSend = (text: string) => {
    if (!text.trim() || sendStatus === "sending") return;
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
          {sendStatus === "sending" && <LoadingState label="Roam is thinking…" className="pl-11" />}
          {sendStatus === "error" && <ErrorState message={error ?? "Roam couldn’t reply. Please try again."} onRetry={retry} className="pl-11" />}
          <div ref={endRef} />
        </div>
      </div>

      <div className="shrink-0 px-5 pb-5 pt-2 md:px-10 lg:px-12">
        <Composer onSend={handleSend} disabled={sendStatus === "sending"} draft={draft} onDraftChange={setDraft} inputRef={inputRef} placeholder={messages.length === 0 ? "Describe your next trip…" : undefined} />
      </div>
    </section>
  );
}
