import { useState, useEffect } from "react";
import {
  Gamepad2, Music, Film, Cpu, BookOpen, Plane, Pizza, Laugh, Palette, Trophy,
  FlaskConical, Sparkles, Camera, Theater, Dumbbell, Dices, Globe, MapPin,
  MessageCircle, Users, MoonStar, Clock, Heart, Brain, Flame, Snowflake,
  Check, ArrowRight, ArrowLeft, type LucideIcon,
} from "lucide-react";
import type { Gender, Pref } from "../types";
import { Button, LogoMark } from "./ui";
import { cx } from "../lib";

interface Option {
  value: string;
  label: string;
  desc?: string;
  icon: LucideIcon;
}

const INTERESTS: Option[] = [
  { value: "Gaming", label: "Gaming", icon: Gamepad2 },
  { value: "Music", label: "Music", icon: Music },
  { value: "Movies", label: "Movies", icon: Film },
  { value: "Tech", label: "Tech", icon: Cpu },
  { value: "Books", label: "Books", icon: BookOpen },
  { value: "Travel", label: "Travel", icon: Plane },
  { value: "Food", label: "Food", icon: Pizza },
  { value: "Memes", label: "Memes", icon: Laugh },
  { value: "Art", label: "Art", icon: Palette },
  { value: "Sports", label: "Sports", icon: Trophy },
  { value: "Science", label: "Science", icon: FlaskConical },
  { value: "Dance", label: "Dance", icon: Sparkles },
  { value: "Photography", label: "Photography", icon: Camera },
  { value: "Theatre", label: "Theatre", icon: Theater },
  { value: "Fitness", label: "Fitness", icon: Dumbbell },
  { value: "Board Games", label: "Board Games", icon: Dices },
];

const LANGUAGES: { code: string; label: string; glyph: string; icon?: LucideIcon }[] = [
  { code: "telugu", label: "Telugu", glyph: "తె" },
  { code: "hindi", label: "Hindi", glyph: "हि" },
  { code: "tamil", label: "Tamil", glyph: "த" },
  { code: "kannada", label: "Kannada", glyph: "ಕ" },
  { code: "malayalam", label: "Malayalam", glyph: "മ" },
  { code: "marathi", label: "Marathi", glyph: "म" },
  { code: "bengali", label: "Bengali", glyph: "বা" },
  { code: "punjabi", label: "Punjabi", glyph: "ਪੰ" },
  { code: "gujarati", label: "Gujarati", glyph: "ગુ" },
  { code: "odia", label: "Odia", glyph: "ଓ" },
  { code: "english", label: "English", glyph: "EN", icon: Globe },
  { code: "andhra", label: "Andhra", glyph: "AP", icon: MapPin },
  { code: "telangana", label: "Telangana", glyph: "TS", icon: MapPin },
];

const VIBES: Option[] = [
  { value: "chatting", label: "Just Chatting", desc: "Casual conversation", icon: MessageCircle },
  { value: "friends", label: "Make Friends", desc: "Long-term connection", icon: Users },
  { value: "nightowl", label: "Night Owl", desc: "Late night vibes", icon: MoonStar },
  { value: "bored", label: "Bored", desc: "Kill some time", icon: Clock },
  { value: "flirty", label: "Flirty", desc: "Playful energy", icon: Heart },
  { value: "deep", label: "Deep Talk", desc: "Meaningful convos", icon: Brain },
  { value: "fun", label: "Fun & Memes", desc: "Laugh together", icon: Flame },
  { value: "chill", label: "Chill", desc: "No pressure", icon: Snowflake },
];

const GENDERS: { value: Gender; label: string }[] = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "other", label: "Other" },
];

const PREFS: { value: Pref; label: string }[] = [
  { value: "male", label: "Guys" },
  { value: "female", label: "Girls" },
  { value: "any", label: "Anyone" },
];

interface Props {
  onDone: (gender: Gender, pref: Pref, interests: string[], languages: string[], vibes: string[]) => void;
}

const STEP_TITLES = ["About you", "Your interests", "Your language", "Your vibe"];
const STEP_SUBS = [
  "Help us find the right match for you.",
  "Select any that apply — we match on shared ones.",
  "Pick a language to meet people who speak it.",
  "Set the energy you're bringing today.",
];

/* ── Selectable tile ─────────────────────────────────────────────────── */
function Tile({
  selected,
  onClick,
  icon: Icon,
  glyph,
  label,
  desc,
}: {
  selected: boolean;
  onClick: () => void;
  icon?: LucideIcon;
  glyph?: string;
  label: string;
  desc?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cx(
        "group relative flex flex-col items-center justify-center gap-2 rounded-2xl border px-2 py-4 text-center backdrop-blur-md",
        "transition-all duration-150 active:scale-[0.97]",
        selected
          ? "border-accent/60 bg-accent-soft shadow-[0_0_0_1px_rgba(110,107,245,0.35),0_10px_30px_-14px_rgba(110,107,245,0.75)]"
          : "border-white/[0.07] bg-white/[0.035] hover:border-white/[0.14] hover:bg-white/[0.06]"
      )}
    >
      {selected && (
        <span className="absolute right-2 top-2 grid h-4 w-4 place-items-center rounded-full bg-accent">
          <Check size={10} strokeWidth={3.5} color="#fff" />
        </span>
      )}
      <span
        className={cx(
          "grid place-items-center transition-colors",
          selected ? "text-accent-hover" : "text-fg-muted group-hover:text-fg"
        )}
      >
        {Icon ? (
          <Icon size={22} strokeWidth={1.9} />
        ) : (
          <span className="text-[19px] font-semibold leading-none">{glyph}</span>
        )}
      </span>
      <span className={cx("text-[12.5px] font-medium leading-tight", selected ? "text-fg" : "text-fg-muted")}>
        {label}
      </span>
      {desc && <span className="text-[10.5px] leading-tight text-fg-subtle">{desc}</span>}
    </button>
  );
}

function Pill({
  selected,
  onClick,
  label,
}: {
  selected: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cx(
        "h-11 rounded-xl border text-sm font-medium backdrop-blur-md transition-all duration-150 active:scale-[0.97]",
        selected
          ? "border-accent/60 bg-accent-soft text-fg shadow-[0_0_0_1px_rgba(110,107,245,0.30)]"
          : "border-white/[0.07] bg-white/[0.035] text-fg-muted hover:border-white/[0.14] hover:text-fg"
      )}
    >
      {label}
    </button>
  );
}

export default function Setup({ onDone }: Props) {
  const [step, setStep] = useState(1);
  const [gender, setGender] = useState<Gender | null>(null);
  const [pref, setPref] = useState<Pref>("any");
  const [interests, setInterests] = useState<string[]>([]);
  const [languages, setLanguages] = useState<string[]>([]);
  const [vibes, setVibes] = useState<string[]>([]);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 50);
    return () => clearTimeout(t);
  }, []);

  const toggle = <T,>(arr: T[], val: T): T[] =>
    arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val];

  const goTo = (s: number) => setStep(s);

  const finish = (includeFilters = true) => {
    if (!gender) return;
    onDone(
      gender,
      pref,
      includeFilters ? interests : [],
      includeFilters ? languages : [],
      includeFilters ? vibes : []
    );
  };

  const skip = () => {
    if (step < 4) goTo(step + 1);
    else finish();
  };

  const next = () => {
    if (step < 4) goTo(step + 1);
    else finish();
  };

  const canContinue = step === 1 ? Boolean(gender) : true;

  const ctaLabel = () => {
    if (step === 1) return "Find a stranger";
    if (step === 2 && interests.length)
      return `Continue with ${interests.length} interest${interests.length > 1 ? "s" : ""}`;
    if (step === 3 && languages.length)
      return `Continue with ${languages.length} language${languages.length > 1 ? "s" : ""}`;
    if (step === 4) return "Find a stranger";
    return "Continue";
  };
  const progressItems = step === 1 ? ["Quick match"] : STEP_TITLES.slice(1);
  const progressStep = step === 1 ? 1 : step - 1;

  return (
    <div
      className={cx(
        "relative flex h-full w-full flex-col overflow-hidden bg-bg transition-opacity duration-500",
        visible ? "opacity-100" : "opacity-0"
      )}
    >
      <div className="pointer-events-none absolute inset-0 aurora" />
      <div className="pointer-events-none absolute inset-0 grid-fade" />
      <div className="pointer-events-none absolute inset-0 noise" />

      {/* Header */}
      <header className="relative z-10 flex shrink-0 items-center justify-between px-5 pt-5">
        <LogoMark size={28} />
        <span className="text-[12px] font-medium tabular-nums text-fg-subtle">
          {step === 1 ? "Quick match" : `Optional filters ${progressStep} of 3`}
        </span>
      </header>

      {/* Progress rail */}
      <div className="relative z-10 mx-auto mt-4 flex w-full max-w-2xl shrink-0 gap-1.5 px-5">
        {progressItems.map((t, i) => (
          <div
            key={t}
            className={cx(
              "h-1 flex-1 rounded-full transition-colors duration-300",
              step === 1
                ? "bg-accent/60"
                : progressStep > i + 1
                  ? "bg-accent"
                  : progressStep === i + 1 ? "bg-accent/60" : "bg-line"
            )}
          />
        ))}
      </div>

      {/* Step body */}
      <main key={step} className="relative z-10 flex-1 overflow-y-auto px-5 py-7">
        <div className="mx-auto flex w-full max-w-2xl flex-col">
          <h1 className="animate-fade-up text-[26px] font-semibold tracking-[-0.02em] text-fg">
            {STEP_TITLES[step - 1]}
          </h1>
          <p className="mt-1.5 text-sm text-fg-muted">{STEP_SUBS[step - 1]}</p>

          {step === 1 && (
            <div className="mt-7 space-y-7">
              <div>
                <p className="mb-3 text-[13px] font-medium text-fg-muted">I am a</p>
                <div className="grid max-w-sm grid-cols-3 gap-2.5">
                  {GENDERS.map((g) => (
                    <Pill
                      key={g.value}
                      label={g.label}
                      selected={gender === g.value}
                      onClick={() => setGender(g.value)}
                    />
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-3 text-[13px] font-medium text-fg-muted">I want to chat with</p>
                <div className="grid max-w-sm grid-cols-3 gap-2.5">
                  {PREFS.map((p) => (
                    <Pill
                      key={p.value}
                      label={p.label}
                      selected={pref === p.value}
                      onClick={() => setPref(p.value)}
                    />
                  ))}
                </div>
                <p className="mt-2 max-w-sm text-xs leading-relaxed text-fg-subtle">
                  {pref === "any"
                    ? "Anyone gives you the broadest match pool."
                    : "Specific preferences can mean a longer wait for a compatible match."}{" "}
                  You can add filters if you prefer.
                </p>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="mt-7 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              {INTERESTS.map((item) => (
                <Tile
                  key={item.value}
                  label={item.label}
                  icon={item.icon}
                  selected={interests.includes(item.value)}
                  onClick={() => setInterests((p) => toggle(p, item.value))}
                />
              ))}
            </div>
          )}

          {step === 3 && (
            <div className="mt-7 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              {LANGUAGES.map((lang) => (
                <Tile
                  key={lang.code}
                  label={lang.label}
                  glyph={lang.glyph}
                  icon={lang.icon}
                  selected={languages.includes(lang.code)}
                  onClick={() => setLanguages((p) => toggle(p, lang.code))}
                />
              ))}
            </div>
          )}

          {step === 4 && (
            <div className="mt-7 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              {VIBES.map((vibe) => (
                <Tile
                  key={vibe.value}
                  label={vibe.label}
                  desc={vibe.desc}
                  icon={vibe.icon}
                  selected={vibes.includes(vibe.value)}
                  onClick={() => setVibes((p) => toggle(p, vibe.value))}
                />
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Footer CTA */}
      <footer className="relative z-10 shrink-0 border-t border-white/[0.08] bg-white/[0.03] px-5 py-4 backdrop-blur-2xl safe-bottom">
        <div className="mx-auto flex w-full max-w-2xl items-center gap-3">
          {step > 1 && (
            <Button variant="secondary" size="lg" onClick={() => goTo(step - 1)} className="shrink-0">
              <ArrowLeft size={16} />
              Back
            </Button>
          )}
          <Button
            size="lg"
            className="group flex-1"
            disabled={!canContinue}
            onClick={step === 1 ? () => finish(false) : next}
          >
            {ctaLabel()}
            <ArrowRight size={17} className="transition-transform group-hover:translate-x-0.5" />
          </Button>
          {step === 1 ? (
            <Button variant="ghost" size="lg" onClick={() => goTo(2)} className="shrink-0" disabled={!gender}>
              Filters
            </Button>
          ) : step < 4 ? (
            <Button variant="ghost" size="lg" onClick={skip} className="shrink-0">
              Skip
            </Button>
          ) : null}
        </div>
      </footer>
    </div>
  );
}
