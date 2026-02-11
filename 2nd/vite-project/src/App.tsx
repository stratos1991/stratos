import { useRef, useState, useEffect, type FormEvent } from "react";
import { useTerminal } from "./hooks/useTerminal";
import { Chat } from "./components/Chat";
import { Input } from "./components/Input";
import "./index.css";

type View = "terminal" | "chat" | "input";

function App() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [activeView, setActiveView] = useState<View>("input");
  const containerRef = useRef<HTMLDivElement>(null);
  const { status, connect, disconnect } = useTerminal(containerRef);

  // Check auth on mount
  useEffect(() => {
    fetch("/api/auth")
      .then((r) => r.json())
      .then((d) => setAuthed(d.authenticated))
      .catch(() => setAuthed(false));
  }, []);

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (res.ok) {
      setAuthed(true);
    } else {
      setError("Wrong password");
    }
  };

  // Loading
  if (authed === null) return null;

  // Login screen
  if (!authed) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
          background: "#1a1a2e",
          color: "#eee",
          fontFamily: "monospace",
        }}
      >
        <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: 12, width: 260 }}>
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
            style={{ padding: "8px 12px", fontSize: 14, borderRadius: 4, border: "1px solid #444", background: "#16213e", color: "#eee" }}
          />
          <button type="submit" style={{ padding: "8px 12px", fontSize: 14, borderRadius: 4, cursor: "pointer" }}>
            Login
          </button>
          {error && <span style={{ color: "#ef4444", fontSize: 13 }}>{error}</span>}
        </form>
      </div>
    );
  }

  // Main view with tabs
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      {/* Header with tabs */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 0,
          background: "#16213e",
          color: "#eee",
          fontFamily: "monospace",
          fontSize: 13,
          borderBottom: "1px solid #0f172a",
        }}
      >
        {/* Tabs */}
        {(["input", "chat", "terminal"] as const).map((view) => (
          <button
            key={view}
            onClick={() => setActiveView(view)}
            style={{
              padding: "10px 20px",
              background: activeView === view ? "#1e293b" : "transparent",
              color: activeView === view ? "#60a5fa" : "#94a3b8",
              border: "none",
              borderBottom: activeView === view ? "2px solid #3b82f6" : "2px solid transparent",
              cursor: "pointer",
              fontSize: 13,
              fontFamily: "monospace",
              fontWeight: activeView === view ? "bold" : "normal",
            }}
          >
            {{ input: "📝 Input", chat: "💬 Chat", terminal: "🖥️ Terminal" }[view]}
          </button>
        ))}

        <div style={{ flex: 1 }} />

        {/* Terminal status (only show when terminal is active) */}
        {activeView === "terminal" && (
          <>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background:
                  status === "connected"
                    ? "#4ade80"
                    : status === "connecting"
                      ? "#facc15"
                      : "#ef4444",
              }}
            />
            <span style={{ margin: "0 8px" }}>{status}</span>
            {status !== "connected" ? (
              <button onClick={connect} style={{ marginRight: 12 }}>Connect</button>
            ) : (
              <button onClick={disconnect} style={{ marginRight: 12 }}>Disconnect</button>
            )}
          </>
        )}
      </div>

      {/* Content area */}
      <div style={{ flex: 1, overflow: "hidden" }}>
        {activeView === "input" ? (
          <Input />
        ) : activeView === "chat" ? (
          <Chat />
        ) : (
          <div ref={containerRef} style={{ height: "100%" }} />
        )}
      </div>
    </div>
  );
}

export default App;
