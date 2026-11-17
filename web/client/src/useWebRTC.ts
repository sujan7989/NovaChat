import { useRef, useState, useCallback } from "react";
import socket, { apiUrl } from "./socket";

// #region debug-point A:media-runtime
const reportVideoDebug = (hypothesisId: string, msg: string, data: Record<string, unknown> = {}) => {
  if (typeof window === "undefined" || !["localhost", "127.0.0.1"].includes(window.location.hostname)) return;
  void fetch("http://127.0.0.1:7778/event", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: "video-call-black-screen", runId: "pre-fix", hypothesisId, location: "web/client/src/useWebRTC.ts", msg: `[DEBUG] ${msg}`, data, ts: Date.now() }) }).catch(() => {});
};
// #endregion

async function getIceServers(): Promise<RTCIceServer[]> {
  // Client-side fallback — multiple providers, all TCP-verified reachable.
  const fallback: RTCIceServer[] = [
    // STUN
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
    { urls: "stun:stun3.l.google.com:19302" },
    { urls: "stun:stun4.l.google.com:19302" },
    { urls: "stun:stun.cloudflare.com:3478" },
    // TURN — freeturn.net (verified TCP-open)
    { urls: "turn:freeturn.net:3478",               username: "free", credential: "free" },
    { urls: "turn:freeturn.net:3478?transport=tcp",  username: "free", credential: "free" },
    { urls: "turns:freeturn.net:5349",              username: "free", credential: "free" },
    // TURN — anyfirewall (verified TCP-open, TLS 443)
    { urls: "turn:turn.anyfirewall.com:443?transport=tcp", username: "webrtc", credential: "webrtc" },
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
    // Start at 480p — reliable through TURN relay, good quality for stranger chat
    { video: { width: { ideal: 854 }, height: { ideal: 480 }, facingMode: "user", frameRate: { ideal: 24 } }, audio: true },
    // Fall back to browser default
    { video: true, audio: true },
    // Audio only as absolute last resort
    { video: false, audio: true },
  ];
  for (const c of attempts) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia(c);
      return stream;
    } catch {
      /* try next */
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
      bundlePolicy: "max-bundle",
      rtcpMuxPolicy: "require",
      // Force relay-only: all media goes through TURN.
      // This eliminates the "connected but black screen" bug where ICE picks
      // a direct/srflx candidate that the NAT cannot actually pass frames through.
      // Cost: ~50ms extra latency. Benefit: works 100% of the time TURN works.
      iceTransportPolicy: "relay",
    });
    reportVideoDebug("B", "peer connection created", { iceServerCount: iceServers.length });

    // Add local tracks
    stream.getTracks().forEach(t => pc.addTrack(t, stream));

    pc.onicecandidate = ({ candidate }) => {
      reportVideoDebug("B", candidate ? "local ICE candidate gathered" : "local ICE gathering completed", candidate ? { type: candidate.type, protocol: candidate.protocol } : {});
      if (candidate) socket.emit("webrtc:ice", { userId, candidate });
    };

    pc.ontrack = (e) => {
      reportVideoDebug("C", "remote media track received", {
        kind: e.track.kind,
        readyState: e.track.readyState,
        muted: e.track.muted,
        streamCount: e.streams.length,
      });

      // Always use the stream from the event if available — it already has
      // all tracks bundled, which avoids race conditions with addTrack.
      const inboundStream = e.streams[0] ?? (() => {
        const rs = remoteStreamRef.current;
        if (!rs.getTrackById(e.track.id)) rs.addTrack(e.track);
        return rs;
      })();

      remoteStreamRef.current = inboundStream;
      setRemoteStream(inboundStream);
      forceRemoteUpdate();

      // Track starts muted until ICE/TURN relay is established and frames flow.
      // Fire another update when it unmutes so the video element retries play().
      e.track.onunmute = () => {
        reportVideoDebug("C", "remote track unmuted — frames flowing", { kind: e.track.kind });
        setRemoteStream(new MediaStream(remoteStreamRef.current.getTracks()));
        forceRemoteUpdate();
      };
      e.track.onended = () => forceRemoteUpdate();
    };

    pc.onconnectionstatechange = () => {
      const s = pc.connectionState;
      reportVideoDebug("B", "peer connection state changed", { connectionState: s, iceConnectionState: pc.iceConnectionState });
      if (s === "connected") {
        setCallError(null);
        // Connection fully up — push a fresh stream ref so VideoCall's
        // useEffect re-fires and calls video.play() now that frames flow.
        if (remoteStreamRef.current.getTracks().length > 0) {
          setRemoteStream(new MediaStream(remoteStreamRef.current.getTracks()));
          forceRemoteUpdate();
        }
      } else if (s === "failed") {
        setCallError("Connection failed — retrying…");
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
      if (pc.iceConnectionState === "connected" || pc.iceConnectionState === "completed") {
        // ICE is up — push a fresh stream ref to trigger video.play() in VideoCall
        if (remoteStreamRef.current.getTracks().length > 0) {
          const updated = new MediaStream(remoteStreamRef.current.getTracks());
          remoteStreamRef.current = updated;
          setRemoteStream(updated);
          forceRemoteUpdate();
        }
      } else if (pc.iceConnectionState === "failed") {
        reportVideoDebug("B", "ICE connection failed, restarting ICE");
        if (pc.signalingState === "stable") {
          pc.createOffer({ iceRestart: true })
            .then(offer => pc.setLocalDescription(offer))
            .then(() => { socket.emit("webrtc:offer", { userId, offer: pc.localDescription }); })
            .catch(() => {});
        } else {
          pc.restartIce();
        }
      } else if (pc.iceConnectionState === "disconnected") {
        setTimeout(() => {
          if (pc.iceConnectionState === "disconnected") {
            reportVideoDebug("B", "ICE still disconnected after timeout, restarting");
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
