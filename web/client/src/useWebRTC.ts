import { useRef, useState, useCallback } from "react";
import socket from "./socket";

const SOCKET_URL = import.meta.env.VITE_API_URL || "https://novachat-production-57d2.up.railway.app";

async function getIceServers(): Promise<RTCIceServer[]> {
  const base: RTCIceServer[] = [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
  ];
  try {
    const res = await fetch(`${SOCKET_URL}/api/ice-servers`);
    if (!res.ok) throw new Error();
    const data = await res.json();
    return data.iceServers || base;
  } catch {
    return base;
  }
}

async function getStream(): Promise<MediaStream> {
  const attempts: MediaStreamConstraints[] = [
    { video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" }, audio: true },
    { video: true, audio: true },
  ];
  for (const c of attempts) {
    try { return await navigator.mediaDevices.getUserMedia(c); } catch {}
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
    const pc = new RTCPeerConnection({ iceServers, iceCandidatePoolSize: 10 });

    // Add local tracks
    stream.getTracks().forEach(t => pc.addTrack(t, stream));

    pc.onicecandidate = ({ candidate }) => {
      if (candidate) socket.emit("webrtc:ice", { userId, candidate });
    };

    pc.ontrack = (e) => {
      const rs = remoteStreamRef.current;
      if (!rs.getTrackById(e.track.id)) {
        rs.addTrack(e.track);
      }
      // Spread into a new MediaStream so React sees a new reference and re-renders,
      // but all tracks come from the stable remoteStreamRef so srcObject stays consistent
      setRemoteStream(new MediaStream(rs.getTracks()));
      e.track.onunmute = () => {
        setRemoteStream(new MediaStream(remoteStreamRef.current.getTracks()));
      };
    };

    pc.onconnectionstatechange = () => {
      const s = pc.connectionState;
      if (s === "connected") setCallError(null);
      else if (s === "failed") {
        setCallError("Connection failed. Please end and restart the call.");
        pc.restartIce();
      }
    };

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === "failed") pc.restartIce();
    };

    pcRef.current = pc;
    return pc;
  }, [userId]);

  const flushCandidates = useCallback(async () => {
    if (!pcRef.current?.remoteDescription) return;
    for (const c of pendingCandidates.current) {
      try { await pcRef.current.addIceCandidate(new RTCIceCandidate(c)); } catch {}
    }
    pendingCandidates.current = [];
  }, []);

  // CALLER: get stream → build PC → create offer → send
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
    } catch (err: unknown) {
      setCallError(err instanceof Error ? err.message : "Failed to start call");
    }
  }, [userId, buildPC]);

  // ANSWERER: get stream → build PC → set remote → create answer → send
  const handleOffer = useCallback(async (offer: RTCSessionDescriptionInit) => {
    try {
      setCallError(null);
      const stream = await getStream();
      localStreamRef.current = stream;
      setLocalStream(stream);

      const pc = await buildPC(stream);
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      await flushCandidates();

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit("webrtc:answer", { userId, answer });
    } catch (err: unknown) {
      setCallError(err instanceof Error ? err.message : "Failed to answer call");
    }
  }, [userId, buildPC, flushCandidates]);

  const handleAnswer = useCallback(async (answer: RTCSessionDescriptionInit) => {
    try {
      if (!pcRef.current) return;
      if (pcRef.current.signalingState !== "have-local-offer") return;
      await pcRef.current.setRemoteDescription(new RTCSessionDescription(answer));
      await flushCandidates();
    } catch {}
  }, [flushCandidates]);

  const handleIce = useCallback(async (candidate: RTCIceCandidateInit) => {
    try {
      if (!pcRef.current) return;
      if (pcRef.current.remoteDescription) {
        await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate));
      } else {
        pendingCandidates.current.push(candidate);
      }
    } catch {}
  }, []);

  const endCall = useCallback(() => {
    socket.emit("webrtc:end", { userId });
    cleanup();
  }, [userId, cleanup]);

  return { localStream, remoteStream, callError, startCall, handleOffer, handleAnswer, handleIce, endCall, cleanup };
}
