import { useRef, useState } from "react";
import { Action, Icon } from "../../../components/ui";

/** Message input. Enter sends, Shift+Enter adds a new line. */
export function Composer({ onSend, disabled = false }: { onSend: (text: string) => void; disabled?: boolean }) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [draft, setDraft] = useState("");

  const submit = () => {
    const value = draft.trim();
    if (!value || disabled) return;
    onSend(value);
    setDraft("");
  };

  return (
    <div className="mx-auto max-w-3xl rounded-2xl border border-line bg-surface p-2 shadow-[0_12px_40px_rgba(18,38,38,0.08)]">
      <textarea
        ref={inputRef}
        role="textbox"
        aria-label="Message Roam"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        disabled={disabled}
        maxLength={8000}
        rows={2}
        placeholder="Ask Roam to change anything..."
        className="min-h-12 max-h-40 w-full resize-y bg-transparent px-3 py-3 text-sm leading-6 outline-none placeholder:text-muted disabled:opacity-60"
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            submit();
          }
        }}
      />
      <div className="flex items-center justify-between px-2 pb-1">
        <div className="text-xs text-muted">Roam can make mistakes. Check key details.</div>
        <Action label="Send message" onClick={submit} disabled={disabled || !draft.trim()} className="grid size-9 place-items-center rounded-xl bg-sea text-white hover:bg-deep"><Icon name="send" className="size-4" /></Action>
      </div>
    </div>
  );
}
