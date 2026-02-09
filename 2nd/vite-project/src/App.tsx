import { useRef, useState, useEffect, type FormEvent } from "react";
import { useTerminal } from "./hooks/useTerminal";
import { Chat } from "./components/Chat";
import "./index.css";

type View = "terminal" | "chat";

function App() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [activeView, setActiveView] = useState<View>("chat");
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
        <button
          onClick={() => setActiveView("chat")}
          style={{
            padding: "10px 20px",
            background: activeView === "chat" ? "#1e293b" : "transparent",
            color: activeView === "chat" ? "#60a5fa" : "#94a3b8",
            border: "none",
            borderBottom: activeView === "chat" ? "2px solid #3b82f6" : "2px solid transparent",
            cursor: "pointer",
            fontSize: 13,
            fontFamily: "monospace",
            fontWeight: activeView === "chat" ? "bold" : "normal",
          }}
        >
          💬 Chat
        </button>
        <button
          onClick={() => setActiveView("terminal")}
          style={{
            padding: "10px 20px",
            background: activeView === "terminal" ? "#1e293b" : "transparent",
            color: activeView === "terminal" ? "#60a5fa" : "#94a3b8",
            border: "none",
            borderBottom: activeView === "terminal" ? "2px solid #3b82f6" : "2px solid transparent",
            cursor: "pointer",
            fontSize: 13,
            fontFamily: "monospace",
            fontWeight: activeView === "terminal" ? "bold" : "normal",
          }}
        >
          🖥️ Terminal
        </button>

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
        {activeView === "chat" ? (
          <Chat />
        ) : (
          <div ref={containerRef} style={{ height: "100%" }} />
        )}
      </div>
    </div>
  );
}

export default App;
