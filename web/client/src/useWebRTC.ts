import { useRef, useState, useCallback } from "react";
import socket, { apiUrl } from "./socket";

// ── ICE servers ────────────────────────────────────────────────────────────
// Always fetch from the server — it returns fresh Metered credentials.
// The static fallback below only fires if the server is completely unreachable.
async function getIceServers(): Promise<RTCIceServer[]> {
  // Static fallback using the same Metered workspace (global endpoint).
  // These match the credentials the server already has hardcoded.
  const staticFallback: RTCIceServer[] = [
    { urls: "stun:stun.relay.metered.ca:80" },
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "turn:global.relay.metered.ca:80",                 username: "93c7303126b0252c421f26df", credential: "o0dyuZ/1paS5QxsR" },
    { urls: "turn:global.relay.metered.ca:80?transport=tcp",   username: "93c7303126b0252c421f26df", credential: "o0dyuZ/1paS5QxsR" },
    { urls: "turn:global.relay.metered.ca:443",                username: "93c7303126b0252c421f26df", credential: "o0dyuZ/1paS5QxsR" },
    { urls: "turns:global.relay.metered.ca:443?transport=tcp", username: "93c7303126b0252c421f26df", credential: "o0dyuZ/1paS5QxsR" },
  ];

  try {
    const res = await fetch(apiUrl("/api/ice-servers"), { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (Array.isArray(data.iceServers) && data.iceServers.length > 0) {
      return data.iceServers;
    }
    throw new Error("empty");
  } catch {
    return staticFallback;
  }
}

// ── Camera / mic ───────────────────────────────────────────────────────────
async function getStream(): Promise<MediaStream> {
  const attempts: MediaStreamConstraints[] = [
    { video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" }, audio: true },
    { video: true, audio: true },
  ];
  for (const c of attempts) {
    try { return await navigator.mediaDevices.getUserMedia(c); } catch { /* try next */ }
  }
  throw new Error("Camera/microphone access denied. Please allow permissions.");
}

// ── Hook ───────────────────────────────────────────────────────────────────
export function useWebRTC(userId: string) {
  const pcRef             = useRef<RTCPeerConnection | null>(null);
  const localStreamRef    = useRef<MediaStream | null>(null);
  const pendingCandidates = useRef<RTCIceCandidateInit[]>([]);

  const [localStream,  setLocalStream]  = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [callError,    setCallError]    = useState<string | null>(null);

  // ── cleanup ──────────────────────────────────────────────────────────────
  const cleanup = useCallback(() => {
    pcRef.current?.close();
    pcRef.current = null;
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    localStreamRef.current = null;
    pendingCandidates.current = [];
    setLocalStream(null);
    setRemoteStream(null);
    setCallError(null);
  }, []);

  // ── build RTCPeerConnection ──────────────────────────────────────────────
  const buildPC = useCallback(async (stream: MediaStream) => {
    if (pcRef.current) { pcRef.current.close(); pcRef.current = null; }

    const iceServers = await getIceServers();

    const pc = new RTCPeerConnection({
      iceServers,
      iceCandidatePoolSize: 10,
      bundlePolicy: "max-bundle",
      rtcpMuxPolicy: "require",
      // Do NOT force relay-only — let ICE use all candidate types.
      // Direct (host/srflx) candidates work on same network and are faster.
      // TURN relay (Metered) handles the cases where direct fails.
    });

    stream.getTracks().forEach(t => pc.addTrack(t, stream));

    pc.onicecandidate = ({ candidate }) => {
      if (candidate) socket.emit("webrtc:ice", { userId, candidate });
    };

    pc.ontrack = (e) => {
      // Use the stream that the browser bundled the track into.
      const incoming = e.streams[0] ?? new MediaStream([e.track]);
      setRemoteStream(incoming);

      // onunmute fires when the relay opens and frames actually start flowing.
      e.track.onunmute = () => setRemoteStream(s => s ? new MediaStream(s.getTracks()) : incoming);
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") {
        setCallError(null);
      } else if (pc.connectionState === "failed") {
        setCallError("Connection failed — check your network and retry.");
        // Attempt ICE restart
        if (pc.signalingState === "stable") {
          pc.createOffer({ iceRestart: true })
            .then(o => pc.setLocalDescription(o))
            .then(() => socket.emit("webrtc:offer", { userId, offer: pc.localDescription }))
            .catch(() => {});
        }
      }
    };

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === "failed") {
        if (pc.signalingState === "stable") {
          pc.createOffer({ iceRestart: true })
            .then(o => pc.setLocalDescription(o))
            .then(() => socket.emit("webrtc:offer", { userId, offer: pc.localDescription }))
            .catch(() => {});
        } else {
          pc.restartIce();
        }
      }
    };

    pcRef.current = pc;
    return pc;
  }, [userId]);

  // ── flush buffered ICE candidates ────────────────────────────────────────
  const flushCandidates = useCallback(async () => {
    if (!pcRef.current?.remoteDescription) return;
    for (const c of pendingCandidates.current) {
      try { await pcRef.current.addIceCandidate(new RTCIceCandidate(c)); } catch { /* ignore */ }
    }
    pendingCandidates.current = [];
  }, []);

  // ── CALLER ────────────────────────────────────────────────────────────────
  const startCall = useCallback(async () => {
    try {
      setCallError(null);
      const stream = await getStream();
      localStreamRef.current = stream;
      setLocalStream(stream);
      const pc = await buildPC(stream);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit("webrtc:offer", { userId, offer });
    } catch (err) {
      setCallError(err instanceof Error ? err.message : "Failed to start call");
      cleanup();
    }
  }, [userId, buildPC, cleanup]);

  // ── ANSWERER ──────────────────────────────────────────────────────────────
  const handleOffer = useCallback(async (offer: RTCSessionDescriptionInit) => {
    try {
      setCallError(null);
      // Re-offer (ICE restart) — reuse existing PC if alive
      const existing = pcRef.current;
      if (existing && existing.signalingState !== "closed" && localStreamRef.current) {
        await existing.setRemoteDescription(new RTCSessionDescription(offer));
        await flushCandidates();
        const answer = await existing.createAnswer();
        await existing.setLocalDescription(answer);
        socket.emit("webrtc:answer", { userId, answer });
        return;
      }
      const stream = await getStream();
      localStreamRef.current = stream;
      setLocalStream(stream);
      const pc = await buildPC(stream);
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      await flushCandidates();
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit("webrtc:answer", { userId, answer });
    } catch (err) {
      setCallError(err instanceof Error ? err.message : "Failed to answer call");
      cleanup();
    }
  }, [userId, buildPC, flushCandidates, cleanup]);

  const handleAnswer = useCallback(async (answer: RTCSessionDescriptionInit) => {
    try {
      const pc = pcRef.current;
      if (!pc) return;
      if (pc.signalingState !== "have-local-offer" && pc.signalingState !== "have-remote-pranswer") return;
      await pc.setRemoteDescription(new RTCSessionDescription(answer));
      await flushCandidates();
    } catch { /* ignore */ }
  }, [flushCandidates]);

  const handleIce = useCallback(async (candidate: RTCIceCandidateInit) => {
    try {
      if (!pcRef.current) return;
      if (pcRef.current.remoteDescription) {
        await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate));
      } else {
        pendingCandidates.current.push(candidate);
      }
    } catch { /* ignore */ }
  }, []);

  const endCall = useCallback(() => {
    socket.emit("webrtc:end", { userId });
    cleanup();
  }, [userId, cleanup]);

  return { localStream, remoteStream, callError, startCall, handleOffer, handleAnswer, handleIce, endCall, cleanup };
}
