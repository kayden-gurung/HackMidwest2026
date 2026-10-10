import { useState, type ReactNode } from "react";
import { Action, Icon, ScreenHeader, Toggle, type IconName } from "../../../components/ui";
import { useTheme } from "../../../lib/theme";
import {
  accountProfile,
  currencies,
  interestOptions,
  notificationOptions,
  paceOptions,
  planningStyles,
  stayOptions,
} from "../api/mockData";
import { useSettings } from "../hooks/useSettings";

/** Left-hand section list. `id` matches the section it scrolls to. */
const sections: { id: string; label: string; icon: IconName | "avatar" }[] = [
  { id: "settings-profile", label: "Profile", icon: "avatar" },
  { id: "settings-preferences", label: "Travel preferences", icon: "compass" },
  { id: "settings-planning", label: "Planning style", icon: "sparkles" },
  { id: "settings-appearance", label: "Appearance", icon: "sun" },
  { id: "settings-notifications", label: "Notifications", icon: "bell" },
  { id: "settings-privacy", label: "Privacy & data", icon: "settings" },
];

function Card({ id, children, className = "" }: { id?: string; children: ReactNode; className?: string }) {
  return (
    <section id={id} className={`scroll-mt-4 rounded-2xl border border-line bg-surface shadow-sm ${className}`}>
      {children}
    </section>
  );
}

/** Segmented control, e.g. Slow / Balanced / Packed. */
function Segmented({ options, value, onChange }: { options: string[]; value: string; onChange: (value: string) => void }) {
  return (
    <div className="mt-2 flex rounded-xl bg-panel p-1">
      {options.map((option) => (
        <Action key={option} onClick={() => onChange(option)} className={`flex-1 rounded-lg py-2 text-center text-xs font-bold ${value === option ? "bg-surface text-ink shadow-sm" : "text-muted"}`}>
          {option}
        </Action>
      ))}
    </div>
  );
}

/** "Settings" screen: profile, travel preferences, planning style, notifications, region and privacy. */
export function SettingsView({ onClose }: { onClose: () => void }) {
  // Kept in the settings store, so choices survive leaving this screen and reach the chat.
  const { settings, update } = useSettings();
  const { interests, pace, stay, planningStyle, currency, notifications } = settings;
  const setPace = (value: string) => update({ pace: value });
  const setStay = (value: string) => update({ stay: value });
  const setPlanningStyle = (value: string) => update({ planningStyle: value });
  const setCurrency = (value: string) => update({ currency: value });
  const { theme, setTheme } = useTheme();
  const [activeSection, setActiveSection] = useState(sections[0].id);

  const toggleInterest = (interest: string) =>
    update({ interests: interests.includes(interest) ? interests.filter((item) => item !== interest) : [...interests, interest] });

  const goToSection = (id: string) => {
    setActiveSection(id);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <main className="flex min-w-0 flex-1 flex-col lg:h-screen">
      <ScreenHeader
        title="Settings"
        subtitle="Shape how Roam plans with you"
        action={
          <Action onClick={onClose} className="flex items-center gap-2 rounded-xl border border-line bg-surface px-3.5 py-2 text-xs font-bold shadow-sm hover:border-sea hover:text-sea">
            Back to trip <Icon name="chevron" className="size-3.5 rotate-180" />
          </Action>
        }
      />

      <div className="flex-1 overflow-y-auto px-5 py-8 md:px-8 lg:px-12">
        <div className="mx-auto grid max-w-5xl gap-8 lg:grid-cols-[220px_minmax(0,1fr)]">
          {/* Section navigation */}
          <div>
            <div className="sticky top-0 space-y-1">
              {sections.map((section) => (
                <Action
                  key={section.id}
                  onClick={() => goToSection(section.id)}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold ${activeSection === section.id ? "bg-surface text-ink shadow-sm ring-1 ring-line" : "text-muted hover:bg-surface/60 hover:text-ink"}`}
                >
                  {section.icon === "avatar" ? (
                    <div className="grid size-7 place-items-center rounded-full bg-coral text-[9px] font-bold text-white">{accountProfile.initials}</div>
                  ) : (
                    <div className="grid size-7 place-items-center"><Icon name={section.icon} className="size-4" /></div>
                  )}
                  {section.label}
                </Action>
              ))}
            </div>
          </div>

          <div className="space-y-6">
            {/* Profile */}
            <Card id="settings-profile" className="overflow-hidden">
              <div className="border-b border-line p-5 md:p-6">
                <div className="font-display text-xl font-semibold">Your profile</div>
                <div className="mt-1 text-sm text-muted">The basics Roam uses for bookings and recommendations.</div>
              </div>
              <div className="p-5 md:p-6">
                <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
                  <div className="grid size-16 shrink-0 place-items-center rounded-full bg-coral font-display text-xl font-semibold text-white ring-4 ring-peach">{accountProfile.initials}</div>
                  <div className="flex-1">
                    <div className="text-base font-bold">{accountProfile.name}</div>
                    <div className="mt-1 text-sm text-muted">{accountProfile.email}</div>
                  </div>
                  <Action className="w-fit rounded-xl border border-line px-3.5 py-2 text-xs font-bold hover:border-sea hover:text-sea">Edit profile</Action>
                </div>
                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl bg-panel p-4">
                    <div className="text-[10px] font-bold uppercase tracking-widest text-muted">Home airport</div>
                    <div className="mt-2 flex items-center gap-2 text-sm font-bold"><Icon name="plane" className="size-4 text-sea" /> {accountProfile.homeAirport}</div>
                  </div>
                  <div className="rounded-xl bg-panel p-4">
                    <div className="text-[10px] font-bold uppercase tracking-widest text-muted">Default travelers</div>
                    <div className="mt-2 text-sm font-bold">{accountProfile.defaultTravelers}</div>
                  </div>
                </div>
              </div>
            </Card>

            {/* Travel preferences */}
            <Card id="settings-preferences" className="p-5 md:p-6">
              <div className="font-display text-xl font-semibold">Travel preferences</div>
              <div className="mt-1 text-sm text-muted">Choose what makes a trip feel like yours.</div>
              <div className="mt-5">
                <div className="text-xs font-bold uppercase tracking-widest text-muted">I travel for</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {interestOptions.map((interest) => {
                    const selected = interests.includes(interest);
                    return (
                      <Action key={interest} onClick={() => toggleInterest(interest)} className={`rounded-full border px-3.5 py-2 text-xs font-semibold ${selected ? "border-sea bg-mint text-sea" : "border-line bg-surface text-muted hover:border-sea"}`}>
                        {selected && <span className="mr-1">✓</span>}
                        {interest}
                      </Action>
                    );
                  })}
                </div>
              </div>
              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <div>
                  <div className="text-xs font-bold uppercase tracking-widest text-muted">Travel pace</div>
                  <Segmented options={paceOptions} value={pace} onChange={setPace} />
                </div>
                <div>
                  <div className="text-xs font-bold uppercase tracking-widest text-muted">Stay style</div>
                  <Segmented options={stayOptions} value={stay} onChange={setStay} />
                </div>
              </div>
            </Card>

            {/* Planning style */}
            <Card id="settings-planning" className="p-5 md:p-6">
              <div className="flex items-start gap-3">
                <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-mint text-sea"><Icon name="sparkles" className="size-5" /></div>
                <div>
                  <div className="font-display text-xl font-semibold">How should Roam help?</div>
                  <div className="mt-1 text-sm text-muted">Set how involved you want to be in planning.</div>
                </div>
              </div>
              <div className="mt-5 grid gap-3 md:grid-cols-3">
                {planningStyles.map(({ title, description }) => {
                  const selected = planningStyle === title;
                  return (
                    <Action key={title} onClick={() => setPlanningStyle(title)} className={`rounded-2xl border p-4 ${selected ? "border-sea bg-mint/50 ring-1 ring-sea" : "border-line hover:border-sea/50"}`}>
                      <div className="flex items-center justify-between">
                        <div className="text-sm font-bold">{title}</div>
                        {/* Radio indicator */}
                        <div className={`grid size-4 place-items-center rounded-full border ${selected ? "border-sea bg-sea" : "border-line"}`}>
                          {selected && <div className="size-1.5 rounded-full bg-white" />}
                        </div>
                      </div>
                      <div className="mt-2 text-xs leading-relaxed text-muted">{description}</div>
                    </Action>
                  );
                })}
              </div>
            </Card>

            {/* Appearance */}
            <Card id="settings-appearance" className="p-5 md:p-6">
              <div className="font-display text-xl font-semibold">Appearance</div>
              <div className="mt-1 text-sm text-muted">Dark mode is easier on the eyes in low light.</div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {([["light", "Light", "sun"], ["dark", "Dark", "moon"]] as const).map(([value, label, icon]) => (
                  <Action key={value} label={`${label} mode`} onClick={() => setTheme(value)} className={`flex items-center gap-3 rounded-2xl border p-4 ${theme === value ? "border-sea bg-mint/50 ring-1 ring-sea" : "border-line hover:border-sea/50"}`}>
                    <div className="grid size-9 place-items-center rounded-xl bg-panel"><Icon name={icon} className="size-4" /></div>
                    <div className="flex-1 text-sm font-bold">{label}</div>
                    <div className={`grid size-4 place-items-center rounded-full border ${theme === value ? "border-sea bg-sea" : "border-line"}`}>
                      {theme === value && <div className="size-1.5 rounded-full bg-white" />}
                    </div>
                  </Action>
                ))}
              </div>
            </Card>

            {/* Notifications */}
            <Card id="settings-notifications">
              <div className="border-b border-line p-5 md:p-6">
                <div className="font-display text-xl font-semibold">Notifications</div>
                <div className="mt-1 text-sm text-muted">Only the useful stuff, when you need it.</div>
              </div>
              <div className="divide-y divide-line px-5 md:px-6">
                {notificationOptions.map(({ key, title, description }) => (
                  <div key={key} className="flex items-center gap-5 py-4">
                    <div className="flex-1">
                      <div className="text-sm font-bold">{title}</div>
                      <div className="mt-1 text-xs text-muted">{description}</div>
                    </div>
                    <Toggle label={title} checked={notifications[key]} onChange={() => update({ notifications: { ...notifications, [key]: !notifications[key] } })} />
                  </div>
                ))}
              </div>
            </Card>

            {/* Region & currency */}
            <Card className="p-5 md:p-6">
              <div className="font-display text-xl font-semibold">Region & currency</div>
              <div className="mt-4 flex flex-col gap-4 sm:flex-row">
                <div className="flex-1 rounded-xl border border-line p-4">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-muted">Language</div>
                  <div className="mt-2 flex items-center justify-between text-sm font-bold">English <Icon name="chevron" className="size-4 rotate-90 text-muted" /></div>
                </div>
                <div className="flex-1 rounded-xl border border-line p-4">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-muted">Currency</div>
                  <div className="mt-2 flex gap-2">
                    {currencies.map((item) => (
                      <Action key={item} onClick={() => setCurrency(item)} className={`rounded-lg px-2.5 py-1 text-xs font-bold ${currency === item ? "bg-deep text-white" : "bg-panel text-muted"}`}>
                        {item}
                      </Action>
                    ))}
                  </div>
                </div>
              </div>
            </Card>

            {/* Privacy & data: links are placeholders, none of them act yet. */}
            <Card id="settings-privacy" className="mb-8 p-5 md:p-6">
              <div className="font-display text-xl font-semibold">Privacy & data</div>
              <div className="mt-4 space-y-2">
                {["Download your trip data", "Manage connected accounts", "Delete account"].map((item) => (
                  <Action key={item} className={`flex items-center justify-between rounded-xl border border-line px-4 py-3 text-sm font-semibold hover:border-sea ${item === "Delete account" ? "text-coral" : ""}`}>
                    {item}
                    <Icon name="chevron" className="size-4" />
                  </Action>
                ))}
              </div>
            </Card>
          </div>
        </div>
      </div>
    </main>
  );
}
