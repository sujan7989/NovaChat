import { useRef, useState, useCallback } from "react";
import socket from "./socket";

// Using only reliable STUN servers + no TURN (TURN creds expire)
// WebRTC will work for most users on same network or open NAT
// For symmetric NAT users, we use Google's public STUN
const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
    { urls: "stun:stun3.l.google.com:19302" },
    { urls: "stun:stun4.l.google.com:19302" },
  ],
  iceCandidatePoolSize: 10,
  bundlePolicy: "max-bundle",
  rtcpMuxPolicy: "require",
};

async function getStream(): Promise<MediaStream> {
  const attempts: MediaStreamConstraints[] = [
    { video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" }, audio: true },
    { video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" }, audio: true },
    { video: true, audio: true },
  ];
  for (const c of attempts) {
    try { return await navigator.mediaDevices.getUserMedia(c); } catch {}
  }
  throw new Error("Camera/microphone access denied. Please allow permissions.");
}

export function useWebRTC(userId: string) {
  const pcRef          = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream>(new MediaStream());
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

  const createPC = useCallback(() => {
    pcRef.current?.close();
    const pc = new RTCPeerConnection(ICE_SERVERS);
    remoteStreamRef.current = new MediaStream();

    pc.onicecandidate = ({ candidate }) => {
      if (candidate) socket.emit("webrtc:ice", { userId, candidate });
    };

    // KEY FIX: add each track to a persistent MediaStream ref and update state
    pc.ontrack = (e) => {
      e.track.onunmute = () => {
        remoteStreamRef.current.addTrack(e.track);
        setRemoteStream(new MediaStream(remoteStreamRef.current.getTracks()));
      };
      // Also add immediately in case already unmuted
      remoteStreamRef.current.addTrack(e.track);
      setRemoteStream(new MediaStream(remoteStreamRef.current.getTracks()));
    };

    pc.onconnectionstatechange = () => {
      const s = pc.connectionState;
      if (s === "connected") setCallError(null);
      else if (s === "disconnected") setCallError("Connection unstable...");
      else if (s === "failed") setCallError("Connection failed. End and restart the call.");
    };

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === "failed") pc.restartIce();
    };

    pcRef.current = pc;
    return pc;
  }, [userId]);

  // Flush pending ICE candidates once remote description is set
  const flushCandidates = useCallback(async () => {
    if (!pcRef.current || !pcRef.current.remoteDescription) return;
    for (const c of pendingCandidates.current) {
      try { await pcRef.current.addIceCandidate(c); } catch {}
    }
    pendingCandidates.current = [];
  }, []);

  const startCall = useCallback(async () => {
    try {
      setCallError(null);
      const stream = await getStream();
      localStreamRef.current = stream;
      setLocalStream(stream);

      const pc = createPC();
      stream.getTracks().forEach(t => pc.addTrack(t, stream));

      const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
      await pc.setLocalDescription(offer);
      socket.emit("webrtc:offer", { userId, offer });
    } catch (err: unknown) {
      setCallError(err instanceof Error ? err.message : "Failed to start call");
    }
  }, [userId, createPC]);

  const handleOffer = useCallback(async (offer: RTCSessionDescriptionInit) => {
    try {
      setCallError(null);
      const stream = await getStream();
      localStreamRef.current = stream;
      setLocalStream(stream);

      const pc = createPC();
      stream.getTracks().forEach(t => pc.addTrack(t, stream));

      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      await flushCandidates();

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit("webrtc:answer", { userId, answer });
    } catch (err: unknown) {
      setCallError(err instanceof Error ? err.message : "Failed to answer call");
    }
  }, [userId, createPC, flushCandidates]);

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
        // Buffer until remote description is set
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
