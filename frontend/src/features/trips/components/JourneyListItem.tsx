import { useEffect, useRef, useState } from "react";
import { Action, Icon } from "../../../components/ui";

type Mode = "idle" | "menu" | "renaming" | "confirmDelete";

/**
 * One row under "Recent journeys". The "⋯" button (shown on hover, and always on the open
 * journey) opens a menu to rename the journey in place or delete it after a confirmation.
 */
export function JourneyListItem({
  title,
  meta,
  active,
  onSelect,
  onRename,
  onDelete,
}: {
  title: string;
  meta: string;
  active: boolean;
  onSelect: () => void;
  onRename: (title: string) => void;
  onDelete: () => void;
}) {
  const [mode, setMode] = useState<Mode>("idle");
  const [draftTitle, setDraftTitle] = useState(title);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Set once a rename is saved or cancelled, so the input's blur on unmount can't save it again (or save after Esc).
  const renameDoneRef = useRef(false);

  // Close the menu or delete confirmation on a click outside the row or on Escape.
  useEffect(() => {
    if (mode !== "menu" && mode !== "confirmDelete") return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setMode("idle");
    };
    const onKeyDown = (event: KeyboardEvent) => event.key === "Escape" && setMode("idle");
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [mode]);

  // Focus and select the name when renaming starts.
  useEffect(() => {
    if (mode === "renaming") inputRef.current?.select();
  }, [mode]);

  const startRename = () => {
    setDraftTitle(title);
    renameDoneRef.current = false;
    setMode("renaming");
  };

  const finishRename = (save: boolean) => {
    if (renameDoneRef.current) return;
    renameDoneRef.current = true;
    // Ignore blank or unchanged names.
    if (save && draftTitle.trim() && draftTitle.trim() !== title) onRename(draftTitle);
    setMode("idle");
  };

  const rowStyle = active ? "bg-surface shadow-sm ring-1 ring-line" : "hover:bg-surface/60";

  if (mode === "renaming") {
    return (
      <div className={`rounded-xl px-3 py-2.5 ${rowStyle}`}>
        <input
          ref={inputRef}
          value={draftTitle}
          onChange={(event) => setDraftTitle(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") finishRename(true);
            if (event.key === "Escape") finishRename(false);
          }}
          onBlur={() => finishRename(true)}
          aria-label="Journey name"
          maxLength={80}
          className="w-full rounded-lg border border-sea bg-surface px-2 py-1.5 text-sm font-semibold text-ink outline-none"
        />
        <div className="mt-1.5 px-0.5 text-[11px] text-muted">Enter to save · Esc to cancel</div>
      </div>
    );
  }

  return (
    <div ref={rootRef} className="group relative">
      <Action onClick={onSelect} className={`rounded-xl py-3 pl-3 pr-9 ${rowStyle}`}>
        <div className="truncate text-sm font-semibold">{title}</div>
        <div className="mt-1 text-xs text-muted">{meta}</div>
      </Action>

      {/* Kept outside the row's Action so opening the menu doesn't also open the journey. */}
      <Action
        label={`Options for ${title}`}
        onClick={() => setMode(mode === "idle" ? "menu" : "idle")}
        className={`absolute right-2 top-2.5 grid size-7 place-items-center rounded-lg text-muted hover:bg-panel hover:text-ink ${active || mode !== "idle" ? "opacity-100" : "opacity-0 focus:opacity-100 group-hover:opacity-100"}`}
      >
        <Icon name="more" className="size-4" />
      </Action>

      {mode === "menu" && (
        <div role="menu" className="absolute right-2 top-10 z-20 w-40 overflow-hidden rounded-xl border border-line bg-surface py-1 text-sm shadow-lg">
          <Action onClick={startRename} className="flex items-center gap-2 px-3 py-2 font-semibold hover:bg-panel">
            <Icon name="pencil" className="size-3.5 text-muted" /> Rename
          </Action>
          <Action onClick={() => setMode("confirmDelete")} className="flex items-center gap-2 px-3 py-2 font-semibold text-coral hover:bg-peach/60">
            <Icon name="trash" className="size-3.5" /> Delete
          </Action>
        </div>
      )}

      {mode === "confirmDelete" && (
        <div role="alertdialog" aria-label="Delete journey" className="absolute right-2 top-10 z-20 w-52 rounded-xl border border-line bg-surface p-3 text-sm shadow-lg">
          <div className="font-semibold">Delete this journey?</div>
          <div className="mt-1 text-xs text-muted">“{title}” and its plan will be removed.</div>
          <div className="mt-3 flex justify-end gap-2">
            <Action onClick={() => setMode("idle")} className="rounded-lg px-2.5 py-1.5 text-xs font-bold text-muted hover:bg-panel">
              Cancel
            </Action>
            <Action
              onClick={() => {
                setMode("idle");
                onDelete();
              }}
              className="rounded-lg bg-coral px-2.5 py-1.5 text-xs font-bold text-white hover:opacity-90"
            >
              Delete
            </Action>
          </div>
        </div>
      )}
    </div>
  );
}
