import { useState, useEffect } from "react";
import type { Gender, Pref } from "../types";

const INTERESTS = [
  { icon: "🎮", label: "Gaming" },      { icon: "🎵", label: "Music" },
  { icon: "🎬", label: "Movies" },      { icon: "💻", label: "Tech" },
  { icon: "📚", label: "Books" },       { icon: "✈️", label: "Travel" },
  { icon: "🍕", label: "Food" },        { icon: "😂", label: "Memes" },
  { icon: "🎨", label: "Art" },         { icon: "⚽", label: "Sports" },
  { icon: "🧠", label: "Science" },     { icon: "💃", label: "Dance" },
  { icon: "📸", label: "Photography" }, { icon: "🎭", label: "Theatre" },
  { icon: "🏋️", label: "Fitness" },    { icon: "🎲", label: "Board Games" },
];

const LANGUAGES = [
  { code: "telugu",    label: "Telugu",    icon: "తె" },
  { code: "hindi",     label: "Hindi",     icon: "हि" },
  { code: "tamil",     label: "Tamil",     icon: "த" },
  { code: "kannada",   label: "Kannada",   icon: "ಕ" },
  { code: "malayalam", label: "Malayalam", icon: "മ" },
  { code: "marathi",   label: "Marathi",   icon: "म" },
  { code: "bengali",   label: "Bengali",   icon: "বা" },
  { code: "punjabi",   label: "Punjabi",   icon: "ਪੰ" },
  { code: "gujarati",  label: "Gujarati",  icon: "ગુ" },
  { code: "odia",      label: "Odia",      icon: "ଓ" },
  { code: "english",   label: "English",   icon: "🌐" },
  { code: "andhra",    label: "Andhra",    icon: "🗺️" },
  { code: "telangana", label: "Telangana", icon: "🏙️" },
];

const VIBES = [
  { code: "chatting", label: "Just Chatting", icon: "💬", desc: "Casual conversation" },
  { code: "friends",  label: "Make Friends",  icon: "🤝", desc: "Long-term connection" },
  { code: "nightowl", label: "Night Owl",     icon: "🌙", desc: "Late night vibes" },
  { code: "bored",    label: "Bored",         icon: "😴", desc: "Kill some time" },
  { code: "flirty",   label: "Flirty",        icon: "😏", desc: "Playful energy" },
  { code: "deep",     label: "Deep Talk",     icon: "🧠", desc: "Meaningful convos" },
  { code: "fun",      label: "Fun & Memes",   icon: "🔥", desc: "Laugh together" },
  { code: "chill",    label: "Chill",         icon: "😎", desc: "No pressure" },
];

const GENDERS: { value: Gender; label: string; icon: string }[] = [
  { value: "male",   label: "Male",   icon: "👨" },
  { value: "female", label: "Female", icon: "👩" },
  { value: "other",  label: "Other",  icon: "🧑" },
];

const PREFS: { value: Pref; label: string; icon: string }[] = [
  { value: "male",   label: "Guys",   icon: "👨" },
  { value: "female", label: "Girls",  icon: "👩" },
  { value: "any",    label: "Anyone", icon: "🌍" },
];

interface Props {
  onDone: (gender: Gender, pref: Pref, interests: string[], languages: string[], vibes: string[]) => void;
}

function lcg(s: number) { return (s * 9301 + 49297) % 233280; }

function SpaceBg() {
  const stars = Array.from({ length: 90 }, (_, i) => {
    let s = lcg(i + 3);
    const x = (s / 233280) * 100; s = lcg(s);
    const y = (s / 233280) * 100; s = lcg(s);
    const size = (s / 233280) * 2 + 0.6; s = lcg(s);
    const opacity = (s / 233280) * 0.5 + 0.12; s = lcg(s);
    const dur = (s / 233280) * 4 + 2.5; s = lcg(s);
    const delay = (s / 233280) * 6;
    const colors = ["#ffffff", "#c084fc", "#818cf8", "#f472b6", "#ffffff"];
    return { x, y, size, opacity, dur, delay, color: colors[i % colors.length] };
  });
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {stars.map((s, i) => (
        <div key={i} className="absolute rounded-full" style={{
          left: `${s.x}%`, top: `${s.y}%`,
          width: `${s.size}px`, height: `${s.size}px`,
          background: s.color, opacity: s.opacity,
          animation: `starTwinkle ${s.dur}s ease-in-out ${s.delay}s infinite`,
        }} />
      ))}
      <div className="absolute animate-aurora" style={{
        top: "-20%", left: "-10%", width: 700, height: 700,
        background: "radial-gradient(ellipse,rgba(99,102,241,0.15) 0%,transparent 65%)", filter: "blur(60px)",
      }} />
      <div className="absolute animate-aurora2" style={{
        bottom: "-20%", right: "-10%", width: 600, height: 600,
        background: "radial-gradient(ellipse,rgba(236,72,153,0.12) 0%,transparent 65%)", filter: "blur(60px)",
      }} />
    </div>
  );
}

function CheckBadge() {
  return (
    <span className="absolute top-2 right-2 w-5 h-5 rounded-full bg-green-500 flex items-center justify-center text-white font-bold animate-scale-in"
      style={{ fontSize: 11 }}>✓</span>
  );
}

const STEP_LABELS = ["About You", "Interests", "Language", "Vibe"];

export default function Setup({ onDone }: Props) {
  const [step, setStep] = useState(1);
  const [animKey, setAnimKey] = useState(0);
  const [gender, setGender] = useState<Gender | null>(null);
  const [pref, setPref] = useState<Pref | null>(null);
  const [interests, setInterests] = useState<string[]>([]);
  const [languages, setLanguages] = useState<string[]>([]);
  const [vibes, setVibes] = useState<string[]>([]);
  const [visible, setVisible] = useState(false);

  useEffect(() => { setTimeout(() => setVisible(true), 60); }, []);

  const goTo = (s: number) => { setStep(s); setAnimKey(k => k + 1); };

  const toggle = <T,>(arr: T[], val: T): T[] =>
    arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val];

  const skip = () => {
    if (step < 4) goTo(step + 1);
    else onDone(gender ?? "other", pref ?? "any", interests, languages, vibes);
  };

  const next = () => {
    if (step < 4) goTo(step + 1);
    else onDone(gender!, pref!, interests, languages, vibes);
  };

  const cardStyle = (sel: boolean) => ({
    background: sel ? "rgba(99,102,241,0.22)" : "rgba(255,255,255,0.07)",
    border: `1px solid ${sel ? "rgba(139,92,246,0.85)" : "rgba(255,255,255,0.18)"}`,
    boxShadow: sel ? "0 0 24px rgba(99,102,241,0.35), inset 0 1px 0 rgba(255,255,255,0.1)" : "inset 0 1px 0 rgba(255,255,255,0.05)",
  });

  const ctaText = () => {
    if (step === 2 && interests.length > 0)
      return `Continue with ${interests.length} interest${interests.length > 1 ? "s" : ""} →`;
    if (step === 3 && languages.length === 1)
      return `Continue with ${LANGUAGES.find(l => l.code === languages[0])?.label} →`;
    if (step === 3 && languages.length > 1)
      return `Continue with ${languages.length} languages →`;
    if (step === 4) return "Find a Stranger 🚀";
    return "Continue →";
  };

  const renderCTA = (onClick: () => void, onBack?: () => void) => (
    <div className="w-full flex flex-col gap-2">
      <button onClick={onClick}
        className="w-full py-3.5 rounded-2xl font-bold text-base text-white grad-btn relative overflow-hidden group"
        style={{ boxShadow: "0 8px 32px rgba(99,102,241,0.45)" }}>
        <span className="relative z-10">{ctaText()}</span>
        <span className="absolute inset-0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700"
          style={{ background: "linear-gradient(90deg,transparent,rgba(255,255,255,0.2),transparent)" }} />
      </button>
      <div className="flex items-center justify-between px-1">
        {onBack
          ? <button onClick={onBack} className="text-sm font-medium transition-colors hover:text-slate-300" style={{ color: "#475569" }}>← Back</button>
          : <span />
        }
        <button onClick={skip} className="text-sm font-medium transition-colors hover:text-slate-300" style={{ color: "#475569" }}>Skip →</button>
      </div>
    </div>
  );

  return (
    <div className={`h-full w-full flex flex-col relative overflow-hidden aurora-bg transition-opacity duration-500 ${visible ? "opacity-100" : "opacity-0"}`}>
      <SpaceBg />

      {/* Step progress — simple dots */}
      <div className="relative z-20 pt-4 pb-1 flex justify-center shrink-0">
        <div className="flex items-center gap-2">
          {STEP_LABELS.map((_, i) => {
            const n = i + 1;
            const done = step > n;
            const active = step === n;
            return (
              <div key={n} className="flex items-center gap-2">
                <div className="rounded-full transition-all duration-300"
                  style={{
                    width: active ? 24 : 8,
                    height: 8,
                    background: done ? "#22c55e" : active ? "linear-gradient(90deg,#6366f1,#8b5cf6)" : "rgba(255,255,255,0.12)",
                  }} />
              </div>
            );
          })}
        </div>
      </div>

      <div key={animKey} className="relative z-10 flex flex-col items-center justify-start flex-1 px-4 py-4 step-enter overflow-y-auto" style={{ WebkitOverflowScrolling: "touch" }}>

        {/* STEP 1 */}
        {step === 1 && (
          <>
            <h1 className="text-2xl sm:text-4xl font-black text-white mb-1 text-center">Who are you? 🙋</h1>
            <p className="text-sm mb-6 text-center" style={{ color: "#64748b" }}>Help us find the right match.</p>
            <div className="w-full max-w-lg space-y-8">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider mb-3 text-center" style={{ color: "#475569" }}>I am a</p>
                <div className="grid grid-cols-3 gap-3">
                  {GENDERS.map(g => (
                    <button key={g.value} onClick={() => setGender(g.value)}
                      className="relative flex flex-col items-center gap-2 py-4 sm:py-5 rounded-2xl transition-all duration-200 hover:scale-105 active:scale-95"
                      style={cardStyle(gender === g.value)}>
                      {gender === g.value && <CheckBadge />}
                      <span className="text-4xl">{g.icon}</span>
                      <span className="text-sm font-bold" style={{ color: gender === g.value ? "#c4b5fd" : "#e2e8f0" }}>{g.label}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider mb-3 text-center" style={{ color: "#475569" }}>I want to chat with</p>
                <div className="grid grid-cols-3 gap-3">
                  {PREFS.map(p => (
                    <button key={p.value} onClick={() => setPref(p.value)}
                      className="relative flex flex-col items-center gap-2 py-4 sm:py-5 rounded-2xl transition-all duration-200 hover:scale-105 active:scale-95"
                      style={cardStyle(pref === p.value)}>
                      {pref === p.value && <CheckBadge />}
                      <span className="text-4xl">{p.icon}</span>
                      <span className="text-sm font-bold" style={{ color: pref === p.value ? "#c4b5fd" : "#e2e8f0" }}>{p.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="w-full max-w-lg mt-6">
              <button onClick={next} disabled={!gender || !pref}
                className="w-full py-3.5 rounded-2xl font-bold text-base text-white grad-btn relative overflow-hidden group disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ boxShadow: "0 8px 32px rgba(99,102,241,0.45)" }}>
                <span className="relative z-10">Continue →</span>
                <span className="absolute inset-0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700"
                  style={{ background: "linear-gradient(90deg,transparent,rgba(255,255,255,0.2),transparent)" }} />
              </button>
            </div>
          </>
        )}

        {/* STEP 2 */}
        {step === 2 && (
          <>
            <h1 className="text-2xl sm:text-4xl font-black text-white mb-1 text-center">What's your thing? ✨</h1>
            <p className="text-sm mb-5 text-center" style={{ color: "#64748b" }}>Pick any — we'll match you with people who share them.</p>
            <div className="w-full max-w-2xl grid grid-cols-2 sm:grid-cols-4 gap-3">
              {INTERESTS.map(item => {
                const sel = interests.includes(item.label);
                return (
                  <button key={item.label} onClick={() => setInterests(p => toggle(p, item.label))}
                    className="relative flex flex-col items-center gap-2 py-4 sm:py-5 rounded-2xl transition-all duration-200 hover:scale-105 active:scale-95"
                    style={cardStyle(sel)}>
                    {sel && <CheckBadge />}
                    <span className="text-3xl">{item.icon}</span>
                    <span className="text-xs font-bold" style={{ color: sel ? "#c4b5fd" : "#94a3b8" }}>{item.label}</span>
                  </button>
                );
              })}
            </div>
            <div className="w-full max-w-2xl mt-6">
              {renderCTA(next, () => goTo(1))}
            </div>
          </>
        )}

        {/* STEP 3 */}
        {step === 3 && (
          <>
            <h1 className="text-2xl sm:text-4xl font-black text-white mb-1 text-center">Speak my language 🗣️</h1>
            <p className="text-sm mb-5 text-center" style={{ color: "#64748b" }}>Pick one to match with people who speak it.</p>
            <div className="w-full max-w-2xl grid grid-cols-2 sm:grid-cols-4 gap-3">
              {LANGUAGES.map(lang => {
                const sel = languages.includes(lang.code);
                return (
                  <button key={lang.code} onClick={() => setLanguages(p => toggle(p, lang.code))}
                    className="relative flex flex-col items-center gap-2 py-4 sm:py-5 rounded-2xl transition-all duration-200 hover:scale-105 active:scale-95"
                    style={cardStyle(sel)}>
                    {sel && <CheckBadge />}
                    <span className="text-2xl font-black" style={{ color: sel ? "#c4b5fd" : "#94a3b8" }}>{lang.icon}</span>
                    <span className="text-xs font-bold" style={{ color: sel ? "#c4b5fd" : "#94a3b8" }}>{lang.label}</span>
                  </button>
                );
              })}
            </div>
            <div className="w-full max-w-2xl mt-6">
              {renderCTA(next, () => goTo(2))}
            </div>
          </>
        )}

        {/* STEP 4 */}
        {step === 4 && (
          <>
            <h1 className="text-2xl sm:text-4xl font-black text-white mb-1 text-center">What's your mood? ✦</h1>
            <p className="text-sm mb-5 text-center" style={{ color: "#64748b" }}>Let strangers know your energy.</p>
            <div className="w-full max-w-2xl grid grid-cols-2 sm:grid-cols-4 gap-3">
              {VIBES.map(vibe => {
                const sel = vibes.includes(vibe.code);
                return (
                  <button key={vibe.code} onClick={() => setVibes(p => toggle(p, vibe.code))}
                    className="relative flex flex-col items-center gap-2 py-4 sm:py-5 px-2 rounded-2xl transition-all duration-200 hover:scale-105 active:scale-95"
                    style={cardStyle(sel)}>
                    {sel && <CheckBadge />}
                    <span className="text-3xl">{vibe.icon}</span>
                    <span className="text-sm font-bold text-center" style={{ color: sel ? "#c4b5fd" : "#e2e8f0" }}>{vibe.label}</span>
                    <span className="text-xs text-center" style={{ color: "#475569" }}>{vibe.desc}</span>
                  </button>
                );
              })}
            </div>
            <div className="w-full max-w-2xl mt-6">
              {renderCTA(next, () => goTo(3))}
            </div>
          </>
        )}

      </div>
    </div>
  );
}
