import { useRef, useState, useCallback } from "react";
import socket, { apiUrl } from "./socket";

// #region debug-point A:media-runtime
const reportVideoDebug = (hypothesisId: string, msg: string, data: Record<string, unknown> = {}) => {
  if (typeof window === "undefined" || !["localhost", "127.0.0.1"].includes(window.location.hostname)) return;
  void fetch("http://127.0.0.1:7778/event", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: "video-call-black-screen", runId: "pre-fix", hypothesisId, location: "web/client/src/useWebRTC.ts", msg: `[DEBUG] ${msg}`, data, ts: Date.now() }) }).catch(() => {});
};
// #endregion

async function getIceServers(): Promise<RTCIceServer[]> {
  const openRelay: RTCIceServer[] = [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "turn:openrelay.metered.ca:80", username: "openrelayproject", credential: "openrelayproject" },
    { urls: "turn:openrelay.metered.ca:443", username: "openrelayproject", credential: "openrelayproject" },
    { urls: "turn:openrelay.metered.ca:443?transport=tcp", username: "openrelayproject", credential: "openrelayproject" },
    { urls: "turn:openrelay.metered.ca:80?transport=tcp", username: "openrelayproject", credential: "openrelayproject" },
  ];
  try {
    const res = await fetch(apiUrl("/api/ice-servers"));
    if (!res.ok) throw new Error();
    const data = await res.json();
    reportVideoDebug("B", "ICE configuration loaded", { serverCount: data.iceServers?.length ?? 0 });
    return data.iceServers?.length ? data.iceServers : openRelay;
  } catch {
    /* ICE endpoint unavailable — fall back to public relays. */
    reportVideoDebug("B", "ICE configuration fallback selected");
    return openRelay;
  }
}

async function getStream(): Promise<MediaStream> {
  const attempts: MediaStreamConstraints[] = [
    // Try 1080p first
    { video: { width: { ideal: 1920 }, height: { ideal: 1080 }, facingMode: "user", frameRate: { ideal: 30 } }, audio: true },
    // Fall back to 720p
    { video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user", frameRate: { ideal: 30 } }, audio: true },
    // Fall back to 480p
    { video: { width: { ideal: 854 }, height: { ideal: 480 }, facingMode: "user" }, audio: true },
    // Last resort — let browser decide
    { video: true, audio: true },
  ];
  let attempt = 0;
  for (const c of attempts) {
    attempt += 1;
    try {
      const stream = await navigator.mediaDevices.getUserMedia(c);
      reportVideoDebug("A", "local media acquired", { attempt, tracks: stream.getTracks().map((track) => ({ kind: track.kind, readyState: track.readyState, muted: track.muted })) });
      return stream;
    } catch (error: unknown) {
      reportVideoDebug("A", "local media request failed", { attempt, name: error instanceof Error ? error.name : "UnknownError", message: error instanceof Error ? error.message : "Unknown media error" });
      /* Try the next constraint set. */
    }
  }
  throw new Error("Camera/microphone access denied. Please allow permissions.");
}

export function useWebRTC(userId: string) {
  const pcRef             = useRef<RTCPeerConnection | null>(null);
  const localStreamRef    = useRef<MediaStream | null>(null);
  const remoteStreamRef   = useRef<MediaStream>(new MediaStream());
  const pendingCandidates = useRef<RTCIceCandidateInit[]>([]);

  const [localStream,  setLocalStream]  = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [callError,    setCallError]    = useState<string | null>(null);
  // Counter to force re-render when remote stream tracks change
  const [, setRemoteTick] = useState(0);
  const forceRemoteUpdate = () => setRemoteTick(n => n + 1);

  const cleanup = useCallback(() => {
    pcRef.current?.close();
    pcRef.current = null;
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    localStreamRef.current = null;
    remoteStreamRef.current = new MediaStream();
    pendingCandidates.current = [];
    setLocalStream(null);
    setRemoteStream(null);
    setCallError(null);
  }, []);

  // Create a fresh PeerConnection — only call this once per call session
  const buildPC = useCallback(async (stream: MediaStream) => {
    // Close any existing PC first
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    remoteStreamRef.current = new MediaStream();

    const iceServers = await getIceServers();
    const pc = new RTCPeerConnection({
      iceServers,
      iceCandidatePoolSize: 10,
      // bundlePolicy and rtcpMuxPolicy improve mobile compatibility
      bundlePolicy: "max-bundle",
      rtcpMuxPolicy: "require",
    });
    reportVideoDebug("B", "peer connection created", { iceServerCount: iceServers.length });

    // Add local tracks
    stream.getTracks().forEach(t => pc.addTrack(t, stream));

    // Request adaptive video encoding for better quality and reduced lag
    pc.onsignalingstatechange = () => {
      reportVideoDebug("B", "signaling state changed", { state: pc.signalingState });
      if (pc.signalingState === "stable") {
        pc.getSenders().forEach(sender => {
          if (sender.track?.kind === "video") {
            const params = sender.getParameters();
            if (params.encodings?.length) {
              // Adaptive bitrate: higher for better quality, but scales down on poor connections
              params.encodings[0].maxBitrate = 3_000_000; // 3 Mbps for HD quality
              params.encodings[0].maxFramerate = 30;
              sender.setParameters(params).catch(() => {});
            }
          }
        });
      }
    };

    pc.onicecandidate = ({ candidate }) => {
      reportVideoDebug("B", candidate ? "local ICE candidate gathered" : "local ICE gathering completed", candidate ? { type: candidate.type, protocol: candidate.protocol } : {});
      if (candidate) socket.emit("webrtc:ice", { userId, candidate });
    };

    pc.ontrack = (e) => {
      reportVideoDebug("C", "remote media track received", { kind: e.track.kind, readyState: e.track.readyState, muted: e.track.muted, streamCount: e.streams.length });
      const rs = remoteStreamRef.current;
      if (!rs.getTrackById(e.track.id)) {
        rs.addTrack(e.track);
      }
      // Set the stable stream ref once — VideoCall assigns it to srcObject
      setRemoteStream(rs);
      forceRemoteUpdate();
      // When track unmutes (video starts flowing), nudge the video element to play
      e.track.onunmute = () => forceRemoteUpdate();
      e.track.onended  = () => forceRemoteUpdate();
    };

    pc.onconnectionstatechange = () => {
      const s = pc.connectionState;
      reportVideoDebug("B", "peer connection state changed", { connectionState: s, iceConnectionState: pc.iceConnectionState });
      if (s === "connected") setCallError(null);
      else if (s === "failed") {
        setCallError("Connection failed. Please end and restart the call.");
        pc.restartIce();
      }
    };

    pc.oniceconnectionstatechange = () => {
      reportVideoDebug("B", "ICE connection state changed", { state: pc.iceConnectionState });
      if (pc.iceConnectionState === "failed") {
        reportVideoDebug("B", "ICE connection failed, restarting ICE");
        pc.restartIce();
      } else if (pc.iceConnectionState === "disconnected") {
        // Give it a moment before considering it failed - might be temporary network glitch
        setTimeout(() => {
          if (pc.iceConnectionState === "disconnected") {
            reportVideoDebug("B", "ICE connection still disconnected after timeout, restarting");
            pc.restartIce();
          }
        }, 5000);
      }
    };

    pcRef.current = pc;
    return pc;
  }, [userId]);

  const flushCandidates = useCallback(async () => {
    if (!pcRef.current?.remoteDescription) return;
    for (const c of pendingCandidates.current) {
      try {
        await pcRef.current.addIceCandidate(new RTCIceCandidate(c));
      } catch {
        /* Candidate may already be known — ignore. */
      }
    }
    pendingCandidates.current = [];
  }, []);

  // CALLER: get stream → build PC → create offer → send
  const startCall = useCallback(async () => {
    try {
      setCallError(null);
      reportVideoDebug("D", "outgoing video call started");
      const stream = await getStream();
      localStreamRef.current = stream;
      setLocalStream(stream);

      const pc = await buildPC(stream);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      reportVideoDebug("B", "WebRTC offer emitted", { signalingState: pc.signalingState });
      socket.emit("webrtc:offer", { userId, offer });
    } catch (err: unknown) {
      reportVideoDebug("A", "outgoing video call failed", { name: err instanceof Error ? err.name : "UnknownError", message: err instanceof Error ? err.message : "Unknown call error" });
      setCallError(err instanceof Error ? err.message : "Failed to start call");
      // Cleanup failed peer connection to prevent memory leaks
      cleanup();
    }
  }, [userId, buildPC, cleanup]);

  // ANSWERER: get stream → build PC → set remote → create answer → send
  const handleOffer = useCallback(async (offer: RTCSessionDescriptionInit) => {
    try {
      setCallError(null);
      reportVideoDebug("D", "incoming WebRTC offer received", { type: offer.type });
      const stream = await getStream();
      localStreamRef.current = stream;
      setLocalStream(stream);

      const pc = await buildPC(stream);
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      await flushCandidates();

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      reportVideoDebug("B", "WebRTC answer emitted", { signalingState: pc.signalingState });
      socket.emit("webrtc:answer", { userId, answer });
    } catch (err: unknown) {
      reportVideoDebug("B", "incoming WebRTC offer handling failed", { name: err instanceof Error ? err.name : "UnknownError", message: err instanceof Error ? err.message : "Unknown offer error" });
      setCallError(err instanceof Error ? err.message : "Failed to answer call");
      // Cleanup failed peer connection to prevent memory leaks
      cleanup();
    }
  }, [userId, buildPC, flushCandidates, cleanup]);

  const handleAnswer = useCallback(async (answer: RTCSessionDescriptionInit) => {
    try {
      if (!pcRef.current) return;
      if (pcRef.current.signalingState !== "have-local-offer") return;
      await pcRef.current.setRemoteDescription(new RTCSessionDescription(answer));
      reportVideoDebug("B", "WebRTC answer applied", { signalingState: pcRef.current.signalingState });
      await flushCandidates();
    } catch (error: unknown) {
      reportVideoDebug("B", "WebRTC answer application failed", { name: error instanceof Error ? error.name : "UnknownError", message: error instanceof Error ? error.message : "Unknown answer error" });
      /* Answer could not be applied — an ICE restart will recover the call. */
    }
  }, [flushCandidates]);

  const handleIce = useCallback(async (candidate: RTCIceCandidateInit) => {
    try {
      if (!pcRef.current) return;
      if (pcRef.current.remoteDescription) {
        await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate));
      } else {
        pendingCandidates.current.push(candidate);
      }
    } catch (error: unknown) {
      reportVideoDebug("B", "remote ICE candidate rejected", { name: error instanceof Error ? error.name : "UnknownError", message: error instanceof Error ? error.message : "Unknown ICE error" });
      /* Invalid candidate — ignore. */
    }
  }, []);

  const endCall = useCallback(() => {
    socket.emit("webrtc:end", { userId });
    cleanup();
  }, [userId, cleanup]);

  return { localStream, remoteStream, callError, startCall, handleOffer, handleAnswer, handleIce, endCall, cleanup };
}
