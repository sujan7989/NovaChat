import { useState, useEffect, useRef, useCallback } from "react";
import type { ReactNode } from "react";
import { v4 as uuidv4 } from "uuid";
import {
  Menu, Video, Flag, LogOut, SkipForward, Bell, BellOff, Send, Image as ImageIcon,
  Camera, Smile, User, Star, CheckCheck, Check, Loader2, Ghost, Sparkles,
} from "lucide-react";
import socket from "../socket";
import type { Message, UserProfile } from "../types";
import { useWebRTC } from "../useWebRTC";
import VideoCall from "./VideoCall";
import {
  Button, LogoMark, Modal, ModalClose, StatusDot, ToastItem,
  type ToastType, type ToastData,
} from "./ui";
import { cx } from "../lib";

interface Props {
  profile: UserProfile;
  onStop: () => void;
}

/* ── Small local helpers ─────────────────────────────────────────────── */

function useToast() {
  const [toasts, setToasts] = useState<ToastData[]>([]);
  const show = useCallback((msg: string, type: ToastType = "info") => {
    setToasts((p) => [...p, { id: uuidv4(), msg, type }]);
  }, []);
  const remove = useCallback((id: string) => setToasts((p) => p.filter((t) => t.id !== id)), []);
  return { toasts, show, remove };
}

function playTone(freq: number, gain: number, duration: number) {
  try {
    const ctx = new AudioContext();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g);
    g.connect(ctx.destination);
    o.frequency.value = freq;
    o.type = "sine";
    g.gain.setValueAtTime(gain, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    o.start();
    o.stop(ctx.currentTime + duration);
  } catch {
    /* AudioContext not available — silently ignore. */
  }
}

const playPing = () => playTone(880, 0.12, 0.4);
const playSend = () => playTone(660, 0.06, 0.18);

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

const EMOJIS = ["😂","😍","🔥","👍","❤️","😭","🤣","😊","🙏","💀","😎","🥺","😅","🤔","💯","✨","🎉","👀","😤","🫡","🤩","😈","🫶","🤯"];

function Avatar({ size = 40, online = false }: { size?: number; online?: boolean }) {
  return (
    <div
      className="relative grid shrink-0 place-items-center rounded-full border border-white/[0.12] bg-white/[0.06] backdrop-blur-md"
      style={{ width: size, height: size }}
    >
      <User size={size * 0.5} className="text-fg-muted" />
      {online && (
        <span
          className="absolute -bottom-0.5 -right-0.5 rounded-full border-2 border-surface-1 bg-success"
          style={{ width: size * 0.3, height: size * 0.3 }}
        />
      )}
    </div>
  );
}

function HeaderIcon({
  children, onClick, title, tone = "default",
}: {
  children: ReactNode; onClick: () => void; title: string; tone?: "default" | "danger" | "accent";
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      className={cx(
        "grid h-9 w-9 shrink-0 place-items-center rounded-lg border transition-colors",
        tone === "danger"
          ? "border-danger/25 bg-danger/10 text-danger hover:bg-danger/20"
          : tone === "accent"
            ? "border-accent/30 bg-accent-soft text-accent-hover hover:bg-accent/20"
            : "border-white/[0.08] bg-white/[0.04] text-fg-muted hover:border-white/[0.16] hover:text-fg"
      )}
    >
      {children}
    </button>
  );
}

function IconButton({
  children, onClick, title, tone = "default",
}: {
  children: ReactNode; onClick: () => void; title: string; tone?: "default" | "danger" | "accent";
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      className={cx(
        "flex flex-1 items-center justify-center rounded-lg border py-2.5 transition-colors",
        tone === "danger"
          ? "border-danger/25 bg-danger/10 text-danger hover:bg-danger/20"
          : tone === "accent"
            ? "border-accent/30 bg-accent-soft text-accent-hover hover:bg-accent/20"
            : "border-white/[0.08] bg-white/[0.04] text-fg-muted hover:border-white/[0.16] hover:text-fg"
      )}
    >
      {children}
    </button>
  );
}

function SearchingVisual() {
  return (
    <div className="relative grid h-[120px] w-[120px] place-items-center">
      <span className="absolute inset-0 rounded-full border border-white/[0.07]" />
      <span className="absolute h-[86px] w-[86px] rounded-full border border-white/[0.07]" />
      <span className="absolute h-[86px] w-[86px] rounded-full border border-accent/40 pulse-ring" />
      <span className="grid h-16 w-16 place-items-center rounded-full border border-accent/40 bg-accent-soft">
        <Loader2 size={22} className="animate-spin text-accent-hover" />
      </span>
    </div>
  );
}

function MatchFlash({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 1500);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
    <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center animate-fade-in">
      <div
        className="flex flex-col items-center gap-2 rounded-3xl glass-strong glass-hi shadow-[0_0_0_1px_rgba(110,107,245,0.35),0_30px_80px_-30px_rgba(0,0,0,0.95)] px-7 py-5 animate-scale-in"
      >
        <span className="grid h-11 w-11 place-items-center rounded-full bg-accent-soft">
          <Sparkles size={20} className="text-accent-hover" />
        </span>
        <p className="text-sm font-semibold text-fg">Connected</p>
        <p className="text-xs text-fg-subtle">Say hello</p>
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
  const [isDesktop, setIsDesktop] = useState(() => window.innerWidth >= 768);
  const [socketConnected, setSocketConnected] = useState(socket.connected);

  useEffect(() => {
    const handler = () => setIsDesktop(window.innerWidth >= 768);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  const bottomRef = useRef<HTMLDivElement>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesRef = useRef<Message[]>([]);
  const { toasts, show: showToast, remove: removeToast } = useToast();

  const { localStream, remoteStream, callError, startCall, handleOffer, handleAnswer, handleIce, endCall, cleanup } =
    useWebRTC(profile.userId);

  const addMsg = useCallback((msg: Omit<Message, "id" | "timestamp">) => {
    setMessages((prev) => {
      const next = [...prev, { ...msg, id: uuidv4(), timestamp: Date.now() }];
      messagesRef.current = next;
      return next;
    });
  }, []);

  useEffect(() => {
    const handleSocketConnect = () => {
      setSocketConnected(true);
      setReconnecting(false);
    };
    const handleSocketDisconnect = () => {
      setSocketConnected(false);
      // Only cleanup video call if it was active - prevents unnecessary cleanup
      if (showVideo) {
        cleanup();
        setShowVideo(false);
      }
      setReconnecting(true);
    };
    const handleReconnectAttempt = () => setReconnecting(true);
    const handleReconnect = () => {
      setReconnecting(false);
      showToast("Reconnected", "success");
      // Re-queue for matching after reconnect
      if (status === "searching" || status === "chatting") {
        socket.emit("find", { ...profile, languages: profile.languages, vibes: profile.vibes });
      }
    };

    socket.on("connect", handleSocketConnect);
    socket.on("queued", () => setStatus("searching"));
    socket.on("matched", ({ shared, partnerVibes, icebreaker }: { shared: string[]; partnerVibes?: string[]; icebreaker?: string }) => {
      setStatus("chatting");
      setMessages([]);
      setChatKey((k) => k + 1);
      setShowMatchFlash(true);
      if (soundOnRef.current) playPing();
      const vibeMsg = partnerVibes?.length ? ` · Vibe: ${partnerVibes.join(", ")}` : "";
      const txt = shared.length
        ? `You both like ${shared.join(", ")}${vibeMsg}`
        : partnerVibes?.length
          ? `Connected · Stranger's vibe: ${partnerVibes.join(", ")}`
          : "You're connected. Say something.";
      addMsg({ from: "stranger", type: "text", text: txt, system: true });
      if (icebreaker) {
        setTimeout(() => addMsg({ from: "stranger", type: "text", text: `Icebreaker: ${icebreaker}`, system: true }), 800);
      }
      setTimeout(() => inputRef.current?.focus(), 200);
    });
    socket.on("message", ({ text }: { text: string }) => {
      setStrangerTyping(false);
      addMsg({ from: "stranger", type: "text", text });
    });
    socket.on("image", ({ dataUrl, caption }: { dataUrl: string; caption?: string }) =>
      addMsg({ from: "stranger", type: "image", dataUrl, caption }));
    socket.on("typing", ({ isTyping }: { isTyping: boolean }) => setStrangerTyping(isTyping));
    socket.on("stranger_left", () => {
      setStatus("stopped");
      cleanup();
      setShowVideo(false);
      addMsg({ from: "stranger", type: "text", text: "Stranger left the chat.", system: true });
      setTimeout(() => setShowRating(true), 1500);
      socket.emit("submit_for_summary", { userId: profile.userId, messages: messagesRef.current });
    });
    socket.on("chat_summary", ({ summary }: { summary: string }) => setChatSummary(summary));
    socket.on("stopped", () => { setStatus("stopped"); cleanup(); setShowVideo(false); });
    socket.on("banned", () => addMsg({ from: "stranger", type: "text", text: "You've been banned for violations.", system: true }));
    socket.on("webrtc:offer", ({ offer }: { offer: RTCSessionDescriptionInit }) => { handleOffer(offer); setShowVideo(true); });
    socket.on("webrtc:answer", ({ answer }: { answer: RTCSessionDescriptionInit }) => handleAnswer(answer));
    socket.on("webrtc:ice", ({ candidate }: { candidate: RTCIceCandidateInit }) => handleIce(candidate));
    socket.on("webrtc:end", () => { cleanup(); setShowVideo(false); });
    socket.on("disconnect", handleSocketDisconnect);
    socket.on("message_delivered", ({ text }: { text: string }) => {
      setMessages((prev) => {
        const idx = [...prev].reverse().findIndex((m) => m.from === "me" && m.text === text);
        if (idx === -1) return prev;
        const realIdx = prev.length - 1 - idx;
        return prev.map((m, i) => (i === realIdx ? { ...m, delivered: true } : m));
      });
    });
    socket.on("moderation_warning", ({ msg }: { msg: string }) => showToast(msg, "warn"));

    socket.io.on("reconnect_attempt", handleReconnectAttempt);
    socket.io.on("reconnect", handleReconnect);

    const emitFind = () => socket.emit("find", { ...profile, languages: profile.languages, vibes: profile.vibes });
    if (socket.connected) emitFind();
    else socket.once("connect", emitFind);

    return () => {
      socket.off("connect", handleSocketConnect);
      socket.off("disconnect", handleSocketDisconnect);
      socket.off("connect", emitFind);
      ["queued","matched","message","image","typing","stranger_left","stopped","banned",
       "webrtc:offer","webrtc:answer","webrtc:ice","webrtc:end",
       "chat_summary","message_delivered","moderation_warning"].forEach((e) => socket.off(e));
      socket.io.off("reconnect_attempt", handleReconnectAttempt);
      socket.io.off("reconnect", handleReconnect);
    };
  }, [addMsg, cleanup, handleAnswer, handleIce, handleOffer, profile, showToast]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, strangerTyping]);

  const sendMessage = () => {
    if (!input.trim() || status !== "chatting") return;
    socket.emit("message", { userId: profile.userId, text: input.trim() });
    addMsg({ from: "me", type: "text", text: input.trim() });
    if (soundOnRef.current) playSend();
    setInput("");
    setShowEmoji(false);
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
    cleanup();
    setShowVideo(false);
    setShowEmoji(false);
    setShowRating(false);
    setRatingDone(false);
    setChatSummary(null);
    socket.emit("next", { ...profile, languages: profile.languages, vibes: profile.vibes });
    setStatus("searching");
    setMessages([]);
  };

  const handleStop = () => { cleanup(); setShowVideo(false); socket.emit("stop", { userId: profile.userId }); onStop(); };

  const handleReport = () => {
    socket.emit("report", { userId: profile.userId });
    cleanup();
    setShowVideo(false);
    setStatus("stopped");
    setShowReport(false);
    addMsg({ from: "stranger", type: "text", text: "Reported. Thanks for keeping NovaChat safe.", system: true });
  };

  const copyMsg = (text: string) => {
    navigator.clipboard.writeText(text).then(() => showToast("Copied", "success")).catch(() => {});
  };

  const toggleSound = () => setSoundOn((p) => { soundOnRef.current = !p; return !p; });

  const charLeft = 500 - input.length;

  return (
    <div className="relative flex h-full w-full bg-bg">
      {/* Toasts */}
      <div
        className={cx(
          "pointer-events-none fixed z-[70] flex flex-col gap-2",
          isDesktop
            ? "bottom-6 right-6 items-end"
            : "top-3 left-1/2 w-[calc(100vw-32px)] max-w-sm -translate-x-1/2 items-center"
        )}
      >
        {toasts.map((t) => (
          <div key={t.id} className="pointer-events-auto w-full">
            <ToastItem toast={t} onRemove={removeToast} />
          </div>
        ))}
      </div>

      {/* Reconnecting banner */}
      {reconnecting && (
        <div className="fixed inset-x-0 top-0 z-[65] flex items-center justify-center gap-2 border-b border-warning/30 bg-warning/10 px-4 py-2 backdrop-blur-xl">
          <StatusDot tone="warning" />
          <span className="text-[13px] font-medium text-warning">Reconnecting…</span>
        </div>
      )}

      {showMatchFlash && <MatchFlash onDone={() => setShowMatchFlash(false)} />}

      {/* Sidebar scrim (mobile) */}
      {sidebarOpen && !isDesktop && (
        <div
          className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm animate-fade-in"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Sidebar ── */}
      <aside
        className={cx(
          "flex shrink-0 flex-col border-r border-white/[0.07] bg-white/[0.03] backdrop-blur-2xl transition-transform duration-300",
          isDesktop ? "relative" : "fixed inset-y-0 left-0 z-40",
          !isDesktop && (sidebarOpen ? "translate-x-0" : "-translate-x-full")
        )}
        style={{ width: 260 }}
      >
        <div className="flex items-center justify-between border-b border-white/[0.07] px-4 py-3.5">
          <div className="flex items-center gap-2">
            <LogoMark size={26} />
            <span className="text-[13px] font-semibold tracking-[-0.01em] text-fg">NovaChat</span>
          </div>
          <div className="flex items-center gap-1.5">
            <StatusDot />
            <span className="text-[11px] font-medium text-fg-muted">Live</span>
          </div>
        </div>

        <div className="border-b border-white/[0.07] px-4 py-3">
          <div className="flex items-center gap-2">
            <StatusDot
              tone={status === "chatting" ? "success" : status === "searching" ? "warning" : "muted"}
            />
            <span className="text-[13px] font-medium text-fg">
              {status === "chatting"
                ? "Connected"
                : status === "searching"
                  ? socketConnected ? "Finding a match" : "Connecting to server"
                  : "Disconnected"}
            </span>
          </div>
        </div>

        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-4">
          {status === "searching" && (
            <>
              <SearchingVisual />
              <div className="text-center">
                <p className="text-sm font-medium text-fg">
                  {socketConnected ? "Finding someone" : "Connecting to NovaChat"}
                </p>
                <p className="mt-1 text-xs text-fg-subtle">
                  {socketConnected
                    ? "Waiting for a compatible person to join"
                    : "We will keep trying automatically"}
                </p>
              </div>
            </>
          )}
          {status === "chatting" && (
            <div className="flex w-full flex-col items-center gap-3 animate-scale-in">
              <Avatar size={64} online />
              <div className="text-center">
                <p className="text-sm font-medium text-fg">Stranger</p>
                <p className="text-xs text-success">Online</p>
              </div>
              <Button size="sm" className="w-full" onClick={() => { setShowVideo(true); startCall(); }}>
                <Video size={15} />
                Video call
              </Button>
            </div>
          )}
          {status === "stopped" && (
            <div className="flex flex-col items-center gap-2 animate-fade-up text-center">
              <Ghost size={32} className="text-fg-subtle" />
              <p className="text-xs leading-relaxed text-fg-subtle">
                Chat ended.
                <br />
                Find someone new?
              </p>
            </div>
          )}
        </div>

        <div className="space-y-2 border-t border-white/[0.07] p-3">
          <Button size="md" className="w-full" onClick={handleNext}>
            <SkipForward size={16} />
            Next stranger
          </Button>
          <div className="flex gap-2">
            <IconButton onClick={() => setShowReport(true)} title="Report" tone="danger">
              <Flag size={16} />
            </IconButton>
            <IconButton onClick={handleStop} title="Leave">
              <LogOut size={16} />
            </IconButton>
            <IconButton onClick={toggleSound} title={soundOn ? "Mute" : "Unmute"} tone={soundOn ? "accent" : "default"}>
              {soundOn ? <Bell size={16} /> : <BellOff size={16} />}
            </IconButton>
          </div>
        </div>
      </aside>

      {/* ── Main ── */}
      <div className="relative flex min-w-0 flex-1 flex-col">
        <div className="pointer-events-none absolute inset-0 aurora opacity-60" />
        <div className="pointer-events-none absolute inset-0 grid-fade opacity-30" />
        <div className="pointer-events-none absolute inset-0 noise" />

        {/* Header */}
        <header className="relative z-10 flex shrink-0 items-center gap-2.5 border-b border-white/[0.08] bg-white/[0.04] px-3 py-2.5 backdrop-blur-2xl sm:px-4">
          {!isDesktop && (
            <HeaderIcon onClick={() => setSidebarOpen((p) => !p)} title="Menu">
              <Menu size={18} />
            </HeaderIcon>
          )}
          <Avatar size={40} online={status === "chatting"} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-fg">Stranger</p>
            <p className="text-xs text-fg-subtle">
              {strangerTyping ? (
                <span className="text-accent-hover">typing…</span>
              ) : status === "chatting"
                ? "online"
                : status === "searching"
                  ? socketConnected ? "finding a match…" : "connecting to server…"
                  : "offline"}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <Button size="sm" variant="secondary" onClick={handleNext}>
              <SkipForward size={15} />
              <span className="hidden sm:inline">Skip</span>
            </Button>
            <HeaderIcon tone="accent" onClick={() => { setShowVideo(true); startCall(); }} title="Video call">
              <Video size={17} />
            </HeaderIcon>
            <HeaderIcon tone="danger" onClick={() => setShowReport(true)} title="Report">
              <Flag size={17} />
            </HeaderIcon>
            <HeaderIcon onClick={handleStop} title="Leave">
              <LogOut size={17} />
            </HeaderIcon>
          </div>
        </header>

        {/* Messages */}
        <div key={chatKey} className="relative z-10 flex-1 space-y-3 overflow-y-auto px-3 py-4 sm:px-5">
          {status === "searching" && messages.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center gap-3 animate-fade-up">
              <div className="grid h-14 w-14 place-items-center rounded-full border border-white/[0.09] bg-white/[0.05] backdrop-blur-md">
                <Loader2 size={22} className="animate-spin text-fg-muted" />
              </div>
              <p className="text-sm font-medium text-fg">
                {socketConnected ? "Waiting for a match…" : "Connecting to NovaChat…"}
              </p>
              <p className="text-xs text-fg-subtle">
                {socketConnected
                  ? "Your chat starts when a compatible person is available"
                  : "We will retry the server connection automatically"}
              </p>
            </div>
          )}

          {status === "stopped" && messages.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center gap-3 animate-fade-up">
              <Ghost size={40} className="text-fg-subtle" />
              <p className="text-sm font-medium text-fg">Chat ended</p>
              <p className="text-xs text-fg-subtle">Press Next to find someone new</p>
            </div>
          )}

          {messages.map((msg) => {
            if (msg.system) {
              return (
                <div key={msg.id} className="flex justify-center">
                  <span className="max-w-sm rounded-full border border-white/[0.08] bg-white/[0.05] px-3.5 py-1.5 text-center text-xs text-fg-muted backdrop-blur-md">
                    {msg.text}
                  </span>
                </div>
              );
            }

            if (msg.type === "image") {
              return (
                <div key={msg.id} className={cx("flex", msg.from === "me" ? "justify-end" : "justify-start")}>
                  <div className="max-w-[70%]">
                    <img src={msg.dataUrl} alt="Shared" className="max-w-full rounded-xl border border-white/[0.12] shadow-[0_10px_30px_-16px_rgba(0,0,0,0.9)]" />
                    <p className={cx("mt-1 text-[11px] text-fg-subtle", msg.from === "me" && "text-right")}>
                      {formatTime(msg.timestamp)}
                    </p>
                  </div>
                </div>
              );
            }

            if (msg.from === "stranger") {
              return (
                <div key={msg.id} className="flex max-w-[85%] justify-start gap-2.5 sm:max-w-md">
                  <Avatar size={28} />
                  <div className="min-w-0">
                    <p className="mb-1 text-[11px] font-medium text-fg-subtle">Stranger</p>
                    <div
                      className="rounded-2xl rounded-bl-md border border-white/[0.09] bg-white/[0.055] px-3.5 py-2 text-sm leading-relaxed text-fg backdrop-blur-md"
                      dir="ltr"
                      onContextMenu={(e) => { e.preventDefault(); if (msg.text) copyMsg(msg.text); }}
                    >
                      {msg.text}
                    </div>
                    <p className="mt-1 text-[11px] text-fg-subtle">{formatTime(msg.timestamp)}</p>
                  </div>
                </div>
              );
            }

            return (
              <div key={msg.id} className="flex justify-end">
                <div className="max-w-[85%] sm:max-w-md">
                  <div
                    className="rounded-2xl rounded-br-md bg-[linear-gradient(180deg,#8280ff_0%,#5a57e6_100%)] px-3.5 py-2 text-sm leading-relaxed text-white shadow-[0_1px_0_rgba(255,255,255,0.22)_inset,0_10px_28px_-12px_rgba(110,107,245,0.85)]"
                    dir="ltr"
                    onContextMenu={(e) => { e.preventDefault(); if (msg.text) copyMsg(msg.text); }}
                  >
                    {msg.text}
                  </div>
                  <p className="mt-1 flex items-center justify-end gap-1 text-[11px] text-fg-subtle">
                    {formatTime(msg.timestamp)}
                    {msg.delivered ? <CheckCheck size={13} className="text-accent-hover" /> : <Check size={13} />}
                  </p>
                </div>
              </div>
            );
          })}

          {strangerTyping && (
            <div className="flex justify-start gap-2.5 animate-fade-up">
              <Avatar size={28} />
              <div className="flex items-center gap-1 rounded-2xl rounded-bl-md border border-white/[0.09] bg-white/[0.055] px-3.5 py-3 backdrop-blur-md">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="typing-dot h-1.5 w-1.5 rounded-full bg-fg-subtle"
                    style={{ animationDelay: `${i * 0.15}s` }}
                  />
                ))}
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input bar */}
        <div
          className={cx(
            "relative z-10 shrink-0 border-t border-white/[0.08] bg-white/[0.04] px-3 py-3 backdrop-blur-2xl sm:px-4 safe-bottom",
            status === "stopped" && "pointer-events-none opacity-50"
          )}
        >
          {showEmoji && (
            <div className="mb-2 flex flex-wrap gap-1 rounded-xl border border-white/[0.09] bg-white/[0.05] p-2 backdrop-blur-md">
              {EMOJIS.map((e) => (
                <button
                  key={e}
                  onClick={() => setInput((p) => p + e)}
                  className="rounded-lg p-1 text-lg transition-transform hover:scale-110 active:scale-95"
                >
                  {e}
                </button>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowEmoji((p) => !p)}
              aria-label="Emoji"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-fg-muted transition-colors hover:bg-white/5 hover:text-fg"
            >
              <Smile size={18} />
            </button>
            <button
              onClick={() => fileRef.current?.click()}
              aria-label="Send image"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-fg-muted transition-colors hover:bg-white/5 hover:text-fg"
            >
              {isDesktop ? <ImageIcon size={18} /> : <Camera size={18} />}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture={isDesktop ? undefined : "environment"}
              className="hidden"
              onChange={sendImage}
            />
            <div className="relative flex-1">
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => handleTyping(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage()}
                placeholder={status === "chatting" ? "Type a message…" : status === "searching" ? "Waiting for match…" : "Chat ended"}
                disabled={status !== "chatting"}
                maxLength={500}
                dir="ltr"
                className="h-10 w-full rounded-xl border border-white/[0.09] bg-white/[0.05] px-3.5 text-sm text-fg outline-none transition-colors placeholder:text-fg-subtle focus:border-accent/60 focus:bg-white/[0.07] disabled:opacity-60"
                style={{ paddingRight: input.length > 400 ? "3rem" : undefined }}
              />
              {input.length > 400 && (
                <span
                  className={cx(
                    "absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-medium tabular-nums",
                    charLeft < 20 ? "text-danger" : "text-fg-subtle"
                  )}
                >
                  {charLeft}
                </span>
              )}
            </div>
            <button
              onClick={sendMessage}
              disabled={!input.trim() || status !== "chatting"}
              aria-label="Send"
              className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[linear-gradient(180deg,#8280ff_0%,#5a57e6_100%)] text-white shadow-[0_1px_0_rgba(255,255,255,0.24)_inset,0_8px_22px_-10px_rgba(110,107,245,0.9)] transition-all hover:brightness-110 active:scale-95 disabled:opacity-30 disabled:hover:brightness-100"
            >
              <Send size={17} />
            </button>
          </div>
        </div>
      </div>

      {/* Video overlay */}
      {showVideo && (
        <VideoCall
          localStream={localStream}
          remoteStream={remoteStream}
          callError={callError}
          userId={profile.userId}
          onEnd={() => { endCall(); setShowVideo(false); }}
          onNext={() => { endCall(); setShowVideo(false); handleNext(); }}
        />
      )}

      {/* Rating modal */}
      <Modal open={showRating && !ratingDone} onClose={() => setShowRating(false)} labelledBy="rate-title">
        <div className="text-center">
          <div className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-full bg-accent-soft">
            <Star size={20} className="text-accent-hover" />
          </div>
          <h3 id="rate-title" className="text-[15px] font-semibold text-fg">Rate this chat</h3>
          <p className="mt-1 text-sm text-fg-muted">How was your conversation?</p>
          {chatSummary && (
            <div className="mt-4 rounded-xl border border-white/[0.09] bg-white/[0.045] p-3 text-left backdrop-blur-md">
              <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-fg-subtle">Chat summary</p>
              <p className="text-xs leading-relaxed text-fg-muted">{chatSummary}</p>
            </div>
          )}
          <div className="mt-5 flex justify-center gap-1.5">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                onClick={() => {
                  socket.emit("rate_stranger", { userId: profile.userId, stars: star });
                  setRatingDone(true);
                  setShowRating(false);
                  showToast(`Thanks — rated ${star} ★`, "success");
                }}
                aria-label={`${star} star${star > 1 ? "s" : ""}`}
                className="text-fg-subtle transition-colors hover:text-warning"
              >
                <Star size={26} fill="currentColor" />
              </button>
            ))}
          </div>
          <button
            onClick={() => setShowRating(false)}
            className="mt-4 text-xs text-fg-subtle transition-colors hover:text-fg"
          >
            Skip
          </button>
        </div>
      </Modal>

      {/* Report modal */}
      <Modal open={showReport} onClose={() => setShowReport(false)} labelledBy="report-title">
        <ModalClose onClose={() => setShowReport(false)} />
        <div className="text-center">
          <div className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-full bg-danger/10">
            <Flag size={20} className="text-danger" />
          </div>
          <h3 id="report-title" className="text-[15px] font-semibold text-fg">Report this user?</h3>
          <p className="mt-1 text-sm text-fg-muted">This ends the chat and flags the user for review.</p>
        </div>
        <div className="mt-6 flex gap-3">
          <Button variant="secondary" className="flex-1" onClick={() => setShowReport(false)}>Cancel</Button>
          <Button variant="danger" className="flex-1" onClick={handleReport}>Report</Button>
        </div>
      </Modal>
    </div>
  );
}
