import { useState, useEffect, Component } from "react";
import type { ReactNode } from "react";
import { v4 as uuidv4 } from "uuid";
import type { AppState, Gender, Pref, UserProfile } from "./types";
import Landing from "./components/Landing";
import Setup from "./components/Setup";
import Chat from "./components/Chat";
import { Button, LogoMark } from "./components/ui";

// Per-tab userId — sessionStorage so each tab gets its own unique ID
// (localStorage would share the same ID across tabs, breaking matchmaking)
function getOrCreateUserId(): string {
  const key = "novachat_uid";
  let id = sessionStorage.getItem(key);
  if (!id) {
    id = uuidv4();
    sessionStorage.setItem(key, id);
  }
  return id;
}
const USER_ID = getOrCreateUserId();

// ── Error Boundary ────────────────────────────────────────────────────────────
class ErrorBoundary extends Component<{ children: ReactNode }, { crashed: boolean; error: string }> {
  state = { crashed: false, error: "" };

  static getDerivedStateFromError(e: Error) {
    return { crashed: true, error: e.message };
  }

  render() {
    if (this.state.crashed) {
      return (
        <div className="relative flex h-full w-full flex-col items-center justify-center gap-4 overflow-hidden bg-bg px-6 text-center">
          <div className="pointer-events-none absolute inset-0 aurora opacity-70" />
          <div className="pointer-events-none absolute inset-0 noise" />
          <div className="relative flex flex-col items-center gap-3 rounded-3xl glass-strong glass-hi px-8 py-7">
            <LogoMark size={40} />
            <p className="text-base font-semibold text-fg">Something went wrong</p>
            <p className="max-w-sm text-sm leading-relaxed text-fg-muted">{this.state.error}</p>
            <Button
              onClick={() => {
                this.setState({ crashed: false, error: "" });
                window.location.reload();
              }}
            >
              Reload app
            </Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

type Screen = { state: AppState; profile: UserProfile | null };

function PageTransition({ children }: { children: ReactNode }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 30);
    return () => clearTimeout(t);
  }, []);

  return (
    <div
      style={{
        height: "100%",
        width: "100%",
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0) scale(1)" : "translateY(14px) scale(0.99)",
        transition: "opacity 0.34s cubic-bezier(.16,1,.3,1), transform 0.34s cubic-bezier(.16,1,.3,1)",
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
        <PageTransition key={screen.state}>
          {screen.state === "landing" && (
            <Landing onStart={() => setScreen((s) => ({ ...s, state: "setup" }))} />
          )}
          {screen.state === "setup" && <Setup onDone={handleSetupDone} />}
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
