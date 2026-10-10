import { Action, Icon } from "../../../components/ui";
import { useProfile } from "../hooks/useProfile";
import { Avatar } from "./Avatar";

/** Bottom of the sidebar: the signed-in user and the Settings button. `onOpenSettings` opens the Settings screen. */
export function ProfilePanel({ onOpenSettings }: { onOpenSettings?: () => void }) {
  const { name, plan, avatarUrl } = useProfile();
  return (
    <div className="flex items-center gap-3 rounded-xl px-2 py-2">
      <Avatar name={name} avatarUrl={avatarUrl} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold">{name}</div>
        <div className="text-xs text-muted">{plan}</div>
      </div>
      <Action label="Open settings" onClick={onOpenSettings} className="grid size-8 place-items-center rounded-lg text-muted hover:bg-surface hover:text-ink">
        <Icon name="settings" className="size-4" />
      </Action>
    </div>
  );
}
