import { ErrorState, LoadingState } from "../../../components/ui";
import { useChat } from "../hooks/useChat";
import { AssistantReply } from "./AssistantReply";
import { Composer } from "./Composer";
import { UserBubble } from "./UserBubble";

/** The center column: conversation with Roam plus the message composer. */
export function ChatPanel({ tripId }: { tripId: string }) {
  const { messages, historyStatus, reloadHistory, sendStatus, send } = useChat(tripId);

  return (
    <section className="flex min-h-0 flex-col border-line xl:border-r">
      <div className="flex-1 overflow-y-auto px-5 py-7 md:px-10 lg:px-12">
        <div className="mx-auto max-w-3xl space-y-8">
          {historyStatus === "loading" && <LoadingState label="Loading conversation…" />}
          {historyStatus === "error" && <ErrorState message="Couldn’t load this conversation." onRetry={reloadHistory} />}
          {historyStatus === "success" && messages.length === 0 && (
            <div className="py-10 text-center text-sm text-muted">Tell Roam where you want to go to start planning.</div>
          )}
          {messages.map((message) =>
            message.role === "user" ? (
              <UserBubble key={message.id} text={message.text} />
            ) : (
              <AssistantReply key={message.id} message={message} onSuggestion={send} />
            ),
          )}
          {sendStatus === "sending" && <LoadingState label="Roam is thinking…" className="pl-11" />}
          {sendStatus === "error" && <ErrorState message="Roam couldn’t reply. Check the backend and try again." className="pl-11" />}
        </div>
      </div>

      <div className="shrink-0 px-5 pb-5 pt-2 md:px-10 lg:px-12">
        <Composer onSend={send} disabled={sendStatus === "sending"} />
      </div>
    </section>
  );
}
