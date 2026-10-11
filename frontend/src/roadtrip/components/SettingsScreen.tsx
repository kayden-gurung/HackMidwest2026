import { useId, useState } from "react"
import { Action, Icon } from "./ui"

export type Profile = {
  firstName: string
  lastName: string
  email: string
  phone: string
}

export const emptyProfile: Profile = { firstName: "", lastName: "", email: "", phone: "" }

// Loose checks, enough to catch typos while typing. Nothing is sent anywhere yet.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE = /^[+()\-.\s\d]{7,20}$/

function initials(profile: Profile): string {
  return `${profile.firstName.trim().charAt(0)}${profile.lastName.trim().charAt(0)}`.toUpperCase()
}

function TextField({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  autoComplete,
  error,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  type?: "text" | "email" | "tel"
  placeholder: string
  autoComplete: string
  error?: string
}) {
  const id = useId()
  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-[10px] font-bold uppercase tracking-widest text-muted">
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        placeholder={placeholder}
        autoComplete={autoComplete}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(event) => onChange(event.target.value)}
        className={`min-h-11 w-full rounded-md border bg-white px-3 py-3 text-sm font-semibold outline-none transition-colors placeholder:font-normal placeholder:text-muted hover:border-school/60 focus:border-school ${
          error ? "border-coral" : "border-line"
        }`}
      />
      {error && (
        <div id={`${id}-error`} className="mt-1.5 text-[10px] font-semibold text-coral">
          {error}
        </div>
      )}
    </div>
  )
}

function SectionHeading({ title, hint }: { title: string; hint: string }) {
  return (
    <div>
      <h2 className="font-display text-2xl font-semibold">{title}</h2>
      <p className="mt-1 text-sm text-muted">{hint}</p>
    </div>
  )
}

/** Settings: the traveler's details, then planning preferences. */
export default function SettingsScreen({
  profile,
  onSave,
}: {
  profile: Profile
  onSave: (profile: Profile) => void
}) {
  const [draft, setDraft] = useState(profile)
  const [saved, setSaved] = useState(false)
  const set = (field: keyof Profile) => (value: string) => {
    setDraft({ ...draft, [field]: value })
    setSaved(false)
  }

  const errors = {
    email: draft.email.trim() && !EMAIL.test(draft.email.trim()) ? "Enter an email like name@example.com." : undefined,
    phone: draft.phone.trim() && !PHONE.test(draft.phone.trim()) ? "Enter a phone number, e.g. (816) 555-0123." : undefined,
  }
  const changed = (Object.keys(draft) as (keyof Profile)[]).some((field) => draft[field] !== profile[field])
  const canSave = changed && !errors.email && !errors.phone
  const name = `${draft.firstName} ${draft.lastName}`.trim()

  return (
    <div className="h-full overflow-y-auto p-5 md:p-10">
      <div className="mx-auto max-w-3xl">
        <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-school">Settings</div>
        <h1 className="mt-2 font-display text-4xl font-semibold">Your account</h1>
        <p className="mt-2 text-sm text-muted">Your details and the defaults Roam uses for your drives.</p>

        <section className="mt-8">
          <SectionHeading title="Your details" hint="How Roam addresses you and how to reach you." />
          <div className="mt-4 border border-line bg-white p-5 md:p-6">
            <div className="flex items-center gap-4 border-b border-line pb-5">
              <div className="grid size-14 shrink-0 place-items-center rounded-full bg-mint text-lg font-bold text-school">
                {initials(draft) || <Icon name="compass" className="size-6" />}
              </div>
              <div className="min-w-0">
                <div className="truncate text-sm font-bold">{name || "Add your name"}</div>
                <div className="truncate text-xs text-muted">{draft.email.trim() || "No email yet"}</div>
              </div>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <TextField label="First name" value={draft.firstName} onChange={set("firstName")} placeholder="e.g. Alex" autoComplete="given-name" />
              <TextField label="Last name" value={draft.lastName} onChange={set("lastName")} placeholder="e.g. Morgan" autoComplete="family-name" />
              <TextField label="Email" type="email" value={draft.email} onChange={set("email")} placeholder="name@example.com" autoComplete="email" error={errors.email} />
              <TextField label="Contact number" type="tel" value={draft.phone} onChange={set("phone")} placeholder="(816) 555-0123" autoComplete="tel" error={errors.phone} />
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-end gap-3 border-t border-line pt-5">
              <span aria-live="polite" className="mr-auto text-xs font-semibold text-school">
                {saved && (
                  <span className="inline-flex items-center gap-1.5">
                    <Icon name="check" className="size-4" /> Saved
                  </span>
                )}
              </span>
              {changed && (
                <Action
                  onClick={() => {
                    setDraft(profile)
                    setSaved(false)
                  }}
                  className="rounded-md border border-line bg-white px-4 py-2.5 text-xs font-bold transition-all hover:-translate-y-0.5 hover:border-school/60 hover:shadow-md"
                >
                  Discard
                </Action>
              )}
              <Action
                onClick={() => {
                  if (!canSave) return
                  onSave({
                    firstName: draft.firstName.trim(),
                    lastName: draft.lastName.trim(),
                    email: draft.email.trim(),
                    phone: draft.phone.trim(),
                  })
                  setSaved(true)
                }}
                className={`rounded-md px-5 py-2.5 text-xs font-bold text-white transition-all ${
                  canSave ? "bg-school hover:-translate-y-0.5 hover:bg-ink hover:shadow-md" : "cursor-not-allowed bg-school/40"
                }`}
              >
                Save details
              </Action>
            </div>
          </div>
        </section>

        <section className="mt-10">
          <SectionHeading title="Planning preferences" hint="Defaults for your drives." />
          <div className="mt-4 divide-y divide-line border-y border-line bg-white px-5">
            {[
              ["Home city", "Kansas City, MO"],
              ["Currency", "USD"],
              ["Planning style", "Co-pilot"],
              ["Distance units", "Miles"],
            ].map(([label, value]) => (
              <div key={label} className="flex items-center justify-between py-5">
                <div className="text-xs font-semibold">{label}</div>
                <div className="flex items-center gap-2 text-xs text-muted">
                  {value}
                  <Icon name="chevron" className="size-4" />
                </div>
              </div>
            ))}
          </div>
        </section>

        <div className="mt-8 border border-line bg-panel p-5">
          <div className="text-xs font-bold">Agent X-ray</div>
          <div className="mt-2 text-xs leading-5 text-muted">
            Open a drive to see live place lookups, route checks, and budget calculations in chat.
            Proposed revisions wait for your approval before replacing your plan.
          </div>
        </div>
      </div>
    </div>
  )
}
