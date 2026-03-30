import { useEffect, useRef, useState, useCallback } from "react";
import socket from "../socket";
import { v4 as uuidv4 } from "uuid";

interface ChatMsg { id: string; from: "me" | "stranger"; text: string; ts: number; }

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

export default function VideoCall({ localStream, remoteStream, callError, userId, onEnd, onNext }: Props) {
  const localRef  = useRef<HTMLVideoElement>(null);
  const remoteRef = useRef<HTMLVideoElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);

  const [muted,      setMuted]      = useState(false);
  const [camOff,     setCamOff]     = useState(false);
  const [pip,        setPip]        = useState(false);
  const [entered,    setEntered]    = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [chatOpen,   setChatOpen]   = useState(false);
  const [chatInput,  setChatInput]  = useState("");
  const [messages,   setMessages]   = useState<ChatMsg[]>([]);
  const [unread,     setUnread]     = useState(0);
  const [isMobile,   setIsMobile]   = useState(() => window.innerWidth < 640);
  const [strangerTyping, setStrangerTyping] = useState(false);

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 640);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  useEffect(() => { setTimeout(() => setEntered(true), 30); }, []);

  useEffect(() => {
    if (localRef.current && localStream) {
      localRef.current.srcObject = localStream;
      localRef.current.play().catch(() => {});
    }
  }, [localStream]);

  useEffect(() => {
    const video = remoteRef.current;
    if (!video || !remoteStream) return;
    // Always reassign — tracks may have been added after initial assignment
    video.srcObject = remoteStream;
    video.play().catch(() => {});
  }, [remoteStream]);

  // Aggressively retry play every 800ms until video is actually playing
  useEffect(() => {
    const interval = setInterval(() => {
      const video = remoteRef.current;
      if (!video || !video.srcObject) return;
      if (video.paused || video.readyState < 2) {
        video.play().catch(() => {});
      }
    }, 800);
    return () => clearInterval(interval);
  }, []);

  // Listen for in-call chat messages from stranger
  useEffect(() => {
    const handler = ({ text }: { text: string }) => {
      setMessages(p => [...p, { id: uuidv4(), from: "stranger", text, ts: Date.now() }]);
      if (!chatOpen) setUnread(u => u + 1);
      setStrangerTyping(false);
    };
    const typingHandler = ({ isTyping }: { isTyping: boolean }) => setStrangerTyping(isTyping);
    socket.on("videochat:message", handler);
    socket.on("videochat:typing", typingHandler);
    return () => {
      socket.off("videochat:message", handler);
      socket.off("videochat:typing", typingHandler);
    };
  }, [chatOpen]);

  useEffect(() => {
    if (chatOpen) {
      setUnread(0);
      setTimeout(() => chatInputRef.current?.focus(), 150);
    }
  }, [chatOpen]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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
    typingTimerRef.current = setTimeout(() => {
      socket.emit("videochat:typing", { userId, isTyping: false });
    }, 1500);
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
    const handler = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  return (
    <div
      className={`fixed inset-0 z-50 flex transition-all duration-400 ${entered ? "opacity-100 scale-100" : "opacity-0 scale-95"}`}
      style={{ background: "#000" }}
    >
      {/* ── Video area ── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Remote video */}
        <div className="flex-1 relative overflow-hidden" style={{ background: "radial-gradient(ellipse at 50% 50%,#0d0820 0%,#000 100%)" }}>
          <video ref={remoteRef} autoPlay playsInline
            onLoadedMetadata={e => { (e.target as HTMLVideoElement).play().catch(() => {}); }}
            onCanPlay={e => { (e.target as HTMLVideoElement).play().catch(() => {}); }}
            className="w-full h-full" style={{ objectFit: "cover", background: "#000", imageRendering: "auto" }} />

          {!remoteStream && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-5"
              style={{ background: "rgba(5,5,14,0.97)" }}>
              <div className="relative w-24 h-24 flex items-center justify-center">
                {[0,1,2].map(i => (
                  <div key={i} className="absolute inset-0 rounded-full"
                    style={{ border: "1.5px solid rgba(99,102,241,0.35)", animation: `ripple 2.4s ease-out ${i*0.8}s infinite` }} />
                ))}
                <div className="relative w-24 h-24 rounded-full flex items-center justify-center text-4xl"
                  style={{ background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.3)" }}>
                  📹
                </div>
              </div>
              <div className="text-center">
                <p className="text-white font-bold mb-1">Connecting video...</p>
                <p className="text-slate-400 text-sm">Waiting for stranger's camera</p>
              </div>
              <div className="flex items-center gap-1.5">
                {[0,1,2,3,4].map(i => (
                  <div key={i} className="sound-bar rounded-full" style={{
                    width: 4, height: 24,
                    background: "linear-gradient(to top,#6366f1,#c084fc)",
                    animationDelay: `${i * 0.12}s`,
                  }} />
                ))}
              </div>
            </div>
          )}

          {/* Local PiP */}
          <div onClick={() => setPip(p => !p)}
            className="absolute bottom-4 right-4 rounded-2xl overflow-hidden shadow-2xl cursor-pointer transition-all hover:scale-105"
            style={{
              width: pip ? "38%" : isMobile ? "28%" : "150px", aspectRatio: "16/9",
              border: "2px solid rgba(99,102,241,0.7)",
              boxShadow: "0 8px 32px rgba(0,0,0,0.6),0 0 0 1px rgba(99,102,241,0.2)",
            }}>
            {camOff
              ? <div className="w-full h-full flex items-center justify-center text-3xl" style={{ background: "#0d0d1a" }}>🙈</div>
              : <video ref={localRef} autoPlay playsInline muted className="w-full h-full" style={{ objectFit: "cover" }} />
            }
            <div className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded-md text-xs font-bold text-white"
              style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}>You</div>
          </div>

          {/* HD badge — only show when remote stream has active tracks */}
          {remoteStream && remoteStream.getVideoTracks().length > 0 && (
            <div className="absolute top-4 left-4 flex items-center gap-1.5 px-2.5 py-1 rounded-lg"
              style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(8px)", border: "1px solid rgba(255,255,255,0.1)" }}>
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              <span className="text-xs font-bold text-white">HD Live</span>
            </div>
          )}

          {/* Call error banner */}
          {callError && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-3 rounded-xl max-w-xs text-center"
              style={{ background: callError.includes("denied") ? "rgba(239,68,68,0.25)" : "rgba(251,191,36,0.18)", border: `1px solid ${callError.includes("denied") ? "rgba(239,68,68,0.5)" : "rgba(251,191,36,0.45)"}`, backdropFilter: "blur(12px)" }}>
              <span className="text-lg shrink-0">{callError.includes("denied") ? "🚫" : "⚠️"}</span>
              <span className="text-xs font-bold" style={{ color: callError.includes("denied") ? "#fca5a5" : "#fde68a" }}>{callError}</span>
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="shrink-0 flex items-center justify-center gap-3 py-3 px-3 flex-wrap"
          style={{ background: "rgba(5,5,14,0.97)", backdropFilter: "blur(20px)", borderTop: "1px solid rgba(255,255,255,0.06)" }}>

          {/* Mute */}
          <button onClick={toggleMute}
            className="w-13 h-13 w-12 h-12 rounded-2xl flex items-center justify-center transition-all hover:scale-110 active:scale-95"
            style={{
              background: muted ? "rgba(239,68,68,0.25)" : "rgba(255,255,255,0.08)",
              border: `1px solid ${muted ? "rgba(239,68,68,0.5)" : "rgba(255,255,255,0.1)"}`,
              boxShadow: muted ? "0 0 16px rgba(239,68,68,0.3)" : "none",
            }}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: muted ? "#f87171" : "#94a3b8" }}>
              {muted
                ? <><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /><line x1="3" y1="3" x2="21" y2="21" strokeWidth={2} strokeLinecap="round" /></>
                : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              }
            </svg>
          </button>

          {/* End call */}
          <button onClick={onEnd}
            className="w-14 h-14 rounded-2xl flex items-center justify-center transition-all hover:scale-110 active:scale-95"
            style={{ background: "linear-gradient(135deg,#ef4444,#dc2626)", boxShadow: "0 0 30px rgba(239,68,68,0.5)" }}>
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          {/* Next stranger — end call + skip */}
          <button onClick={() => { onEnd(); onNext?.(); }}
            className="w-12 h-12 rounded-2xl flex items-center justify-center transition-all hover:scale-110 active:scale-95"
            style={{ background: "rgba(99,102,241,0.2)", border: "1px solid rgba(99,102,241,0.4)" }}
            title="Next stranger">
            <svg className="w-5 h-5" style={{ color: "#a5b4fc" }} fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>

          {/* Camera */}
          <button onClick={toggleCam}
            className="w-12 h-12 rounded-2xl flex items-center justify-center transition-all hover:scale-110 active:scale-95"
            style={{
              background: camOff ? "rgba(239,68,68,0.25)" : "rgba(255,255,255,0.08)",
              border: `1px solid ${camOff ? "rgba(239,68,68,0.5)" : "rgba(255,255,255,0.1)"}`,
              boxShadow: camOff ? "0 0 16px rgba(239,68,68,0.3)" : "none",
            }}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: camOff ? "#f87171" : "#94a3b8" }}>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.36a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </button>

          {/* Chat toggle */}
          <button onClick={() => { setChatOpen(p => !p); setUnread(0); }}
            className="w-12 h-12 rounded-2xl flex items-center justify-center transition-all hover:scale-110 active:scale-95 relative"
            style={{
              background: chatOpen ? "rgba(99,102,241,0.3)" : "rgba(255,255,255,0.08)",
              border: `1px solid ${chatOpen ? "rgba(99,102,241,0.6)" : "rgba(255,255,255,0.1)"}`,
              boxShadow: chatOpen ? "0 0 16px rgba(99,102,241,0.4)" : "none",
            }}
            title="In-call chat">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: chatOpen ? "#a5b4fc" : "#94a3b8" }}>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            {unread > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-xs font-black text-white"
                style={{ background: "linear-gradient(135deg,#6366f1,#ec4899)", boxShadow: "0 0 8px rgba(99,102,241,0.6)" }}>
                {unread > 9 ? "9+" : unread}
              </span>
            )}
          </button>

          {/* Fullscreen */}
          <button onClick={toggleFullscreen}
            className="w-12 h-12 rounded-2xl flex items-center justify-center transition-all hover:scale-110 active:scale-95"
            style={{
              background: fullscreen ? "rgba(99,102,241,0.25)" : "rgba(255,255,255,0.08)",
              border: `1px solid ${fullscreen ? "rgba(99,102,241,0.5)" : "rgba(255,255,255,0.1)"}`,
              boxShadow: fullscreen ? "0 0 16px rgba(99,102,241,0.3)" : "none",
            }}
            title={fullscreen ? "Exit fullscreen" : "Fullscreen"}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: fullscreen ? "#a5b4fc" : "#94a3b8" }}>
              {fullscreen
                ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25" />
                : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
              }
            </svg>
          </button>
        </div>
      </div>

      {/* ── In-call chat panel ── */}
      <div style={{
        // Mobile: full-screen overlay. Desktop: side panel.
        position: isMobile && chatOpen ? "fixed" : "relative",
        inset: isMobile && chatOpen ? 0 : undefined,
        zIndex: isMobile && chatOpen ? 60 : undefined,
        width: isMobile ? (chatOpen ? "100%" : 0) : (chatOpen ? 300 : 0),
        minWidth: 0,
        overflow: "hidden",
        transition: "width 0.3s cubic-bezier(.16,1,.3,1)",
        background: "rgba(8,8,20,0.98)",
        borderLeft: !isMobile ? "1px solid rgba(99,102,241,0.2)" : "none",
        display: "flex",
        flexDirection: "column",
      }}>
        {/* Panel header */}
        <div style={{
          padding: "14px 16px", borderBottom: "1px solid rgba(255,255,255,0.06)",
          display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 28, height: 28, borderRadius: 8, background: "linear-gradient(135deg,#6366f1,#8b5cf6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>💬</div>
            <span style={{ color: "#e2e8f0", fontWeight: 700, fontSize: 14, whiteSpace: "nowrap" }}>In-call Chat</span>
          </div>
          <button onClick={() => setChatOpen(false)}
            style={{ color: "#475569", fontSize: 20, lineHeight: 1, background: "none", border: "none", cursor: "pointer", padding: 4 }}>×</button>
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflowY: "auto", padding: "12px 12px", display: "flex", flexDirection: "column", gap: 8, minHeight: 0 }}>
          {messages.length === 0 && (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, opacity: 0.4 }}>
              <span style={{ fontSize: 32 }}>💬</span>
              <span style={{ color: "#64748b", fontSize: 12, textAlign: "center" }}>Send a message while on the call</span>
            </div>
          )}
          {messages.map(msg => (
            <div key={msg.id} style={{ display: "flex", flexDirection: "column", alignItems: msg.from === "me" ? "flex-end" : "flex-start" }}>
              <div style={{
                maxWidth: "85%", padding: "8px 12px", borderRadius: msg.from === "me" ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
                background: msg.from === "me" ? "linear-gradient(135deg,#6366f1,#8b5cf6)" : "rgba(99,102,241,0.15)",
                border: msg.from === "me" ? "none" : "1px solid rgba(99,102,241,0.2)",
                color: "#e2e8f0", fontSize: 13, lineHeight: 1.5, wordBreak: "break-word",
                boxShadow: msg.from === "me" ? "0 4px 12px rgba(99,102,241,0.3)" : "none",
              }}>
                {msg.text}
              </div>
              <span style={{ color: "#334155", fontSize: 10, marginTop: 2, paddingLeft: 4, paddingRight: 4 }}>{formatTime(msg.ts)}</span>
            </div>
          ))}
          {strangerTyping && (
            <div style={{ display: "flex", gap: 4, alignItems: "center", paddingLeft: 4 }}>
              {[0,1,2].map(i => (
                <div key={i} className="typing-dot rounded-full" style={{ width: 6, height: 6, background: "#818cf8", animationDelay: `${i * 0.2}s` }} />
              ))}
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Input */}
        <div style={{ padding: "10px 12px", borderTop: "1px solid rgba(255,255,255,0.06)", flexShrink: 0, display: "flex", gap: 8 }}>
          <input
            ref={chatInputRef}
            value={chatInput}
            onChange={e => handleChatTyping(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChat(); } }}
            placeholder="Type a message..."
            maxLength={500}
            style={{
              flex: 1, padding: "8px 12px", borderRadius: 12, fontSize: 13, color: "#e2e8f0",
              background: "rgba(255,255,255,0.05)", border: "1px solid rgba(99,102,241,0.25)",
              outline: "none", caretColor: "#818cf8", whiteSpace: "nowrap",
            }}
            onFocus={e => { e.target.style.borderColor = "rgba(99,102,241,0.6)"; }}
            onBlur={e => { e.target.style.borderColor = "rgba(99,102,241,0.25)"; }}
          />
          <button onClick={sendChat} disabled={!chatInput.trim()}
            style={{
              width: 36, height: 36, borderRadius: 10, border: "none", cursor: chatInput.trim() ? "pointer" : "not-allowed",
              background: chatInput.trim() ? "linear-gradient(135deg,#6366f1,#8b5cf6)" : "rgba(255,255,255,0.05)",
              display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
              boxShadow: chatInput.trim() ? "0 4px 12px rgba(99,102,241,0.4)" : "none",
              transition: "all 0.2s",
            }}>
            <svg style={{ width: 16, height: 16, color: chatInput.trim() ? "white" : "#334155" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
