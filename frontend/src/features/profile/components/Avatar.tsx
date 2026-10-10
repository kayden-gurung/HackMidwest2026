/** "Alex Morgan" -> "AM" */
export function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "?"
  );
}

/** Round profile picture: the photo when there is one, otherwise the traveler's initials. Size and text size come from `className`. */
export function Avatar({ name, avatarUrl, className = "size-9 text-xs" }: { name: string; avatarUrl?: string; className?: string }) {
  if (avatarUrl) return <img src={avatarUrl} alt={name} className={`shrink-0 rounded-full object-cover ${className}`} />;
  return (
    <div aria-label={name} className={`grid shrink-0 place-items-center rounded-full bg-coral font-bold text-white ${className}`}>
      {initials(name)}
    </div>
  );
}
