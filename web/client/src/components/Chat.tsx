import { useState, useEffect, useRef, useCallback, memo } from "react";
import { v4 as uuidv4 } from "uuid";
import socket from "../socket";
import type { Message, UserProfile } from "../types";
import { useWebRTC } from "../useWebRTC";
import VideoCall from "./VideoCall";

interface Props { profile: UserProfile; onStop: () => void; }

// ── Toast system ──────────────────────────────────────────────────────────────
type ToastType = "info" | "error" | "success" | "warn";
interface Toast { id: string; msg: string; type: ToastType; }

function ToastItem({ toast, onRemove }: { toast: Toast; onRemove: (id: string) => void }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const t1 = setTimeout(() => setVisible(true), 20);
    const t2 = setTimeout(() => { setVisible(false); setTimeout(() => onRemove(toast.id), 350); }, 3200);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [toast.id, onRemove]);

  const colors: Record<ToastType, { bg: string; border: string; icon: string }> = {
    info:    { bg: "rgba(99,102,241,0.18)",  border: "rgba(99,102,241,0.45)",  icon: "ℹ️" },
    error:   { bg: "rgba(239,68,68,0.18)",   border: "rgba(239,68,68,0.45)",   icon: "⚠️" },
    success: { bg: "rgba(34,197,94,0.18)",   border: "rgba(34,197,94,0.45)",   icon: "✅" },
    warn:    { bg: "rgba(251,191,36,0.18)",  border: "rgba(251,191,36,0.45)",  icon: "⚡" },
  };
  const c = colors[toast.type];

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: "10px 16px", borderRadius: 14, maxWidth: 320,
      background: c.bg, border: `1px solid ${c.border}`,
      backdropFilter: "blur(20px)",
      boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
      opacity: visible ? 1 : 0,
      transform: visible ? "translateY(0) scale(1)" : "translateY(12px) scale(0.95)",
      transition: "opacity 0.3s cubic-bezier(.16,1,.3,1), transform 0.3s cubic-bezier(.16,1,.3,1)",
    }}>
      <span style={{ fontSize: 16 }}>{c.icon}</span>
      <span style={{ color: "#e2e8f0", fontSize: 13, fontWeight: 600, flex: 1 }}>{toast.msg}</span>
      <button onClick={() => onRemove(toast.id)} style={{ color: "#475569", fontSize: 16, lineHeight: 1, background: "none", border: "none", cursor: "pointer" }}>×</button>
    </div>
  );
}

function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const show = useCallback((msg: string, type: ToastType = "info") => {
    setToasts(p => [...p, { id: uuidv4(), msg, type }]);
  }, []);
  const remove = useCallback((id: string) => setToasts(p => p.filter(t => t.id !== id)), []);
  return { toasts, show, remove };
}

function playPing() {
  try {
    const ctx = new AudioContext();
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.frequency.value = 880; o.type = "sine";
    g.gain.setValueAtTime(0.12, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    o.start(); o.stop(ctx.currentTime + 0.4);
  } catch {}
}

function playSend() {
  try {
    const ctx = new AudioContext();
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.frequency.value = 660; o.type = "sine";
    g.gain.setValueAtTime(0.06, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
    o.start(); o.stop(ctx.currentTime + 0.18);
  } catch {}
}

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

const EMOJIS = ["😂","😍","🔥","👍","❤️","😭","🤣","😊","🙏","💀","😎","🥺","😅","🤔","💯","✨","🎉","👀","😤","🫡","🤩","😈","🫶","🤯"];

function lcg(s: number) { return (s * 9301 + 49297) % 233280; }

function OrbitalSearch() {
  return (
    <div className="relative flex items-center justify-center" style={{ width:140, height:140 }}>
      <div className="absolute rounded-full" style={{ width:140,height:140,border:"1px solid rgba(99,102,241,0.2)" }} />
      <div className="absolute rounded-full" style={{ width:100,height:100,border:"1px solid rgba(99,102,241,0.3)" }} />
      <div className="absolute rounded-full" style={{
        width:64,height:64,
        background:"radial-gradient(circle,rgba(99,102,241,0.25) 0%,rgba(139,92,246,0.15) 100%)",
        border:"1px solid rgba(99,102,241,0.4)",boxShadow:"0 0 20px rgba(99,102,241,0.3)",
      }} />
      <div className="absolute rounded-full" style={{
        width:12,height:12,
        background:"radial-gradient(circle,#a5b4fc,#6366f1)",
        boxShadow:"0 0 12px rgba(99,102,241,0.8)",
      }} />
      <div className="absolute rounded-full" style={{
        width:8,height:8,
        background:"radial-gradient(circle,#f9a8d4,#ec4899)",
        boxShadow:"0 0 8px rgba(236,72,153,0.8)",
        animation:"orbitDot 3s linear infinite",
      }} />
      <div className="absolute rounded-full" style={{
        width:6,height:6,
        background:"radial-gradient(circle,#a5b4fc,#818cf8)",
        boxShadow:"0 0 6px rgba(129,140,248,0.8)",
        animation:"orbitDot2 4.5s linear infinite",
      }} />
    </div>
  );
}

const StarField = memo(function StarField({ count, offset = 0 }: { count: number; offset?: number }) {
  const stars = Array.from({ length: count }, (_, i) => {
    let s = lcg(i + offset + 1);
    const x = (s / 233280) * 100; s = lcg(s);
    const y = (s / 233280) * 100; s = lcg(s);
    const size = (s / 233280) * 2.2 + 0.8; s = lcg(s);
    const opacity = (s / 233280) * 0.55 + 0.25; s = lcg(s);
    const dur = (s / 233280) * 4 + 2.5; s = lcg(s);
    const delay = (s / 233280) * 6;
    const colors = ["#ffffff","#c084fc","#818cf8","#f472b6","#ffffff","#a5b4fc"];
    return { x, y, size, opacity, dur, delay, color: colors[i % colors.length] };
  });
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {stars.map((s, i) => (
        <div key={i} className="absolute rounded-full" style={{
          left:`${s.x}%`, top:`${s.y}%`,
          width:`${s.size}px`, height:`${s.size}px`,
          background:s.color, opacity:s.opacity,
          animation:`starTwinkle ${s.dur}s ease-in-out ${s.delay}s infinite`,
        }} />
      ))}
    </div>
  );
});

/** Animated 3-dot typing indicator */
function TypingDots() {
  return (
    <div className="flex items-center gap-1 px-3 py-2 rounded-2xl" style={{
      background:"rgba(99,102,241,0.12)", border:"1px solid rgba(99,102,241,0.2)", display:"inline-flex"
    }}>
      {[0,1,2].map(i => (
        <div key={i} className="typing-dot rounded-full" style={{
          width:6, height:6, background:"#818cf8",
          animationDelay:`${i * 0.2}s`,
        }} />
      ))}
    </div>
  );
}

/** Match found flash overlay */
function MatchFlash({ onDone }: { onDone: () => void }) {
  useEffect(() => { const t = setTimeout(onDone, 1800); return () => clearTimeout(t); }, [onDone]);
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center pointer-events-none">
      {/* Expanding rings */}
      {[0,1,2].map(i => (
        <div key={i} className="absolute rounded-full match-ring" style={{
          width:80, height:80,
          border:"2px solid rgba(99,102,241,0.6)",
          animationDelay:`${i * 0.25}s`,
        }} />
      ))}
      <div className="match-flash flex flex-col items-center gap-2 px-8 py-5 rounded-3xl"
        style={{ background:"rgba(13,13,26,0.95)", border:"1px solid rgba(99,102,241,0.4)", boxShadow:"0 0 60px rgba(99,102,241,0.4)" }}>
        <div className="text-4xl">🎯</div>
        <p className="text-white font-black text-lg">Stranger Found!</p>
        <p className="text-xs" style={{ color:"#818cf8" }}>Say hello 👋</p>
      </div>
    </div>
  );
}

export default function Chat({ profile, onStop }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<"searching" | "chatting" | "stopped">("searching");
  const [strangerTyping, setStrangerTyping] = useState(false);
  const [showVideo, setShowVideo] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [showMatchFlash, setShowMatchFlash] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const soundOnRef = useRef(true);
  const [chatKey, setChatKey] = useState(0);
  const [reconnecting, setReconnecting] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showRating, setShowRating] = useState(false);
  const [ratingDone, setRatingDone] = useState(false);
  const [chatSummary, setChatSummary] = useState<string | null>(null);
  // Detect if desktop (>=768px) — sidebar always visible on desktop
  const [isDesktop, setIsDesktop] = useState(() => window.innerWidth >= 768);
  useEffect(() => {
    const handler = () => setIsDesktop(window.innerWidth >= 768);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);
  const bottomRef = useRef<HTMLDivElement>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { toasts, show: showToast, remove: removeToast } = useToast();

  const { localStream, remoteStream, callError, startCall, handleOffer, handleAnswer, handleIce, endCall, cleanup } = useWebRTC(profile.userId);

  const addMsg = useCallback((msg: Omit<Message, "id" | "timestamp">) => {
    setMessages(prev => [...prev, { ...msg, id: uuidv4(), timestamp: Date.now() }]);
  }, []);

  useEffect(() => {
    socket.on("queued", () => setStatus("searching"));
    socket.on("matched", ({ shared, partnerVibes, icebreaker }: { shared: string[]; partnerVibes?: string[]; icebreaker?: string }) => {
      setStatus("chatting"); setMessages([]); setChatKey(k => k + 1);
      setShowMatchFlash(true);
      if (soundOnRef.current) playPing();
      const vibeMsg = partnerVibes?.length ? ` · Vibe: ${partnerVibes.join(", ")}` : "";
      const txt = shared.length ? `🎯 You both like: ${shared.join(", ")}${vibeMsg}`
        : partnerVibes?.length ? `👋 You're connected! Stranger's vibe: ${partnerVibes.join(", ")}`
        : "👋 You're connected! Say something...";
      addMsg({ from: "stranger", type: "text", text: txt });
      if (icebreaker) {
        setTimeout(() => addMsg({ from: "stranger", type: "text", text: `🤖 Icebreaker: ${icebreaker}` }), 800);
      }
      setTimeout(() => inputRef.current?.focus(), 200);
    });
    socket.on("message", ({ text }: { text: string }) => { setStrangerTyping(false); addMsg({ from: "stranger", type: "text", text }); });
    socket.on("image", ({ dataUrl, caption }: { dataUrl: string; caption?: string }) => addMsg({ from: "stranger", type: "image", dataUrl, caption }));
    socket.on("typing", ({ isTyping }: { isTyping: boolean }) => setStrangerTyping(isTyping));
    socket.on("stranger_left", () => {
      setStatus("stopped"); cleanup(); setShowVideo(false);
      addMsg({ from: "stranger", type: "text", text: "👻 Stranger has left the chat." });
      setShowRating(true);
      // Send messages to server for AI summary
      socket.emit("submit_for_summary", { userId: profile.userId, messages: messages });
    });
    socket.on("chat_summary", ({ summary }: { summary: string }) => {
      setChatSummary(summary);
    });
    socket.on("stopped", () => { setStatus("stopped"); cleanup(); setShowVideo(false); });
    socket.on("banned", () => addMsg({ from: "stranger", type: "text", text: "⚠️ You've been banned for violations." }));
    socket.on("webrtc:offer", ({ offer }: { offer: RTCSessionDescriptionInit }) => { handleOffer(offer); setShowVideo(true); });
    socket.on("webrtc:answer", ({ answer }: { answer: RTCSessionDescriptionInit }) => handleAnswer(answer));
    socket.on("webrtc:ice", ({ candidate }: { candidate: RTCIceCandidateInit }) => handleIce(candidate));
    socket.on("webrtc:end", () => { cleanup(); setShowVideo(false); });
    // Also end call if socket disconnects
    socket.on("disconnect", () => { if (showVideo) { cleanup(); setShowVideo(false); } });
    socket.on("message_delivered", ({ text }: { text: string }) => {
      setMessages(prev => {
        const idx = [...prev].reverse().findIndex(m => m.from === "me" && m.text === text);
        if (idx === -1) return prev;
        const realIdx = prev.length - 1 - idx;
        return prev.map((m, i) => i === realIdx ? { ...m, delivered: true } : m);
      });
    });
    socket.on("moderation_warning", ({ msg }: { msg: string }) => {
      showToast(msg, "warn");
    });
    socket.connect();
    socket.on("disconnect", () => { setReconnecting(true); });
    socket.on("connect", () => {
      setReconnecting(prev => {
        if (prev) {
          showToast("Reconnected to server", "success");
          // Re-emit find after reconnect so user gets back into queue
          socket.emit("find", { ...profile, languages: profile.languages, vibes: profile.vibes });
        }
        return false;
      });
    });
    socket.io.on("reconnect_attempt", () => setReconnecting(true));
    socket.io.on("reconnect", () => {
      setReconnecting(false);
      showToast("Reconnected to server", "success");
    });
    const emitFind = () => socket.emit("find", { ...profile, languages: profile.languages, vibes: profile.vibes });
    if (socket.connected) emitFind(); else socket.once("connect", emitFind);
    return () => {
      socket.off("connect", emitFind);
      ["queued","matched","message","image","typing","stranger_left","stopped","banned",
       "webrtc:offer","webrtc:answer","webrtc:ice","webrtc:end","disconnect"].forEach(e => socket.off(e));
      socket.io.off("reconnect_attempt");
      socket.io.off("reconnect");
      socket.disconnect();
    };
  }, []);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, strangerTyping]);

  const sendMessage = () => {
    if (!input.trim() || status !== "chatting") return;
    socket.emit("message", { userId: profile.userId, text: input.trim() });
    addMsg({ from: "me", type: "text", text: input.trim() });
    if (soundOnRef.current) playSend();
    setInput(""); setShowEmoji(false);
    socket.emit("typing", { userId: profile.userId, isTyping: false });
  };

  const handleTyping = (val: string) => {
    setInput(val);
    socket.emit("typing", { userId: profile.userId, isTyping: true });
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => socket.emit("typing", { userId: profile.userId, isTyping: false }), 1500);
  };

  const sendImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || status !== "chatting") return;
    if (file.size > 5 * 1024 * 1024) { showToast("Image too large — max 5MB", "error"); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      socket.emit("image", { userId: profile.userId, dataUrl });
      addMsg({ from: "me", type: "image", dataUrl });
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleNext = () => {
    cleanup(); setShowVideo(false); setShowEmoji(false);
    setShowRating(false); setRatingDone(false); setChatSummary(null);
    socket.emit("next", { ...profile, languages: profile.languages, vibes: profile.vibes });
    setStatus("searching"); setMessages([]);
  };

  const handleStop = () => { cleanup(); setShowVideo(false); socket.emit("stop", { userId: profile.userId }); onStop(); };

  const handleReport = () => {
    socket.emit("report", { userId: profile.userId });
    cleanup(); setShowVideo(false); setStatus("stopped"); setShowReport(false);
    addMsg({ from: "stranger", type: "text", text: "✅ Reported. Thanks for keeping NovaChat safe." });
  };

  const isSystem = (text?: string) =>
    !!text && ["👋","🎯","👻","✅","⚠️"].some(p => text.startsWith(p));

  const BG = "radial-gradient(ellipse at 60% 40%, #0d0820 0%, #07070f 60%, #040410 100%)";
  const PANEL_BG = "#0d0d1a";
  const BORDER = "rgba(255,255,255,0.06)";
  const charLeft = 500 - input.length;

  return (
    <div className="h-full w-full flex relative" style={{ background: BG }}>

      {/* Toast container — top-center on mobile, bottom-right on desktop */}
      <div style={{
        position: "fixed",
        bottom: isDesktop ? 24 : "auto",
        top: isDesktop ? "auto" : 12,
        right: isDesktop ? 24 : "50%",
        transform: isDesktop ? "none" : "translateX(50%)",
        zIndex: 9999,
        display: "flex", flexDirection: "column", gap: 8,
        alignItems: isDesktop ? "flex-end" : "center",
        pointerEvents: "none",
        width: isDesktop ? "auto" : "calc(100vw - 32px)",
        maxWidth: 360,
      }}>
        {toasts.map(t => (
          <div key={t.id} style={{ pointerEvents: "auto", width: "100%" }}>
            <ToastItem toast={t} onRemove={removeToast} />
          </div>
        ))}
      </div>

      {/* Reconnecting banner */}
      {reconnecting && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, zIndex: 9998,
          background: "rgba(251,191,36,0.15)", borderBottom: "1px solid rgba(251,191,36,0.4)",
          backdropFilter: "blur(12px)", padding: "8px 16px",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
        }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#fbbf24", animation: "starTwinkle 1s ease-in-out infinite" }} />
          <span style={{ color: "#fbbf24", fontSize: 13, fontWeight: 700 }}>Reconnecting to server...</span>
        </div>
      )}

      {/* Match flash overlay */}
      {showMatchFlash && <MatchFlash onDone={() => setShowMatchFlash(false)} />}

      {/* Sidebar overlay — mobile only */}
      {sidebarOpen && !isDesktop && (
        <div className="fixed inset-0 z-30" style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
          onClick={() => setSidebarOpen(false)} />
      )}

      {/* ── LEFT PANEL ── */}
      <div className="shrink-0 flex flex-col relative overflow-hidden transition-transform duration-300"
        style={{
          width: 256,
          background: PANEL_BG,
          borderRight: `1px solid ${BORDER}`,
          // Desktop: always visible inline. Mobile: fixed overlay sliding in from left
          position: isDesktop ? "relative" : "fixed",
          top: isDesktop ? undefined : 0,
          bottom: isDesktop ? undefined : 0,
          left: 0,
          zIndex: isDesktop ? "auto" : 40,
          transform: isDesktop ? "none" : sidebarOpen ? "translateX(0)" : "translateX(-100%)",
        }}>
        <StarField count={35} offset={0} />

        {/* Brand header */}
        <div className="relative z-10 flex items-center gap-2.5 px-4 py-3.5" style={{ borderBottom:`1px solid ${BORDER}` }}>
          <div className="w-8 h-8 rounded-xl flex items-center justify-center text-base shrink-0"
            style={{ background:"linear-gradient(135deg,#6366f1,#8b5cf6)" }}>👻</div>
          <div className="min-w-0">
            <p className="text-white text-sm font-bold leading-tight">NovaChat</p>
            <p className="text-xs truncate" style={{ color:"#475569" }}>Anonymous Chat</p>
          </div>
          <div className="ml-auto flex items-center gap-1 shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            <span className="text-xs text-green-400 font-semibold">Live</span>
          </div>
        </div>

        {/* Status row */}
        <div className="relative z-10 px-4 py-3" style={{ borderBottom:`1px solid ${BORDER}` }}>
          <p className="text-sm font-bold" style={{
            color: status === "chatting" ? "#a5b4fc" : status === "searching" ? "#fbbf24" : "#64748b"
          }}>
            {status === "chatting" ? "Connected" : status === "searching" ? "Searching..." : "Disconnected"}
          </p>
          <p className="text-xs mt-0.5" style={{ color:"#475569" }}>
            {status === "chatting" ? "Chatting anonymously" : status === "searching" ? "Finding your stranger..." : "Chat ended"}
          </p>
        </div>

        {/* Center area */}
        <div className="relative z-10 flex-1 flex flex-col items-center justify-center gap-4 px-4">
          {status === "searching" && (
            <>
              <OrbitalSearch />
              <div className="text-center">
                <p className="text-white text-sm font-bold">Finding your stranger</p>
                <p className="text-xs mt-1" style={{ color:"#475569" }}>Usually takes a few seconds</p>
              </div>
            </>
          )}
          {status === "chatting" && (
            <div className="flex flex-col items-center gap-3 animate-scale-in">
              <div className="relative w-16 h-16 rounded-full flex items-center justify-center text-3xl animate-float"
                style={{ background:"linear-gradient(135deg,rgba(99,102,241,0.2),rgba(139,92,246,0.2))", border:"2px solid rgba(99,102,241,0.4)" }}>
                👤
                <span className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-green-400"
                  style={{ border:"2px solid #0d0d1a" }} />
              </div>
              <div className="text-center">
                <p className="text-white text-sm font-bold">Stranger</p>
                <p className="text-xs text-green-400">● Online</p>
              </div>
              <button onClick={() => { setShowVideo(true); startCall(); }}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white w-full justify-center transition-all hover:scale-105"
                style={{ background:"linear-gradient(135deg,#6366f1,#8b5cf6)", boxShadow:"0 4px 16px rgba(99,102,241,0.3)" }}>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.36a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                Video Call
              </button>
            </div>
          )}
          {status === "stopped" && (
            <div className="flex flex-col items-center gap-2 animate-fade-up">
              <div className="text-5xl animate-float">👻</div>
              <p className="text-xs text-center" style={{ color:"#64748b" }}>Chat ended.<br />Find someone new?</p>
            </div>
          )}
        </div>

        {/* Sound toggle + bottom actions */}
        <div className="relative z-10 p-4 space-y-3" style={{ borderTop:`1px solid ${BORDER}` }}>
          <button onClick={handleNext}
            className="next-btn w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-black text-white relative overflow-hidden group">
            <span className="relative z-10 flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
              Skip → Next Stranger
            </span>
            <span className="absolute inset-0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700"
              style={{ background:"linear-gradient(90deg,transparent,rgba(255,255,255,0.2),transparent)" }} />
          </button>
          <div className="grid grid-cols-3 gap-2">
            <button onClick={() => setShowReport(true)}
              className="flex flex-col items-center justify-center gap-1 py-3 rounded-2xl font-bold transition-all hover:scale-105 active:scale-95"
              style={{ background:"rgba(239,68,68,0.12)", border:"1px solid rgba(239,68,68,0.3)", color:"#f87171" }}>
              <span className="text-lg">🚩</span>
              <span className="text-xs">Report</span>
            </button>
            <button onClick={handleStop}
              className="flex flex-col items-center justify-center gap-1 py-3 rounded-2xl font-bold transition-all hover:scale-105 active:scale-95"
              style={{ background:"rgba(100,116,139,0.12)", border:"1px solid rgba(100,116,139,0.3)", color:"#94a3b8" }}>
              <span className="text-lg">⚡</span>
              <span className="text-xs">Leave</span>
            </button>
            <button onClick={() => setSoundOn(p => { soundOnRef.current = !p; return !p; })}
              className="flex flex-col items-center justify-center gap-1 py-3 rounded-2xl font-bold transition-all hover:scale-105 active:scale-95"
              style={{ background:"rgba(99,102,241,0.12)", border:"1px solid rgba(99,102,241,0.3)", color: soundOn ? "#818cf8" : "#475569" }}
              title={soundOn ? "Mute sounds" : "Unmute sounds"}>
              <span className="text-lg">{soundOn ? "🔔" : "🔕"}</span>
              <span className="text-xs">{soundOn ? "Sound" : "Muted"}</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── RIGHT PANEL ── */}
      <div className="flex-1 flex flex-col min-w-0 relative" style={{ minHeight:0 }}>
        {/* Top accent line */}
        <div className="absolute top-0 left-0 right-0 h-px z-20"
          style={{ background:"linear-gradient(90deg,transparent,rgba(139,92,246,0.6),rgba(236,72,153,0.4),transparent)" }} />

        {/* Star field + nebula */}
        <StarField count={80} offset={100} />
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute" style={{ top:"8%",left:"20%",width:420,height:420,
            background:"radial-gradient(ellipse,rgba(99,60,220,0.18) 0%,rgba(80,20,140,0.08) 45%,transparent 70%)",
            filter:"blur(55px)",animation:"auroraShift 24s ease-in-out infinite" }} />
          <div className="absolute" style={{ bottom:"15%",right:"10%",width:500,height:500,
            background:"radial-gradient(ellipse,rgba(180,30,120,0.15) 0%,rgba(120,20,100,0.06) 45%,transparent 70%)",
            filter:"blur(65px)",animation:"auroraShift2 20s ease-in-out infinite" }} />
          <div className="absolute" style={{ top:"45%",left:"5%",width:300,height:300,
            background:"radial-gradient(ellipse,rgba(139,92,246,0.12) 0%,transparent 65%)",
            filter:"blur(40px)" }} />
        </div>

        {/* Chat header */}
        <div className="shrink-0 flex items-center gap-3 px-4 py-3 relative z-10"
          style={{ background:"rgba(255,255,255,0.015)", borderBottom:`1px solid ${BORDER}` }}>
          {/* Menu toggle — mobile only */}
          {!isDesktop && (
          <button className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-all hover:scale-110"
            style={{ background:"rgba(99,102,241,0.15)", border:"1px solid rgba(99,102,241,0.35)" }}
            onClick={() => setSidebarOpen(p => !p)}>
            <svg className="w-5 h-5" style={{ color:"#818cf8" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          )}
          <div className="w-10 h-10 rounded-full flex items-center justify-center text-lg relative shrink-0"
            style={{ background:"linear-gradient(135deg,rgba(99,102,241,0.3),rgba(139,92,246,0.3))", border:"1px solid rgba(99,102,241,0.4)" }}>
            👤
            {status === "chatting" && (
              <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-green-400"
                style={{ border:"2px solid #07070f" }} />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white text-sm font-bold">Stranger</p>
            <p className="text-xs" style={{ color:"#475569" }}>
              {strangerTyping
                ? <span className="text-indigo-400 animate-pulse">typing...</span>
                : status === "chatting" ? "online"
                : status === "searching" ? "connecting..."
                : "offline"}
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Skip button — always visible in header */}
            <button onClick={handleNext}
              className="next-btn flex items-center gap-1 px-2.5 py-2 rounded-xl text-xs font-black text-white relative overflow-hidden group transition-all hover:scale-105 active:scale-95">
              <span className="relative z-10 hidden sm:inline">⏭ Skip</span>
              <span className="relative z-10 sm:hidden">⏭</span>
              <span className="absolute inset-0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700"
                style={{ background:"linear-gradient(90deg,transparent,rgba(255,255,255,0.2),transparent)" }} />
            </button>
            <button onClick={() => { setShowVideo(true); startCall(); }}
              className="w-9 h-9 rounded-xl flex items-center justify-center transition-all hover:scale-110"
              style={{ background:"rgba(99,102,241,0.15)", border:"1px solid rgba(99,102,241,0.35)" }}>
              <svg className="w-4 h-4" style={{ color:"#818cf8" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.36a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </button>
            <button onClick={() => setShowReport(true)}
              className="w-9 h-9 rounded-xl flex items-center justify-center transition-all hover:scale-110"
              style={{ background:"rgba(239,68,68,0.12)", border:"1px solid rgba(239,68,68,0.3)" }}>
              <svg className="w-4 h-4" style={{ color:"#f87171" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6H10.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9" />
              </svg>
            </button>
            <button onClick={handleStop}
              className="w-9 h-9 rounded-xl flex items-center justify-center transition-all hover:scale-110"
              style={{ background:"rgba(100,116,139,0.12)", border:"1px solid rgba(100,116,139,0.3)" }}>
              <svg className="w-4 h-4" style={{ color:"#94a3b8" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          </div>
        </div>

        {/* Messages */}
        <div key={chatKey} className="flex-1 overflow-y-auto px-3 sm:px-5 py-4 space-y-3 relative z-10" style={{ minHeight:0 }}>

          {/* Empty state while searching */}
          {status === "searching" && messages.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center gap-4 animate-fade-up">
              <div className="text-6xl animate-float select-none">🌌</div>
              <p className="text-white font-bold text-lg">Scanning the universe...</p>
              <p className="text-sm" style={{ color:"#475569" }}>A stranger is about to appear</p>
              <div className="flex items-center gap-1.5 mt-2">
                {[0,1,2,3].map(i => (
                  <div key={i} className="sound-bar rounded-full" style={{
                    width:4, height:20,
                    background:"linear-gradient(to top,#6366f1,#c084fc)",
                    animationDelay:`${i * 0.15}s`,
                  }} />
                ))}
              </div>
            </div>
          )}

          {/* Empty state when stopped */}
          {status === "stopped" && messages.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center gap-3 animate-fade-up">
              <div className="text-6xl animate-float select-none">👻</div>
              <p className="text-white font-bold">Chat ended</p>
              <p className="text-sm" style={{ color:"#475569" }}>Hit Next Stranger to find someone new</p>
            </div>
          )}

          {messages.map(msg => (
            <div key={msg.id} className={`msg-wrap flex ${msg.from === "me" ? "justify-end" : "justify-start"}`}>
              {isSystem(msg.type === "text" ? msg.text : undefined) ? (
                <div className="mx-auto px-4 py-2 rounded-2xl text-xs text-center max-w-sm"
                  style={{ background:"rgba(99,102,241,0.1)", border:"1px solid rgba(99,102,241,0.2)", color:"#818cf8" }}>
                  {msg.text}
                </div>
              ) : msg.type === "image" ? (
                <div className={`max-w-xs ${msg.from === "me" ? "msg-me" : "msg-stranger"}`}>
                  {msg.from === "stranger" && (
                    <p className="text-xs font-semibold mb-1 ml-1" style={{ color:"#818cf8" }}>Stranger</p>
                  )}
                  <img src={msg.dataUrl} alt="shared" className="rounded-2xl max-w-full"
                    style={{ border:"1px solid rgba(255,255,255,0.08)" }} />
                  <p className="msg-time text-xs mt-1" style={{ color:"#334155" }}>{formatTime(msg.timestamp)}</p>
                </div>
              ) : msg.from === "stranger" ? (
                <div className="flex gap-2.5 max-w-[85vw] sm:max-w-xs lg:max-w-sm msg-stranger">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-sm shrink-0 mt-5"
                    style={{ background:"linear-gradient(135deg,rgba(99,102,241,0.3),rgba(139,92,246,0.3))", border:"1px solid rgba(99,102,241,0.3)" }}>
                    👤
                  </div>
                  <div>
                    <p className="text-xs font-semibold mb-1" style={{ color:"#818cf8" }}>Stranger</p>
                    <div className="px-4 py-2.5 rounded-2xl text-sm leading-relaxed"
                      style={{ background:"rgba(99,102,241,0.15)", color:"#e2e8f0", borderBottomLeftRadius:6, border:"1px solid rgba(99,102,241,0.2)" }}
                      dir="ltr">
                      {msg.text}
                    </div>
                    <p className="msg-time text-xs mt-1" style={{ color:"#334155" }}>{formatTime(msg.timestamp)}</p>
                  </div>
                </div>
              ) : (
                <div className="max-w-[85vw] sm:max-w-xs lg:max-w-sm msg-me">
                  <div className="flex items-center gap-2 justify-end mb-1">
                    <span className="text-xs font-semibold" style={{ color:"#818cf8" }}>You</span>
                  </div>
                  <div className="px-4 py-2.5 rounded-2xl text-sm leading-relaxed"
                    style={{ background:"linear-gradient(135deg,#6366f1,#8b5cf6)", color:"white", borderBottomRightRadius:6, boxShadow:"0 4px 16px rgba(99,102,241,0.35)" }}
                    dir="ltr">
                    {msg.text}
                  </div>
                  <p className="msg-time text-xs mt-1 text-right flex items-center justify-end gap-1" style={{ color:"#334155" }}>
                    {formatTime(msg.timestamp)}
                    {msg.delivered
                      ? <span style={{ color:"#6366f1" }}>✓✓</span>
                      : <span style={{ color:"#334155" }}>✓</span>
                    }
                  </p>
                </div>
              )}
            </div>
          ))}

          {/* Typing indicator as bubble */}
          {strangerTyping && (
            <div className="flex gap-2.5 justify-start animate-fade-up">
              <div className="w-7 h-7 rounded-full flex items-center justify-center text-sm shrink-0"
                style={{ background:"linear-gradient(135deg,rgba(99,102,241,0.3),rgba(139,92,246,0.3))", border:"1px solid rgba(99,102,241,0.3)" }}>
                👤
              </div>
              <div>
                <p className="text-xs font-semibold mb-1" style={{ color:"#818cf8" }}>Stranger</p>
                <TypingDots />
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input bar */}
        <div className="shrink-0 px-3 sm:px-4 py-3 relative z-10 mobile-safe-bottom"
          style={{ borderTop:`1px solid ${BORDER}`, background:"rgba(255,255,255,0.01)" }}>
          {showEmoji && (
            <div className="mb-2 p-2 rounded-2xl flex flex-wrap gap-1.5"
              style={{ background:"rgba(10,10,25,0.98)", border:`1px solid ${BORDER}`, backdropFilter:"blur(20px)" }}>
              {EMOJIS.map(e => (
                <button key={e} onClick={() => setInput(p => p + e)}
                  className="text-xl hover:scale-125 transition-transform active:scale-95 p-0.5 rounded-lg hover:bg-white/10">
                  {e}
                </button>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2">
            <button onClick={() => setShowEmoji(p => !p)}
              className="shrink-0 w-9 h-9 rounded-xl flex items-center justify-center text-xl transition-all hover:scale-110">
              😊
            </button>
            {/* On mobile: show camera icon that opens camera directly.
                On desktop: show image icon that opens file picker */}
            <button onClick={() => fileRef.current?.click()}
              className="shrink-0 w-9 h-9 rounded-xl flex items-center justify-center transition-all hover:scale-110"
              title={isDesktop ? "Send image" : "Send photo"}>
              {isDesktop ? (
                <svg className="w-5 h-5" style={{ color:"#475569" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              ) : (
                <svg className="w-5 h-5" style={{ color:"#475569" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><circle cx="12" cy="13" r="3" strokeWidth={2} />
                </svg>
              )}
            </button>
            {/* Desktop: file picker. Mobile: camera capture */}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture={isDesktop ? undefined : "environment"}
              className="hidden"
              onChange={sendImage}
            />
            <div className="flex-1 relative">
              <input ref={inputRef} value={input} onChange={e => handleTyping(e.target.value)}
                onKeyDown={e => e.key === "Enter" && !e.shiftKey && sendMessage()}
                placeholder={status === "chatting" ? "Type a message..." : status === "searching" ? "Waiting for match..." : "Chat ended"}
                disabled={status !== "chatting"}
                maxLength={500}
                dir="ltr"
                className="w-full px-4 py-2.5 rounded-2xl text-sm text-white outline-none transition-all"
                style={{
                  background:"rgba(255,255,255,0.05)",
                  border:"1px solid rgba(99,102,241,0.25)",
                  caretColor:"#818cf8",
                  paddingRight: input.length > 400 ? "3.5rem" : undefined,
                }}
                onFocus={e => { (e.target as HTMLInputElement).style.borderColor="rgba(99,102,241,0.6)"; (e.target as HTMLInputElement).style.boxShadow="0 0 0 3px rgba(99,102,241,0.1)"; }}
                onBlur={e => { (e.target as HTMLInputElement).style.borderColor="rgba(99,102,241,0.25)"; (e.target as HTMLInputElement).style.boxShadow="none"; }} />
              {input.length > 400 && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold"
                  style={{ color: charLeft < 20 ? "#f87171" : "#64748b" }}>{charLeft}</span>
              )}
            </div>
            <button onClick={sendMessage} disabled={!input.trim() || status !== "chatting"}
              className="shrink-0 w-10 h-10 rounded-2xl flex items-center justify-center transition-all hover:scale-110 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed"
              style={{ background:"linear-gradient(135deg,#6366f1,#8b5cf6)", boxShadow:input.trim() ? "0 4px 16px rgba(99,102,241,0.5)" : "none" }}>
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Video overlay */}
      {showVideo && (
        <VideoCall localStream={localStream} remoteStream={remoteStream} callError={callError}
          userId={profile.userId}
          onEnd={() => { endCall(); setShowVideo(false); }} />
      )}

      {/* Rating modal */}
      {showRating && !ratingDone && (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-4"
          style={{ background:"rgba(0,0,0,0.75)", backdropFilter:"blur(8px)" }}>
          <div className="w-full max-w-sm p-6 rounded-3xl animate-scale-in text-center"
            style={{ background:"rgba(13,13,26,0.99)", border:"1px solid rgba(99,102,241,0.3)", boxShadow:"0 0 60px rgba(99,102,241,0.15)" }}>
            <div className="text-4xl mb-3">⭐</div>
            <h3 className="text-white font-bold text-lg mb-1">Rate this chat</h3>
            <p className="text-sm mb-3" style={{ color:"#64748b" }}>How was your conversation?</p>
            {chatSummary && (
              <div className="mb-4 px-4 py-3 rounded-2xl text-xs text-left" style={{ background:"rgba(99,102,241,0.1)", border:"1px solid rgba(99,102,241,0.2)", color:"#a5b4fc" }}>
                <p className="font-bold mb-1" style={{ color:"#818cf8" }}>🤖 Chat Summary</p>
                <p style={{ color:"#cbd5e1" }}>{chatSummary}</p>
              </div>
            )}
            <div className="flex justify-center gap-3 mb-5">
              {[1,2,3,4,5].map(star => (
                <button key={star} onClick={() => {
                  socket.emit("rate_stranger", { userId: profile.userId, stars: star });
                  setRatingDone(true);
                  setShowRating(false);
                  showToast(`Thanks for rating! You gave ${star}⭐`, "success");
                }}
                  className="text-3xl transition-all hover:scale-125 active:scale-95">
                  ⭐
                </button>
              ))}
            </div>
            <button onClick={() => setShowRating(false)}
              className="text-sm font-medium transition-colors hover:text-slate-300"
              style={{ color:"#475569" }}>
              Skip
            </button>
          </div>
        </div>
      )}

      {/* Report modal */}
      {showReport && (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-4"
          style={{ background:"rgba(0,0,0,0.75)", backdropFilter:"blur(8px)" }}>
          <div className="w-full max-w-sm p-6 rounded-3xl animate-scale-in"
            style={{ background:"rgba(13,13,26,0.99)", border:"1px solid rgba(239,68,68,0.3)", boxShadow:"0 0 60px rgba(239,68,68,0.15)" }}>
            <div className="text-center mb-5">
              <div className="text-4xl mb-3">🚩</div>
              <h3 className="text-white font-bold text-lg mb-1">Report this user?</h3>
              <p className="text-sm" style={{ color:"#64748b" }}>This will end the chat and flag the user for review.</p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowReport(false)}
                className="flex-1 py-3 rounded-xl text-sm font-semibold transition-all hover:scale-105"
                style={{ background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.1)", color:"#94a3b8" }}>
                Cancel
              </button>
              <button onClick={handleReport}
                className="flex-1 py-3 rounded-xl text-sm font-bold text-white transition-all hover:scale-105"
                style={{ background:"linear-gradient(135deg,#ef4444,#dc2626)", boxShadow:"0 4px 20px rgba(239,68,68,0.4)" }}>
                Report
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
