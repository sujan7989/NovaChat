import { useEffect, useState, useRef } from "react";
import socket from "../socket";

interface Props {
  onStart: () => void;
}

function lcg(s: number) {
  return (s * 9301 + 49297) % 233280;
}
function frac(s: number) {
  return s / 233280;
}

function DeepSpaceBg() {
  const stars = Array.from({ length: 340 }, (_, i) => {
    let s = lcg(i + 7);
    const x = frac(s) * 100; s = lcg(s);
    const y = frac(s) * 100; s = lcg(s);
    const size = frac(s) * 2.2 + 0.3; s = lcg(s);
    const opacity = frac(s) * 0.7 + 0.15; s = lcg(s);
    const dur = frac(s) * 5 + 2; s = lcg(s);
    const delay = frac(s) * 9;
    const colors = ["#ffffff","#f9a8d4","#e879f9","#c084fc","#ffffff","#f472b6","#ffffff","#d8b4fe","#ffffff","#fb7185"];
    return { x, y, size, opacity, dur, delay, color: colors[i % colors.length] };
  });

  const meteors = Array.from({ length: 8 }, (_, i) => {
    let s = lcg((i + 1) * 113);
    const top = frac(s) * 60; s = lcg(s);
    const left = frac(s) * 75; s = lcg(s);
    const delay = frac(s) * 14 + i * 2.5;
    const dur = frac(lcg(s)) * 1.2 + 1.0;
    return { top, left, delay, dur };
  });

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {stars.map((s, i) => (
        <div
          key={i}
          className="absolute rounded-full"
          style={{
            left: `${s.x}%`,
            top: `${s.y}%`,
            width: `${s.size}px`,
            height: `${s.size}px`,
            background: s.color,
            opacity: s.opacity,
            animation: `starTwinkle ${s.dur}s ease-in-out ${s.delay}s infinite`,
          }}
        />
      ))}
      {meteors.map((m, i) => (
        <div
          key={`m${i}`}
          className="absolute"
          style={{
            top: `${m.top}%`,
            left: `${m.left}%`,
            height: "1.5px",
            width: 0,
            background: "linear-gradient(90deg,rgba(255,255,255,0) 0%,rgba(240,160,255,0.95) 50%,white 100%)",
            animation: `shootingStar ${m.dur}s ease-out ${m.delay}s infinite`,
            transformOrigin: "left center",
          }}
        />
      ))}
      <div className="absolute" style={{ top: "-5%", left: "-5%", width: 700, height: 700, background: "radial-gradient(circle,rgba(130,40,200,0.4) 0%,rgba(90,20,160,0.15) 30%,rgba(60,10,120,0.05) 60%,transparent 100%)", filter: "blur(60px)", animation: "auroraShift 24s ease-in-out infinite" }} />
      <div className="absolute" style={{ top: "10%", right: "-8%", width: 600, height: 600, background: "radial-gradient(circle,rgba(200,30,140,0.35) 0%,rgba(160,20,120,0.12) 35%,rgba(100,10,80,0.03) 65%,transparent 100%)", filter: "blur(65px)", animation: "auroraShift2 20s ease-in-out infinite" }} />
      <div className="absolute" style={{ bottom: "0%", left: "5%", width: 500, height: 500, background: "radial-gradient(circle,rgba(110,30,190,0.3) 0%,rgba(80,10,150,0.1) 40%,rgba(40,5,100,0.02) 70%,transparent 100%)", filter: "blur(55px)", animation: "auroraShift 30s ease-in-out 8s infinite" }} />
      <div className="absolute" style={{ bottom: "5%", right: "5%", width: 450, height: 450, background: "radial-gradient(circle,rgba(220,50,150,0.25) 0%,rgba(180,30,120,0.08) 45%,rgba(120,15,80,0.02) 75%,transparent 100%)", filter: "blur(55px)", animation: "auroraShift2 26s ease-in-out 4s infinite" }} />
      <div className="absolute" style={{ bottom: "8%", left: "50%", transform: "translateX(-50%)", width: "80%", height: 180, background: "radial-gradient(ellipse,rgba(180,50,255,0.4) 0%,rgba(240,60,180,0.2) 35%,rgba(200,40,140,0.05) 60%,transparent 100%)", filter: "blur(40px)" }} />
      <div className="absolute" style={{ top: "20%", left: "50%", transform: "translateX(-50%)", width: 500, height: 500, background: "radial-gradient(circle,rgba(140,60,220,0.15) 0%,rgba(100,30,180,0.05) 40%,rgba(60,15,120,0.01) 70%,transparent 100%)", filter: "blur(45px)" }} />
    </div>
  );
}

export default function Landing({ onStart }: Props) {
  const [stats, setStats] = useState({ total_matches: 0, active_chats: 0, online: 0 });
  const [visible, setVisible] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const countRef = useRef(0);
  const [displayOnline, setDisplayOnline] = useState(0);

  useEffect(() => {
    setTimeout(() => setVisible(true), 80);
    const base = import.meta.env.VITE_API_URL || "https://novachat-production-57d2.up.railway.app";
    const load = () =>
      fetch(`${base}/api/stats`)
        .then((r) => r.json())
        .then(setStats)
        .catch(() => {});
    load();
    const iv = setInterval(load, 15000);
    socket.connect();
    socket.on("online_count", ({ count }: { count: number }) => {
      setStats((s) => ({ ...s, online: count }));
    });
    return () => {
      clearInterval(iv);
      socket.off("online_count");
      socket.disconnect();
    };
  }, []);

  useEffect(() => {
    const target = stats.online;
    if (target === countRef.current) return;
    const diff = target - countRef.current;
    const steps = 24;
    const step = diff / steps;
    let i = 0;
    const iv = setInterval(() => {
      i++;
      countRef.current = Math.round(countRef.current + step);
      if (i >= steps) {
        countRef.current = target;
        clearInterval(iv);
      }
      setDisplayOnline(countRef.current);
    }, 35);
    return () => clearInterval(iv);
  }, [stats.online]);

  const handleStart = () => {
    setLeaving(true);
    setTimeout(onStart, 380);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" && !leaving) handleStart();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [leaving]);

  const features = [
    { icon: "💬", label: "Text Chat" },
    { icon: "🖼️", label: "Images" },
    { icon: "🔴", label: "Live Video" },
    { icon: "🎯", label: "Smart Match" },
  ];

  return (
    <div
      className="h-full w-full flex items-center justify-center relative overflow-hidden"
      style={{ background: "radial-gradient(ellipse at 50% 30%, #1a0530 0%, #0d0118 45%, #060010 100%)" }}
    >
      <DeepSpaceBg />

      <div
        className={`relative z-10 flex flex-col items-center text-center px-5 max-w-xl w-full transition-all duration-500 ease-in-out ${
          visible && !leaving
            ? "opacity-100 translate-y-0"
            : leaving
            ? "opacity-0 -translate-y-8 scale-95"
            : "opacity-0 translate-y-10"
        }`}
      >
        <div
          className="flex items-center gap-2 px-4 py-1.5 rounded-full mb-3"
          style={{
            background: "rgba(255,255,255,0.08)",
            border: "1px solid rgba(255,255,255,0.15)",
            backdropFilter: "blur(16px)",
            boxShadow: "0 0 24px rgba(180,80,255,0.2), inset 0 1px 0 rgba(255,255,255,0.1)",
          }}
        >
          <span
            className="w-2 h-2 rounded-full bg-green-400 animate-pulse shrink-0"
            style={{ boxShadow: "0 0 8px rgba(74,222,128,0.8)" }}
          />
          <span className="text-white font-semibold text-xs sm:text-sm">
            {displayOnline.toLocaleString()} people online now
          </span>
        </div>

        <div className="relative mb-2 select-none">
          <div
            className="absolute rounded-full"
            style={{
              inset: "-30px",
              background: "radial-gradient(circle,rgba(180,60,255,0.5) 0%,rgba(240,60,180,0.2) 45%,transparent 70%)",
              filter: "blur(30px)",
              animation: "glowPulse 3s ease-in-out infinite",
            }}
          />
          <div
            className="relative z-10 animate-float"
            style={{
              fontSize: "clamp(64px, 18vw, 110px)",
              lineHeight: 1,
              filter: "drop-shadow(0 0 40px rgba(200,80,255,0.9)) drop-shadow(0 0 80px rgba(160,40,220,0.6)) drop-shadow(0 24px 48px rgba(0,0,0,0.7))",
            }}
          >
            👻
          </div>
        </div>

        <h1
          className="font-black tracking-tight mb-2 leading-none"
          style={{
            fontSize: "clamp(2.8rem,10vw,6.5rem)",
            background: "linear-gradient(135deg,#a855f7 0%,#c084fc 25%,#e879f9 55%,#f472b6 80%,#fb7185 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
            filter: "drop-shadow(0 0 40px rgba(192,132,252,0.5))",
            letterSpacing: "-0.02em",
          }}
        >
          NovaChat
        </h1>

        <p
          className="text-sm leading-relaxed mb-5"
          style={{ color: "rgba(255,255,255,0.55)", maxWidth: 340 }}
        >
          Modern anonymous chat with strangers.
          <br />
          No account. No name. Just connections.
        </p>

        <div className="flex flex-wrap justify-center gap-1.5 mb-5">
          {features.map((f) => (
            <div
              key={f.label}
              className="flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold"
              style={{
                background: "rgba(255,255,255,0.07)",
                border: "1px solid rgba(255,255,255,0.12)",
                color: "rgba(255,255,255,0.75)",
                backdropFilter: "blur(8px)",
              }}
            >
              <span>{f.icon}</span>
              <span>{f.label}</span>
            </div>
          ))}
        </div>

        <div className="relative w-full max-w-sm mb-4">
          <div
            className="absolute inset-0 rounded-full"
            style={{
              background: "linear-gradient(135deg,#7c3aed,#db2777)",
              filter: "blur(20px)",
              opacity: 0.75,
              transform: "scaleY(0.55) translateY(14px)",
            }}
          />
          <button
            onClick={handleStart}
            className="relative w-full py-4 rounded-full font-black text-lg text-white overflow-hidden group transition-all hover:scale-[1.03] active:scale-[0.98]"
            style={{
              background: "linear-gradient(135deg,#6d28d9 0%,#9333ea 40%,#be185d 100%)",
              boxShadow: "0 0 0 1.5px rgba(168,85,247,0.6), 0 8px 40px rgba(124,58,237,0.6)",
            }}
          >
            <span className="relative z-10 flex items-center justify-center gap-2">
              ✦ Start Chatting →
            </span>
            <span
              className="absolute inset-0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700"
              style={{ background: "linear-gradient(90deg,transparent,rgba(255,255,255,0.2),transparent)" }}
            />
          </button>
        </div>

        <div className="flex items-center gap-3 text-xs font-semibold flex-wrap justify-center">
          <span className="flex items-center gap-1" style={{ color: "rgba(255,255,255,0.4)" }}>
            <span>🔒</span><span>100% Anonymous</span>
          </span>
          <span className="w-px h-3" style={{ background: "rgba(255,255,255,0.12)" }} />
          <span className="flex items-center gap-1" style={{ color: "rgba(255,255,255,0.4)" }}>
            <span>⚡</span><span>No signup needed</span>
          </span>
          <span className="w-px h-3" style={{ background: "rgba(255,255,255,0.12)" }} />
          <span className="flex items-center gap-1" style={{ color: "rgba(255,255,255,0.4)" }}>
            <span>🌍</span><span>Meet the world</span>
          </span>
        </div>

        <div className="mt-4 hidden sm:flex items-center gap-2" style={{ opacity: 0.3 }}>
          <div style={{ height: 1, width: 28, background: "rgba(255,255,255,0.2)" }} />
          <span style={{ fontSize: 10, color: "rgba(255,255,255,0.6)", letterSpacing: "0.12em", fontWeight: 500 }}>
            or press enter
          </span>
          <div style={{ height: 1, width: 28, background: "rgba(255,255,255,0.2)" }} />
        </div>
      </div>

      <p className="absolute bottom-3 text-xs z-10" style={{ color: "rgba(255,255,255,0.12)" }}>
        By using NovaChat you agree to be respectful. Abuse = ban.
      </p>
    </div>
  );
}
