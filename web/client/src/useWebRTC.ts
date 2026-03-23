import { useRef, useState, useCallback } from "react";
import socket from "./socket";

const ICE_SERVERS = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
    { urls: "stun:stun3.l.google.com:19302" },
    // Free TURN fallback — handles symmetric NAT (~15% of users)
    { urls: "turn:openrelay.metered.ca:80",      username: "openrelayproject", credential: "openrelayproject" },
    { urls: "turn:openrelay.metered.ca:443",     username: "openrelayproject", credential: "openrelayproject" },
    { urls: "turn:openrelay.metered.ca:443?transport=tcp", username: "openrelayproject", credential: "openrelayproject" },
  ],
};

// High-quality media constraints
const MEDIA_CONSTRAINTS: MediaStreamConstraints = {
  video: {
    width:       { ideal: 1280, min: 640 },
    height:      { ideal: 720,  min: 480 },
    frameRate:   { ideal: 30,   min: 15  },
    facingMode:  "user",
  },
  audio: {
    echoCancellation:    true,
    noiseSuppression:    true,
    autoGainControl:     true,
    sampleRate:          { ideal: 48000 },
    channelCount:        { ideal: 1 },
  },
};

/** Prefer VP9 > VP8 > H264 for video; opus for audio */
function preferCodecs(sdp: string): string {
  // Boost video bitrate hint in SDP
  sdp = sdp.replace(/b=AS:\d+/g, "b=AS:2000");
  return sdp;
}

/** Apply bandwidth constraints on the sender tracks */
async function applyBandwidth(pc: RTCPeerConnection) {
  for (const sender of pc.getSenders()) {
    if (!sender.track) continue;
    const params = sender.getParameters();
    if (!params.encodings) params.encodings = [{}];
    if (sender.track.kind === "video") {
      params.encodings[0].maxBitrate    = 2_000_000; // 2 Mbps
      params.encodings[0].maxFramerate  = 30;
    } else if (sender.track.kind === "audio") {
      params.encodings[0].maxBitrate    = 128_000;   // 128 kbps
    }
    try { await sender.setParameters(params); } catch {}
  }
}

export function useWebRTC(userId: string) {
  const pcRef             = useRef<RTCPeerConnection | null>(null);
  const localStreamRef    = useRef<MediaStream | null>(null);
  const iceRestartTimer   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [localStream,  setLocalStream]  = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [callActive,   setCallActive]   = useState(false);
  const [callError,    setCallError]    = useState<string | null>(null);

  const cleanup = useCallback(() => {
    if (iceRestartTimer.current) clearTimeout(iceRestartTimer.current);
    pcRef.current?.close();
    pcRef.current = null;
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    localStreamRef.current = null;
    setLocalStream(null);
    setRemoteStream(null);
    setCallActive(false);
    setCallError(null);
  }, []);

  const createPC = useCallback(() => {
    const pc = new RTCPeerConnection(ICE_SERVERS);

    pc.onicecandidate = ({ candidate }) => {
      if (candidate) socket.emit("webrtc:ice", { userId, candidate });
    };

    pc.ontrack = (e) => {
      setRemoteStream(e.streams[0] ?? null);
    };

    // Surface connection state to UI + attempt ICE restart on failure
    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      if (state === "failed") {
        setCallError("Connection failed — attempting to reconnect...");
        // ICE restart: renegotiate with new ICE candidates
        iceRestartTimer.current = setTimeout(async () => {
          if (!pcRef.current) return;
          try {
            const offer = await pcRef.current.createOffer({ iceRestart: true });
            await pcRef.current.setLocalDescription(offer);
            socket.emit("webrtc:offer", { userId, offer });
            setCallError(null);
          } catch {
            setCallError("Video call failed. Please try again.");
          }
        }, 1500);
      } else if (state === "disconnected") {
        setCallError("Connection unstable...");
      } else if (state === "connected") {
        setCallError(null);
      }
    };

    pcRef.current = pc;
    return pc;
  }, [userId]);

  const getStream = useCallback(async () => {
    try {
      return await navigator.mediaDevices.getUserMedia(MEDIA_CONSTRAINTS);
    } catch {
      // Fallback to lower constraints if device doesn't support HD
      return await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    }
  }, []);

  const startCall = useCallback(async () => {
    const stream = await getStream();
    localStreamRef.current = stream;
    setLocalStream(stream);

    const pc = createPC();
    stream.getTracks().forEach(t => pc.addTrack(t, stream));

    const offer = await pc.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: true,
    });
    offer.sdp = preferCodecs(offer.sdp!);
    await pc.setLocalDescription(offer);
    socket.emit("webrtc:offer", { userId, offer });

    await applyBandwidth(pc);
    setCallActive(true);
  }, [userId, createPC, getStream]);

  const handleOffer = useCallback(async (offer: RTCSessionDescriptionInit) => {
    const stream = await getStream();
    localStreamRef.current = stream;
    setLocalStream(stream);

    const pc = createPC();
    stream.getTracks().forEach(t => pc.addTrack(t, stream));

    offer.sdp = preferCodecs(offer.sdp!);
    await pc.setRemoteDescription(offer);

    const answer = await pc.createAnswer();
    answer.sdp = preferCodecs(answer.sdp!);
    await pc.setLocalDescription(answer);
    socket.emit("webrtc:answer", { userId, answer });

    await applyBandwidth(pc);
    setCallActive(true);
  }, [userId, createPC, getStream]);

  const handleAnswer = useCallback(async (answer: RTCSessionDescriptionInit) => {
    answer.sdp = preferCodecs(answer.sdp!);
    await pcRef.current?.setRemoteDescription(answer);
    if (pcRef.current) await applyBandwidth(pcRef.current);
  }, []);

  const handleIce = useCallback(async (candidate: RTCIceCandidateInit) => {
    try { await pcRef.current?.addIceCandidate(candidate); } catch {}
  }, []);

  const endCall = useCallback(() => {
    socket.emit("webrtc:end", { userId });
    cleanup();
  }, [userId, cleanup]);

  return {
    localStream, remoteStream, callActive, callError,
    startCall, handleOffer, handleAnswer, handleIce, endCall, cleanup,
  };
}
