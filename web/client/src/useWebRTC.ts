import { useRef, useState, useCallback } from "react";
import socket from "./socket";

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:global.stun.twilio.com:3478" },
    // Metered TURN — reliable free tier
    {
      urls: "turn:a.relay.metered.ca:80",
      username: "83eebabf8b4cce9d5dbcb649",
      credential: "2D7JvfkOQtBdYW3R",
    },
    {
      urls: "turn:a.relay.metered.ca:80?transport=tcp",
      username: "83eebabf8b4cce9d5dbcb649",
      credential: "2D7JvfkOQtBdYW3R",
    },
    {
      urls: "turn:a.relay.metered.ca:443",
      username: "83eebabf8b4cce9d5dbcb649",
      credential: "2D7JvfkOQtBdYW3R",
    },
    {
      urls: "turn:a.relay.metered.ca:443?transport=tcp",
      username: "83eebabf8b4cce9d5dbcb649",
      credential: "2D7JvfkOQtBdYW3R",
    },
  ],
  iceCandidatePoolSize: 10,
};

// Try HD first, fall back progressively
async function getStream(): Promise<MediaStream> {
  const attempts: MediaStreamConstraints[] = [
    {
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 }, facingMode: "user" },
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    },
    {
      video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" },
      audio: { echoCancellation: true, noiseSuppression: true },
    },
    { video: true, audio: true },
  ];

  for (const constraints of attempts) {
    try {
      return await navigator.mediaDevices.getUserMedia(constraints);
    } catch {}
  }
  throw new Error("Camera/microphone access denied. Please allow permissions and try again.");
}

export function useWebRTC(userId: string) {
  const pcRef           = useRef<RTCPeerConnection | null>(null);
  const localStreamRef  = useRef<MediaStream | null>(null);
  const restartTimer    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const makingOffer     = useRef(false);

  const [localStream,  setLocalStream]  = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [callError,    setCallError]    = useState<string | null>(null);

  const cleanup = useCallback(() => {
    if (restartTimer.current) clearTimeout(restartTimer.current);
    pcRef.current?.close();
    pcRef.current = null;
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    localStreamRef.current = null;
    setLocalStream(null);
    setRemoteStream(null);
    setCallError(null);
  }, []);

  const createPC = useCallback(() => {
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }

    const pc = new RTCPeerConnection(ICE_SERVERS);

    pc.onicecandidate = ({ candidate }) => {
      if (candidate) socket.emit("webrtc:ice", { userId, candidate });
    };

    pc.ontrack = (e) => {
      const stream = e.streams[0];
      if (stream) setRemoteStream(stream);
    };

    pc.onconnectionstatechange = () => {
      const s = pc.connectionState;
      if (s === "connected") {
        setCallError(null);
        if (restartTimer.current) clearTimeout(restartTimer.current);
      } else if (s === "disconnected") {
        setCallError("Connection unstable — trying to reconnect...");
        // Give it 4s to self-recover before ICE restart
        restartTimer.current = setTimeout(async () => {
          if (!pcRef.current || pcRef.current.connectionState === "connected") return;
          try {
            makingOffer.current = true;
            const offer = await pcRef.current.createOffer({ iceRestart: true });
            await pcRef.current.setLocalDescription(offer);
            socket.emit("webrtc:offer", { userId, offer });
          } catch {
            setCallError("Reconnect failed. Please end and restart the call.");
          } finally {
            makingOffer.current = false;
          }
        }, 4000);
      } else if (s === "failed") {
        setCallError("Connection failed. Please end and restart the call.");
      }
    };

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === "failed") {
        pc.restartIce();
      }
    };

    pcRef.current = pc;
    return pc;
  }, [userId]);

  const startCall = useCallback(async () => {
    try {
      setCallError(null);
      const stream = await getStream();
      localStreamRef.current = stream;
      setLocalStream(stream);

      const pc = createPC();
      stream.getTracks().forEach(t => pc.addTrack(t, stream));

      makingOffer.current = true;
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit("webrtc:offer", { userId, offer });
      makingOffer.current = false;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to start call";
      setCallError(msg);
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

      await pc.setRemoteDescription(offer);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit("webrtc:answer", { userId, answer });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to answer call";
      setCallError(msg);
    }
  }, [userId, createPC]);

  const handleAnswer = useCallback(async (answer: RTCSessionDescriptionInit) => {
    try {
      if (!pcRef.current) return;
      // Ignore if we're not in the right state
      if (pcRef.current.signalingState !== "have-local-offer") return;
      await pcRef.current.setRemoteDescription(answer);
    } catch {}
  }, []);

  const handleIce = useCallback(async (candidate: RTCIceCandidateInit) => {
    try {
      if (!pcRef.current) return;
      // Buffer ICE candidates if remote description not set yet
      if (pcRef.current.remoteDescription) {
        await pcRef.current.addIceCandidate(candidate);
      }
    } catch {}
  }, []);

  const endCall = useCallback(() => {
    socket.emit("webrtc:end", { userId });
    cleanup();
  }, [userId, cleanup]);

  return {
    localStream, remoteStream, callError,
    startCall, handleOffer, handleAnswer, handleIce, endCall, cleanup,
  };
}
