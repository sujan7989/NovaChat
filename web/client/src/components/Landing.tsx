import { useEffect, useState, useRef } from "react";
import { ArrowRight, Shield, Zap, Globe } from "lucide-react";
import socket, { apiUrl } from "../socket";
import { Button, StatusDot, Wordmark } from "./ui";

interface Props {
  onStart: () => void;
}

const TRUST = [
  { icon: Shield, label: "Anonymous" },
  { icon: Zap, label: "No signup" },
  { icon: Globe, label: "Global" },
];

export default function Landing({ onStart }: Props) {
  const [stats, setStats] = useState({ total_matches: 0, active_chats: 0, online: 0 });
  const [visible, setVisible] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const countRef = useRef(0);
  const [displayOnline, setDisplayOnline] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 60);

    const load = () =>
      fetch(apiUrl("/api/stats"))
        .then((r) => r.json())
        .then(setStats)
        .catch(() => {});
    load();
    const iv = setInterval(load, 15000);

    const onCount = ({ count }: { count: number }) =>
      setStats((s) => ({ ...s, online: count }));
    socket.on("online_count", onCount);

    return () => {
      clearTimeout(t);
      clearInterval(iv);
      socket.off("online_count", onCount);
    };
  }, []);

  // Smoothly count up to the live online figure.
  useEffect(() => {
    const target = stats.online;
    if (target === countRef.current) return;
    const diff = target - countRef.current;
    const steps = 20;
    const step = diff / steps;
    let i = 0;
    const iv = setInterval(() => {
      i++;
      countRef.current = i >= steps ? target : Math.round(countRef.current + step);
      setDisplayOnline(countRef.current);
      if (i >= steps) clearInterval(iv);
    }, 40);
    return () => clearInterval(iv);
  }, [stats.online]);

  const handleStart = () => {
    if (leaving) return;
    setLeaving(true);
    setTimeout(onStart, 320);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" && !leaving) handleStart();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leaving]);

  return (
    <div className="relative h-full w-full flex items-center justify-center overflow-hidden bg-bg">
      {/* Aurora glass backdrop */}
      <div className="absolute inset-0 aurora pointer-events-none" />
      <div className="absolute inset-0 grid-fade pointer-events-none" />
      <div className="absolute inset-0 noise pointer-events-none" />

      <div
        className={`relative z-10 flex w-full max-w-lg flex-col items-center px-6 text-center transition-all duration-500 ${
          visible && !leaving
            ? "opacity-100 translate-y-0"
            : leaving
              ? "opacity-0 -translate-y-6 scale-[0.98]"
              : "opacity-0 translate-y-4"
        }`}
      >
        {/* Live presence pill */}
        <div className="mb-8 flex items-center gap-2 rounded-full glass px-3.5 py-1.5">
          <StatusDot />
          <span className="text-[13px] font-medium text-fg-muted tabular-nums">
            <span className="text-fg">{displayOnline.toLocaleString()}</span> online now
          </span>
        </div>

        <Wordmark size={44} className="mb-7" />

        <h1 className="text-[34px] font-semibold leading-[1.08] tracking-[-0.03em] sm:text-[44px]">
          <span className="text-gradient">Talk to someone</span>
          <br />
          <span className="text-fg-subtle">in seconds.</span>
        </h1>

        <p className="mt-4 max-w-sm text-[15px] leading-relaxed text-fg-muted">
          Anonymous one-on-one chat with strangers worldwide. No account, no name, no history.
        </p>

        <div className="mt-9 w-full max-w-xs">
          <Button size="lg" className="w-full group" onClick={handleStart}>
            Start chatting
            <ArrowRight
              size={17}
              className="transition-transform duration-200 group-hover:translate-x-0.5"
            />
          </Button>
        </div>

        {/* Trust row */}
        <div className="mt-8 flex items-center gap-5 rounded-full glass px-5 py-2">
          {TRUST.map(({ icon: Icon, label }) => (
            <div key={label} className="flex items-center gap-1.5 text-fg-muted">
              <Icon size={14} strokeWidth={2} className="text-accent-hover" />
              <span className="text-xs font-medium">{label}</span>
            </div>
          ))}
        </div>

        <div className="mt-10 hidden items-center gap-3 sm:flex">
          <span className="h-px w-6 bg-line-strong" />
          <kbd className="rounded border border-white/[0.09] bg-white/[0.05] px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-fg-subtle">
            Enter
          </kbd>
          <span className="h-px w-6 bg-line-strong" />
        </div>
      </div>

      <p className="absolute bottom-5 z-10 px-6 text-center text-[11px] text-fg-subtle/70">
        Be respectful. Abuse results in a ban.
      </p>
    </div>
  );
}
