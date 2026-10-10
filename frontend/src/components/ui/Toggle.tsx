/** On/off switch (works with mouse and Enter key). */
export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <div
      role="switch"
      aria-label={label}
      aria-checked={checked}
      tabIndex={0}
      onClick={onChange}
      onKeyDown={(event) => event.key === "Enter" && onChange()}
      className={`relative h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors ${checked ? "bg-sea" : "bg-line"}`}
    >
      <div className={`absolute top-1 size-4 rounded-full bg-white shadow-sm transition-transform ${checked ? "translate-x-6" : "translate-x-1"}`} />
    </div>
  );
}
