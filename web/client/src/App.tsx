import { useState, useEffect, Component } from "react";
import type { ReactNode } from "react";
import { v4 as uuidv4 } from "uuid";
import type { AppState, Gender, Pref, UserProfile } from "./types";
import Landing from "./components/Landing";
import Setup from "./components/Setup";
import Chat from "./components/Chat";

// Per-tab userId — sessionStorage so each tab gets its own unique ID
// (localStorage would share the same ID across tabs, breaking matchmaking)
function getOrCreateUserId(): string {
  const key = "anonlink_uid";
  let id = sessionStorage.getItem(key);
  if (!id) { id = uuidv4(); sessionStorage.setItem(key, id); }
  return id;
}
const USER_ID = getOrCreateUserId();

// ── Error Boundary ────────────────────────────────────────────────────────────
class ErrorBoundary extends Component<{ children: ReactNode }, { crashed: boolean; error: string }> {
  state = { crashed: false, error: "" };
  static getDerivedStateFromError(e: Error) { return { crashed: true, error: e.message }; }
  render() {
    if (this.state.crashed) return (
      <div style={{
        height: "100%", width: "100%", display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", gap: 16,
        background: "radial-gradient(ellipse at 50% 50%, #0e0618 0%, #06030f 100%)",
      }}>
        <div style={{ fontSize: 64 }}>💥</div>
        <p style={{ color: "#e2e8f0", fontWeight: 700, fontSize: 18 }}>Something went wrong</p>
        <p style={{ color: "#475569", fontSize: 13, maxWidth: 320, textAlign: "center" }}>{this.state.error}</p>
        <button onClick={() => { this.setState({ crashed: false, error: "" }); window.location.reload(); }}
          style={{
            padding: "10px 28px", borderRadius: 12, fontWeight: 700, color: "white", cursor: "pointer", border: "none",
            background: "linear-gradient(135deg,#6366f1,#8b5cf6)", boxShadow: "0 4px 20px rgba(99,102,241,0.4)",
          }}>
          Reload App
        </button>
      </div>
    );
    return this.props.children;
  }
}

type Screen = { state: AppState; profile: UserProfile | null };

function PageTransition({ children, id }: { children: React.ReactNode; id: string }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(false);
    const t = setTimeout(() => setVisible(true), 30);
    return () => clearTimeout(t);
  }, [id]);

  return (
    <div
      style={{
        height: "100%", width: "100%",
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0) scale(1)" : "translateY(18px) scale(0.985)",
        transition: "opacity 0.38s cubic-bezier(.16,1,.3,1), transform 0.38s cubic-bezier(.16,1,.3,1)",
      }}
    >
      {children}
    </div>
  );
}

export default function App() {
  const [screen, setScreen] = useState<Screen>({ state: "landing", profile: null });

  const handleSetupDone = (gender: Gender, pref: Pref, interests: string[], languages: string[], vibes: string[]) => {
    setScreen({ state: "chatting", profile: { userId: USER_ID, gender, pref, interests, languages, vibes } });
  };

  return (
    <ErrorBoundary>
      <div style={{ height: "100%", width: "100%" }}>
        <PageTransition id={screen.state}>
          {screen.state === "landing" && (
            <Landing onStart={() => setScreen(s => ({ ...s, state: "setup" }))} />
          )}
          {screen.state === "setup" && (
            <Setup onDone={handleSetupDone} />
          )}
          {screen.state === "chatting" && screen.profile && (
            <ErrorBoundary>
              <Chat profile={screen.profile} onStop={() => setScreen({ state: "landing", profile: null })} />
            </ErrorBoundary>
          )}
        </PageTransition>
      </div>
    </ErrorBoundary>
  );
}
