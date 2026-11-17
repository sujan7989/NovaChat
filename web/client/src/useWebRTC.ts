import { useRef, useState, useCallback } from "react";
import socket, { apiUrl } from "./socket";

// #region debug-point A:media-runtime
const reportVideoDebug = (hypothesisId: string, msg: string, data: Record<string, unknown> = {}) => {
  if (typeof window === "undefined" || !["localhost", "127.0.0.1"].includes(window.location.hostname)) return;
  void fetch("http://127.0.0.1:7778/event", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: "video-call-black-screen", runId: "pre-fix", hypothesisId, location: "web/client/src/useWebRTC.ts", msg: `[DEBUG] ${msg}`, data, ts: Date.now() }) }).catch(() => {});
};
// #endregion

async function getIceServers(): Promise<RTCIceServer[]> {
  // Multi-provider fallback — used when /api/ice-servers is unreachable.
  // Covers: Google STUN, Cloudflare STUN, Metered demo TURN, Viagenie TURN.
  const fallback: RTCIceServer[] = [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
    { urls: "stun:stun3.l.google.com:19302" },
    { urls: "stun:stun4.l.google.com:19302" },
    { urls: "stun:stun.cloudflare.com:3478" },
    // Metered demo TURN — most reliable free TURN available without an account
    { urls: "turn:a.relay.metered.ca:80",               username: "83eebabf8b1ceff9bddfd", credential: "2D7JvfkOQtBdYW3R" },
    { urls: "turn:a.relay.metered.ca:80?transport=tcp",  username: "83eebabf8b1ceff9bddfd", credential: "2D7JvfkOQtBdYW3R" },
    { urls: "turn:a.relay.metered.ca:443",              username: "83eebabf8b1ceff9bddfd", credential: "2D7JvfkOQtBdYW3R" },
    { urls: "turns:a.relay.metered.ca:443",             username: "83eebabf8b1ceff9bddfd", credential: "2D7JvfkOQtBdYW3R" },
    { urls: "turns:a.relay.metered.ca:443?transport=tcp", username: "83eebabf8b1ceff9bddfd", credential: "2D7JvfkOQtBdYW3R" },
    // Viagenie public TURN (long-running free server)
    { urls: "turn:numb.viagenie.ca",                    username: "webrtc@live.com",          credential: "muazkh" },
    // OpenRelay as final fallback
    { urls: "turn:openrelay.metered.ca:80",             username: "openrelayproject",         credential: "openrelayproject" },
    { urls: "turn:openrelay.metered.ca:443?transport=tcp", username: "openrelayproject",      credential: "openrelayproject" },
  ];
  try {
    const res = await fetch(apiUrl("/api/ice-servers"));
    if (!res.ok) throw new Error();
    const data = await res.json();
    reportVideoDebug("B", "ICE configuration loaded", { serverCount: data.iceServers?.length ?? 0 });
    return data.iceServers?.length ? data.iceServers : fallback;
  } catch {
    reportVideoDebug("B", "ICE configuration fallback selected");
    return fallback;
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
  const forceRemoteUpdate = useCallback(() => setRemoteTick(n => n + 1), []);

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
      // Always set a new MediaStream wrapper so React sees a changed reference
      // and VideoCall's useEffect([remoteStream]) re-fires to call play().
      const snapshot = new MediaStream(rs.getTracks());
      remoteStreamRef.current = snapshot;
      setRemoteStream(snapshot);
      forceRemoteUpdate();
      // When track unmutes (video starts flowing), nudge the video element to play
      e.track.onunmute = () => {
        const updated = new MediaStream(remoteStreamRef.current.getTracks());
        remoteStreamRef.current = updated;
        setRemoteStream(updated);
        forceRemoteUpdate();
      };
      e.track.onended = () => forceRemoteUpdate();
    };

    pc.onconnectionstatechange = () => {
      const s = pc.connectionState;
      reportVideoDebug("B", "peer connection state changed", { connectionState: s, iceConnectionState: pc.iceConnectionState });
      if (s === "connected") setCallError(null);
      else if (s === "failed") {
        setCallError("Connection failed. Please end and restart the call.");
        // Restart ICE: for the offerer, create and send a new offer with iceRestart
        if (pc.signalingState === "stable") {
          pc.createOffer({ iceRestart: true })
            .then(offer => pc.setLocalDescription(offer))
            .then(() => { socket.emit("webrtc:offer", { userId, offer: pc.localDescription }); })
            .catch(() => {});
        } else {
          pc.restartIce();
        }
      }
    };

    pc.oniceconnectionstatechange = () => {
      reportVideoDebug("B", "ICE connection state changed", { state: pc.iceConnectionState });
      if (pc.iceConnectionState === "failed") {
        reportVideoDebug("B", "ICE connection failed, restarting ICE");
        // Restart ICE: for the offerer, create and send a new offer with iceRestart
        if (pc.signalingState === "stable") {
          pc.createOffer({ iceRestart: true })
            .then(offer => pc.setLocalDescription(offer))
            .then(() => { socket.emit("webrtc:offer", { userId, offer: pc.localDescription }); })
            .catch(() => {});
        } else {
          pc.restartIce();
        }
      } else if (pc.iceConnectionState === "disconnected") {
        // Give it a moment before considering it failed - might be temporary network glitch
        setTimeout(() => {
          if (pc.iceConnectionState === "disconnected") {
            reportVideoDebug("B", "ICE connection still disconnected after timeout, restarting");
            if (pc.signalingState === "stable") {
              pc.createOffer({ iceRestart: true })
                .then(offer => pc.setLocalDescription(offer))
                .then(() => { socket.emit("webrtc:offer", { userId, offer: pc.localDescription }); })
                .catch(() => {});
            } else {
              pc.restartIce();
            }
          }
        }, 5000);
      }
    };

    pcRef.current = pc;
    return pc;
  }, [userId, forceRemoteUpdate]);

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
  // Also handles re-offers from ICE restart without rebuilding the PC.
  const handleOffer = useCallback(async (offer: RTCSessionDescriptionInit) => {
    try {
      setCallError(null);
      reportVideoDebug("D", "incoming WebRTC offer received", { type: offer.type });

      // If a PC already exists and is in a state that can accept a new remote offer
      // (e.g. ICE restart re-offer), answer without rebuilding the PC.
      const existingPC = pcRef.current;
      if (existingPC && existingPC.signalingState !== "closed" && localStreamRef.current) {
        await existingPC.setRemoteDescription(new RTCSessionDescription(offer));
        await flushCandidates();
        const answer = await existingPC.createAnswer();
        await existingPC.setLocalDescription(answer);
        reportVideoDebug("B", "WebRTC re-answer emitted (ICE restart)", { signalingState: existingPC.signalingState });
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
      // Accept answer only in states where we have a pending local offer
      const state = pcRef.current.signalingState;
      if (state !== "have-local-offer" && state !== "have-remote-pranswer") return;
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
