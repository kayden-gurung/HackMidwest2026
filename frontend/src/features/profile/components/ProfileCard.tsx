import { useRef, useState, type ReactNode } from "react";
import { Action, Icon } from "../../../components/ui";
import { profileService } from "../api/profileService";
import { useProfile } from "../hooks/useProfile";
import { MAX_PHOTO_BYTES, resizeImageToDataUrl } from "../lib/resizeImage";
import type { UserProfile } from "../types";
import { Avatar } from "./Avatar";

type Draft = Pick<UserProfile, "name" | "email" | "homeAddress" | "homeAirport" | "avatarUrl">;

/** Loose check: something@something.something */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function InfoTile({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-xl bg-panel p-4">
      <div className="text-[10px] font-bold uppercase tracking-widest text-muted">{label}</div>
      <div className="mt-2 flex items-center gap-2 text-sm font-bold">{children}</div>
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  error,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  error?: string;
}) {
  return (
    <label className="block">
      <span className="text-[10px] font-bold uppercase tracking-widest text-muted">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-invalid={Boolean(error)}
        className={`mt-1.5 w-full rounded-xl border bg-surface px-3 py-2.5 text-sm text-ink outline-none placeholder:text-muted focus:border-sea ${error ? "border-coral" : "border-line"}`}
      />
      {error && <span className="mt-1 block text-xs text-coral">{error}</span>}
    </label>
  );
}

/**
 * The "Your profile" card on the Settings screen. Shows the profile, and "Edit profile" switches
 * it to a form for name, email, home address, home airport and photo. Saved edits show up
 * everywhere straight away (sidebar, Settings, and the preferences sent to the agent).
 */
export function ProfileCard() {
  const profile = useProfile();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [errors, setErrors] = useState<{ name?: string; email?: string; photo?: string }>({});
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const startEditing = () => {
    const { name, email, homeAddress, homeAirport, avatarUrl } = profile;
    setDraft({ name, email, homeAddress, homeAirport, avatarUrl });
    setErrors({});
  };

  const change = (changes: Partial<Draft>) => setDraft((current) => (current ? { ...current, ...changes } : current));

  const choosePhoto = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) return setErrors((current) => ({ ...current, photo: "Choose an image file." }));
    if (file.size > MAX_PHOTO_BYTES) return setErrors((current) => ({ ...current, photo: "That photo is over 10 MB." }));
    try {
      change({ avatarUrl: await resizeImageToDataUrl(file) });
      setErrors((current) => ({ ...current, photo: undefined }));
    } catch {
      setErrors((current) => ({ ...current, photo: "Couldn’t read that image. Try another one." }));
    }
  };

  const save = async () => {
    if (!draft) return;
    const cleaned = {
      ...draft,
      name: draft.name.replace(/\s+/g, " ").trim(),
      email: draft.email.trim(),
      homeAddress: draft.homeAddress.trim(),
      homeAirport: draft.homeAirport.trim(),
    };
    const nextErrors = {
      name: cleaned.name ? undefined : "Enter your name.",
      email: EMAIL_PATTERN.test(cleaned.email) ? undefined : "Enter a valid email address.",
    };
    setErrors(nextErrors);
    if (nextErrors.name || nextErrors.email) return;

    setSaving(true);
    try {
      await profileService.updateProfile(cleaned);
      setDraft(null);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="flex items-start justify-between gap-4 border-b border-line p-5 md:p-6">
        <div>
          <div className="font-display text-xl font-semibold">Your profile</div>
          <div className="mt-1 text-sm text-muted">The basics Roam uses for bookings and recommendations.</div>
        </div>
        {!draft && (
          <Action onClick={startEditing} className="flex w-fit shrink-0 items-center gap-1.5 rounded-xl border border-line px-3.5 py-2 text-xs font-bold hover:border-sea hover:text-sea">
            <Icon name="pencil" className="size-3.5" /> Edit profile
          </Action>
        )}
      </div>

      {!draft ? (
        // View mode
        <div className="p-5 md:p-6">
          <div className="flex items-center gap-5">
            <Avatar name={profile.name} avatarUrl={profile.avatarUrl} className="size-16 font-display text-xl ring-4 ring-peach" />
            <div className="min-w-0">
              <div className="truncate text-base font-bold">{profile.name}</div>
              <div className="mt-1 truncate text-sm text-muted">{profile.email}</div>
            </div>
          </div>
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <InfoTile label="Home address">{profile.homeAddress || <span className="font-normal text-muted">Not set</span>}</InfoTile>
            <InfoTile label="Home airport">
              <Icon name="plane" className="size-4 shrink-0 text-sea" /> {profile.homeAirport || <span className="font-normal text-muted">Not set</span>}
            </InfoTile>
            <InfoTile label="Default travelers">{profile.defaultTravelers}</InfoTile>
          </div>
        </div>
      ) : (
        // Edit mode
        <div className="p-5 md:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <Avatar name={draft.name || profile.name} avatarUrl={draft.avatarUrl} className="size-16 font-display text-xl ring-4 ring-peach" />
            <div>
              <div className="flex flex-wrap gap-2">
                <Action onClick={() => fileInputRef.current?.click()} className="rounded-xl border border-line px-3 py-2 text-xs font-bold hover:border-sea hover:text-sea">
                  {draft.avatarUrl ? "Change photo" : "Upload photo"}
                </Action>
                {draft.avatarUrl && (
                  <Action onClick={() => change({ avatarUrl: undefined })} className="rounded-xl px-3 py-2 text-xs font-bold text-coral hover:bg-peach/60">
                    Remove photo
                  </Action>
                )}
              </div>
              <div className="mt-1.5 text-xs text-muted">JPG, PNG or WebP. Cropped to a square.</div>
              {errors.photo && <div className="mt-1 text-xs text-coral">{errors.photo}</div>}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => {
                  choosePhoto(event.target.files?.[0]);
                  // Allow picking the same file again after removing it.
                  event.target.value = "";
                }}
              />
            </div>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <TextField label="Name" value={draft.name} onChange={(name) => change({ name })} error={errors.name} />
            <TextField label="Email" type="email" value={draft.email} onChange={(email) => change({ email })} error={errors.email} />
            <TextField label="Home address" value={draft.homeAddress} onChange={(homeAddress) => change({ homeAddress })} placeholder="e.g. Brooklyn, NY" />
            <TextField label="Home airport" value={draft.homeAirport} onChange={(homeAirport) => change({ homeAirport })} placeholder="e.g. New York · JFK" />
          </div>

          <div className="mt-6 flex justify-end gap-2 border-t border-line pt-5">
            <Action onClick={() => setDraft(null)} className="rounded-xl px-4 py-2.5 text-xs font-bold text-muted hover:bg-panel">
              Cancel
            </Action>
            <Action onClick={save} className={`rounded-xl bg-sea px-4 py-2.5 text-xs font-bold text-white hover:bg-ink ${saving ? "pointer-events-none opacity-60" : ""}`}>
              {saving ? "Saving…" : "Save changes"}
            </Action>
          </div>
        </div>
      )}
    </>
  );
}
