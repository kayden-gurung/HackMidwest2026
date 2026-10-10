import { Action, ErrorState, Icon, LoadingState } from "../../../components/ui";
import { useProfile } from "../hooks/useProfile";

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

/** Bottom of the sidebar: travel style card and the signed-in user. */
export function ProfilePanel() {
  const profile = useProfile();

  if (profile.status === "loading") return <LoadingState label="Loading profile…" />;
  if (profile.status === "error") return <ErrorState message="Couldn’t load profile." onRetry={profile.reload} />;

  const { name, plan, travelStyle } = profile.data;
  return (
    <>
      <div className="mb-3 rounded-2xl bg-sea p-4 text-white">
        <Icon name="sparkles" className="size-5 text-sun" />
        <div className="mt-3 text-sm font-semibold">Your travel style</div>
        <div className="mt-1 text-xs leading-relaxed text-white/70">{travelStyle}</div>
        <Action className="mt-3 text-xs font-bold text-sun">Tune preferences →</Action>
      </div>
      <div className="flex items-center gap-3 rounded-xl px-2 py-2">
        <div className="grid size-9 place-items-center rounded-full bg-coral text-xs font-bold text-white">{initials(name)}</div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">{name}</div>
          <div className="text-xs text-muted">{plan}</div>
        </div>
        <Icon name="settings" className="size-4 text-muted" />
      </div>
    </>
  );
}
