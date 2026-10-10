import { useRef } from "react";
import { Action, Icon } from "../../../components/ui";

/** Message input. Enter sends, Shift+Enter adds a new line. */
export function Composer({ onSend, disabled = false }: { onSend: (text: string) => void; disabled?: boolean }) {
  const inputRef = useRef<HTMLDivElement>(null);

  const submit = () => {
    const value = inputRef.current?.innerText.trim();
    if (!value || disabled) return;
    onSend(value);
    if (inputRef.current) inputRef.current.innerText = "";
  };

  return (
    <div className="mx-auto max-w-3xl rounded-2xl border border-line bg-surface p-2 shadow-[0_12px_40px_rgba(18,38,38,0.08)]">
      <div
        ref={inputRef}
        role="textbox"
        aria-label="Message Roam"
        contentEditable
        suppressContentEditableWarning
        data-placeholder="Ask Roam to change anything..."
        className="composer min-h-12 px-3 py-3 text-sm leading-6 outline-none"
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            submit();
          }
        }}
      />
      <div className="flex items-center justify-between px-2 pb-1">
        <div className="flex items-center gap-2">
          <Action className="grid size-8 place-items-center rounded-full border border-line text-muted"><Icon name="plus" className="size-4" /></Action>
          <div className="text-xs text-muted">Roam can make mistakes. Check key details.</div>
        </div>
        <Action label="Send message" onClick={submit} className={`grid size-9 place-items-center rounded-xl bg-sea text-white hover:bg-deep ${disabled ? "opacity-50" : ""}`}><Icon name="send" className="size-4" /></Action>
      </div>
    </div>
  );
}
