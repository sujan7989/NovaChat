import { useEffect, useRef, useState, useCallback } from "react";
import type { ReactNode } from "react";
import { v4 as uuidv4 } from "uuid";
import {
  Mic, MicOff, Video as VideoIcon, VideoOff, PhoneOff, SkipForward,
  MessageSquare, Maximize2, Minimize2, Send, X, Loader2, AlertTriangle, User,
  Volume2, VolumeX,
} from "lucide-react";
import socket from "../socket";
import { cx } from "../lib";

interface ChatMsg {
  id: string;
  from: "me" | "stranger";
  text: string;
  ts: number;
}

interface Props {
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  callError: string | null;
  userId: string;
  onEnd: () => void;
  onNext?: () => void;
}

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function CtrlButton({
  children, onClick, label, active = false, tone = "neutral", size = "md",
}: {
  children: ReactNode;
  onClick: () => void;
  label: string;
  active?: boolean;
  tone?: "neutral" | "danger";
  size?: "md" | "lg";
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cx(
        "grid shrink-0 place-items-center rounded-2xl border transition-all active:scale-95",
        size === "lg" ? "h-14 w-14" : "h-12 w-12",
        tone === "danger"
          ? "border-transparent bg-[linear-gradient(180deg,#fb7185_0%,#e11d48_100%)] text-white shadow-[0_1px_0_rgba(255,255,255,0.24)_inset,0_10px_30px_-12px_rgba(251,113,133,0.85)] hover:brightness-110"
          : active
            ? "border-accent/50 bg-accent/25 text-accent-hover shadow-[0_0_0_1px_rgba(110,107,245,0.35)]"
            : "border-white/[0.09] bg-white/[0.06] text-fg-muted backdrop-blur-md hover:border-white/[0.18] hover:text-fg"
      )}
    >
      {children}
    </button>
  );
}

export default function VideoCall({ localStream, remoteStream, callError, userId, onEnd, onNext }: Props) {
  const localRef        = useRef<HTMLVideoElement>(null);
  const remoteRef       = useRef<HTMLVideoElement>(null);
  const remoteAudioRef  = useRef<HTMLAudioElement>(null);
  const chatEndRef      = useRef<HTMLDivElement>(null);
  const chatInputRef    = useRef<HTMLInputElement>(null);
  const frameCheckRef   = useRef<ReturnType<typeof setInterval> | null>(null);

  const [muted,              setMuted]              = useState(false);
  const [camOff,             setCamOff]             = useState(false);
  const [pip,                setPip]                = useState(false);
  const [entered,            setEntered]            = useState(false);
  const [fullscreen,         setFullscreen]         = useState(false);
  const [chatOpen,           setChatOpen]           = useState(false);
  const [chatInput,          setChatInput]          = useState("");
  const [messages,           setMessages]           = useState<ChatMsg[]>([]);
  const [unread,             setUnread]             = useState(0);
  const [remoteVideoPlaying, setRemoteVideoPlaying] = useState(false);
  const [remoteAudioEnabled, setRemoteAudioEnabled] = useState(false);
  const [remoteAudioBlocked, setRemoteAudioBlocked] = useState(false);
  const [isMobile,           setIsMobile]           = useState(() => window.innerWidth < 640);
  const [strangerTyping,     setStrangerTyping]     = useState(false);

  useEffect(() => {
    const h = () => setIsMobile(window.innerWidth < 640);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setEntered(true), 30);
    return () => clearTimeout(t);
  }, []);

  // ── Local video ──────────────────────────────────────────────────────────
  useEffect(() => {
    const v = localRef.current;
    if (!v || !localStream) return;
    v.srcObject = localStream;
    v.muted = true;
    void v.play().catch(() => {});
  }, [localStream]);

  // ── Remote video ─────────────────────────────────────────────────────────
  // Step 1: assign srcObject and start playing (muted — required for autoplay).
  useEffect(() => {
    const video = remoteRef.current;
    if (!video) return;

    if (!remoteStream) {
      video.srcObject = null;
      setRemoteVideoPlaying(false);
      if (frameCheckRef.current) { clearInterval(frameCheckRef.current); frameCheckRef.current = null; }
      return;
    }

    // Assign stream and play.
    video.srcObject = remoteStream;
    video.muted = true; // must be muted for autoplay policy
    void video.play().catch(() => {});

    // Step 2: Poll video.videoWidth to detect ACTUAL frame arrival.
    // play() resolves immediately even with zero frames — videoWidth stays 0
    // until real encoded frames from the sender arrive through the relay.
    // Only when videoWidth > 0 do we know the remote camera is truly visible.
    if (frameCheckRef.current) clearInterval(frameCheckRef.current);
    setRemoteVideoPlaying(false);

    frameCheckRef.current = setInterval(() => {
      const v = remoteRef.current;
      if (!v) return;
      // Also retry play() in case it was blocked
      if (v.paused) void v.play().catch(() => {});
      // videoWidth > 0 means actual frames are decoded and visible
      if (v.videoWidth > 0 && v.videoHeight > 0) {
        setRemoteVideoPlaying(true);
        if (frameCheckRef.current) { clearInterval(frameCheckRef.current); frameCheckRef.current = null; }
      }
    }, 300);

    return () => {
      if (frameCheckRef.current) { clearInterval(frameCheckRef.current); frameCheckRef.current = null; }
    };
  }, [remoteStream]);

  // ── Remote audio (separate element to avoid autoplay mute restrictions) ──
  useEffect(() => {
    const audio = remoteAudioRef.current;
    if (!audio) return;
    audio.srcObject = remoteStream ?? null;
    audio.muted = !remoteAudioEnabled;
    if (remoteStream && remoteAudioEnabled) {
      void audio.play().catch(() => {
        audio.muted = true;
        setRemoteAudioEnabled(false);
        setRemoteAudioBlocked(true);
      });
    }
  }, [remoteStream, remoteAudioEnabled]);

  const toggleRemoteAudio = async () => {
    const audio = remoteAudioRef.current;
    if (!audio || !remoteStream) return;
    if (remoteAudioEnabled) {
      audio.muted = true;
      setRemoteAudioEnabled(false);
      setRemoteAudioBlocked(false);
      return;
    }
    audio.muted = false;
    try {
      await audio.play();
      setRemoteAudioEnabled(true);
      setRemoteAudioBlocked(false);
    } catch {
      audio.muted = true;
      setRemoteAudioBlocked(true);
    }
  };

  // ── In-call chat ─────────────────────────────────────────────────────────
  useEffect(() => {
    const handler = ({ text }: { text: string }) => {
      setMessages(p => [...p, { id: uuidv4(), from: "stranger", text, ts: Date.now() }]);
      if (!chatOpen) setUnread(u => u + 1);
      setStrangerTyping(false);
    };
    const typingHandler = ({ isTyping }: { isTyping: boolean }) => setStrangerTyping(isTyping);
    socket.on("videochat:message", handler);
    socket.on("videochat:typing", typingHandler);
    return () => { socket.off("videochat:message", handler); socket.off("videochat:typing", typingHandler); };
  }, [chatOpen]);

  useEffect(() => {
    if (!chatOpen) return;
    const t = setTimeout(() => chatInputRef.current?.focus(), 150);
    return () => clearTimeout(t);
  }, [chatOpen]);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sendChat = useCallback(() => {
    const text = chatInput.trim();
    if (!text) return;
    socket.emit("videochat:message", { userId, text });
    socket.emit("videochat:typing", { userId, isTyping: false });
    setMessages(p => [...p, { id: uuidv4(), from: "me", text, ts: Date.now() }]);
    setChatInput("");
  }, [chatInput, userId]);

  const handleChatTyping = (val: string) => {
    setChatInput(val);
    socket.emit("videochat:typing", { userId, isTyping: true });
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => socket.emit("videochat:typing", { userId, isTyping: false }), 1500);
  };

  const toggleMute = () => {
    localStream?.getAudioTracks().forEach(t => { t.enabled = muted; });
    setMuted(p => !p);
  };

  const toggleCam = () => {
    localStream?.getVideoTracks().forEach(t => { t.enabled = camOff; });
    setCamOff(p => !p);
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => setFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setFullscreen(false)).catch(() => {});
    }
  };

  useEffect(() => {
    const h = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", h);
    return () => document.removeEventListener("fullscreenchange", h);
  }, []);

  return (
    <div className={cx("fixed inset-0 z-50 flex bg-black transition-all duration-300", entered ? "scale-100 opacity-100" : "scale-[0.98] opacity-0")}>
      {/* ── Video area ── */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="relative flex-1 overflow-hidden bg-black">

          {/* Remote video — muted imperatively, NOT via JSX prop */}
          <video
            ref={remoteRef}
            autoPlay
            playsInline
            className="h-full w-full"
            style={{ objectFit: "cover", background: "#000" }}
          />
          <audio ref={remoteAudioRef} autoPlay className="sr-only" />

          {/* Waiting for stream */}
          {!remoteStream && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 overflow-hidden bg-bg">
              <div className="pointer-events-none absolute inset-0 aurora opacity-70" />
              <div className="pointer-events-none absolute inset-0 noise" />
              <div className="relative grid h-24 w-24 place-items-center">
                <span className="absolute inset-0 rounded-full border border-accent/30 pulse-ring" />
                <span className="absolute inset-3 rounded-full border border-white/[0.08]" />
                <span className="grid h-16 w-16 place-items-center rounded-full border border-accent/40 bg-accent-soft backdrop-blur-md">
                  <Loader2 size={24} className="animate-spin text-accent-hover" />
                </span>
              </div>
              <div className="relative text-center">
                <p className="text-sm font-medium text-fg">Connecting video…</p>
                <p className="mt-1 text-xs text-fg-subtle">Waiting for the stranger's camera</p>
              </div>
            </div>
          )}

          {/* Stream exists but no frames yet */}
          {remoteStream && !remoteVideoPlaying && (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center px-6">
              <div className="pointer-events-auto max-w-sm rounded-2xl border border-white/[0.12] bg-black/65 px-5 py-4 text-center text-white shadow-2xl backdrop-blur-xl">
                <p className="text-sm font-medium">Connecting video…</p>
                <p className="mt-1 text-xs text-white/65">Waiting for video frames from the other camera</p>
              </div>
            </div>
          )}

          {/* Local PiP */}
          <div
            onClick={() => setPip(p => !p)}
            className="absolute bottom-4 right-4 cursor-pointer overflow-hidden rounded-2xl border border-white/[0.16] shadow-[0_20px_50px_-20px_rgba(0,0,0,0.95)] transition-all hover:scale-[1.02]"
            style={{ width: pip ? "38%" : isMobile ? "28%" : "150px", aspectRatio: "16/9" }}
          >
            {camOff ? (
              <div className="grid h-full w-full place-items-center bg-white/[0.06] backdrop-blur-md">
                <User size={22} className="text-fg-subtle" />
              </div>
            ) : (
              <video ref={localRef} autoPlay playsInline muted className="h-full w-full" style={{ objectFit: "cover" }} />
            )}
            <span className="absolute left-1.5 top-1.5 rounded-md bg-black/60 px-1.5 py-0.5 text-[11px] font-medium text-white backdrop-blur-sm">You</span>
          </div>

          {/* Live badge */}
          {remoteVideoPlaying && (
            <div className="absolute left-4 top-4 flex items-center gap-1.5 rounded-lg border border-white/[0.12] bg-black/40 px-2.5 py-1 backdrop-blur-md">
              <span className="h-1.5 w-1.5 rounded-full bg-success" />
              <span className="text-[11px] font-medium text-white">Live</span>
            </div>
          )}

          {/* Sound toggle hint */}
          {remoteStream?.getAudioTracks().length ? (
            <div className="absolute right-4 top-4 rounded-lg border border-white/[0.12] bg-black/40 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur-md">
              {remoteAudioEnabled ? "Sound on" : "Sound off · Tap 🔈 to enable"}
            </div>
          ) : null}

          {/* Error banner */}
          {callError && (
            <div className={cx(
              "absolute left-1/2 top-4 flex max-w-xs -translate-x-1/2 items-center gap-2 rounded-xl border px-4 py-3 backdrop-blur-xl",
              callError.includes("denied") ? "border-danger/50 bg-danger/20 text-danger" : "border-warning/45 bg-warning/15 text-warning"
            )}>
              <AlertTriangle size={16} className="shrink-0" />
              <span className="text-xs font-medium">{callError}</span>
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="flex shrink-0 flex-wrap items-center justify-center gap-2.5 border-t border-white/[0.08] bg-white/[0.04] px-3 py-3 backdrop-blur-2xl">
          <CtrlButton onClick={toggleMute} label={muted ? "Unmute" : "Mute"} active={muted} tone={muted ? "danger" : "neutral"}>
            {muted ? <MicOff size={19} /> : <Mic size={19} />}
          </CtrlButton>
          <CtrlButton onClick={onEnd} label="End call" tone="danger" size="lg">
            <PhoneOff size={22} />
          </CtrlButton>
          <CtrlButton onClick={() => { onEnd(); onNext?.(); }} label="Next stranger">
            <SkipForward size={19} />
          </CtrlButton>
          {remoteStream?.getAudioTracks().length ? (
            <CtrlButton onClick={() => void toggleRemoteAudio()} label={remoteAudioEnabled ? "Mute stranger" : remoteAudioBlocked ? "Retry sound" : "Enable sound"} active={remoteAudioEnabled}>
              {remoteAudioEnabled ? <Volume2 size={19} /> : <VolumeX size={19} />}
            </CtrlButton>
          ) : null}
          <CtrlButton onClick={toggleCam} label={camOff ? "Turn camera on" : "Turn camera off"} active={camOff} tone={camOff ? "danger" : "neutral"}>
            {camOff ? <VideoOff size={19} /> : <VideoIcon size={19} />}
          </CtrlButton>
          <CtrlButton onClick={() => { setChatOpen(p => !p); setUnread(0); }} label="In-call chat" active={chatOpen}>
            <span className="relative">
              <MessageSquare size={19} />
              {unread > 0 && (
                <span className="absolute -right-2 -top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-danger px-1 text-[10px] font-semibold text-white">
                  {unread > 9 ? "9+" : unread}
                </span>
              )}
            </span>
          </CtrlButton>
          <CtrlButton onClick={toggleFullscreen} label={fullscreen ? "Exit fullscreen" : "Fullscreen"} active={fullscreen}>
            {fullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
          </CtrlButton>
        </div>
      </div>

      {/* ── In-call chat panel ── */}
      <div
        className={cx("flex min-w-0 flex-col overflow-hidden border-white/[0.08] bg-white/[0.03] backdrop-blur-2xl")}
        style={{
          position: isMobile && chatOpen ? "fixed" : "relative",
          inset: isMobile && chatOpen ? 0 : undefined,
          zIndex: isMobile && chatOpen ? 60 : undefined,
          width: isMobile ? (chatOpen ? "100%" : 0) : chatOpen ? 300 : 0,
          transition: "width 0.3s cubic-bezier(.16,1,.3,1)",
          borderLeftWidth: !isMobile && chatOpen ? 1 : 0,
        }}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-white/[0.07] px-4 py-3.5">
          <div className="flex items-center gap-2">
            <MessageSquare size={16} className="text-accent-hover" />
            <span className="whitespace-nowrap text-[13px] font-semibold text-fg">In-call chat</span>
          </div>
          <button onClick={() => setChatOpen(false)} aria-label="Close chat" className="grid h-7 w-7 place-items-center rounded-md text-fg-subtle transition-colors hover:bg-white/5 hover:text-fg">
            <X size={16} />
          </button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-3 py-3">
          {messages.length === 0 && (
            <div className="flex flex-1 flex-col items-center justify-center gap-2.5 px-6 text-center">
              <MessageSquare size={28} className="text-fg-subtle" />
              <span className="text-xs text-fg-subtle">Send a message while on the call</span>
            </div>
          )}
          {messages.map(msg => (
            <div key={msg.id} className={cx("flex flex-col", msg.from === "me" ? "items-end" : "items-start")}>
              <div className={cx(
                "max-w-[85%] break-words px-3 py-2 text-[13px] leading-relaxed",
                msg.from === "me"
                  ? "rounded-2xl rounded-br-md bg-[linear-gradient(180deg,#8280ff_0%,#5a57e6_100%)] text-white shadow-[0_1px_0_rgba(255,255,255,0.22)_inset,0_10px_28px_-12px_rgba(110,107,245,0.85)]"
                  : "rounded-2xl rounded-bl-md border border-white/[0.09] bg-white/[0.055] text-fg backdrop-blur-md"
              )}>
                {msg.text}
              </div>
              <span className="mt-0.5 px-1 text-[10px] text-fg-subtle">{formatTime(msg.ts)}</span>
            </div>
          ))}
          {strangerTyping && (
            <div className="flex items-center gap-1 pl-1">
              {[0,1,2].map(i => <span key={i} className="typing-dot h-1.5 w-1.5 rounded-full bg-fg-subtle" style={{ animationDelay: `${i * 0.15}s` }} />)}
            </div>
          )}
          <div ref={chatEndRef} />
        </div>
        <div className="flex shrink-0 gap-2 border-t border-white/[0.07] px-3 py-2.5">
          <input
            ref={chatInputRef}
            value={chatInput}
            onChange={e => handleChatTyping(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChat(); } }}
            placeholder="Type a message…"
            maxLength={500}
            className="h-9 flex-1 rounded-xl border border-white/[0.09] bg-white/[0.05] px-3 text-[13px] text-fg outline-none transition-colors placeholder:text-fg-subtle focus:border-accent/60 focus:bg-white/[0.07]"
          />
          <button
            onClick={sendChat}
            disabled={!chatInput.trim()}
            aria-label="Send"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[linear-gradient(180deg,#8280ff_0%,#5a57e6_100%)] text-white shadow-[0_1px_0_rgba(255,255,255,0.24)_inset,0_8px_22px_-10px_rgba(110,107,245,0.9)] transition-all hover:brightness-110 active:scale-95 disabled:opacity-30 disabled:hover:brightness-100"
          >
            <Send size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}
