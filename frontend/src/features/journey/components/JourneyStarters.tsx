import { Icon, type IconName } from "../../../components/ui";

const starters: { title: string; detail: string; icon: IconName; prompt: string; vibe: string }[] = [
  { title: "Chase the coast", detail: "Slow days, salty air", icon: "sun", prompt: "A relaxing beach escape with great food and a little hiking.", vibe: "Beach & coast" },
  { title: "A city weekend", detail: "Good food, new corners", icon: "compass", prompt: "A long weekend in a walkable city with great food, art and local neighborhoods.", vibe: "City energy" },
  { title: "Get outside", detail: "Trails, views, fresh air", icon: "map", prompt: "An outdoors trip with scenic hikes and a cozy place to stay.", vibe: "Big adventure" },
];

/** Starting points seed the editable request; the traveler still chooses when to send it. */
export function JourneyStarters({ onChoose }: { onChoose: (prompt: string, vibe: string) => void }) {
  return (
    <div className="grid gap-2.5 sm:grid-cols-3">
      {starters.map((starter) => (
        <button type="button" key={starter.title} onClick={() => onChoose(starter.prompt, starter.vibe)} className="group flex cursor-pointer items-center gap-3 rounded-2xl border border-line bg-surface p-4 text-left transition-colors hover:border-sea hover:bg-mint/40 sm:block">
          <Icon name={starter.icon} className="size-5 shrink-0 text-sea sm:mb-3" />
          <span className="block"><span className="block text-xs font-semibold text-ink">{starter.title}</span><span className="mt-1 block text-[11px] text-muted">{starter.detail}</span></span>
        </button>
      ))}
    </div>
  );
}
