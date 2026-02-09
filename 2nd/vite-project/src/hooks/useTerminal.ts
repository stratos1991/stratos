import { useRef, useState, useCallback, useEffect } from "react";
import type { RefObject } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";

type Status = "disconnected" | "connecting" | "connected";

export function useTerminal(containerRef: RefObject<HTMLDivElement | null>) {
  const [status, setStatus] = useState<Status>("disconnected");
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const sseRef = useRef<EventSource | null>(null);
  const sidRef = useRef<string | null>(null);
  const observerRef = useRef<ResizeObserver | null>(null);

  // Cleanup helper
  const cleanup = useCallback(() => {
    observerRef.current?.disconnect();
    observerRef.current = null;
    sseRef.current?.close();
    sseRef.current = null;
    sidRef.current = null;
    termRef.current?.dispose();
    termRef.current = null;
    fitRef.current = null;
  }, []);

  const connect = useCallback(() => {
    if (status === "connecting" || status === "connected") return;

    const container = containerRef.current;
    if (!container) return;

    setStatus("connecting");

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      theme: { background: "#000000" },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(container);
    fit.fit();

    termRef.current = term;
    fitRef.current = fit;

    // SSE connection for server → client output
    const sse = new EventSource("/api/terminal/stream");
    sseRef.current = sse;

    // First event: session ID
    sse.addEventListener("session", (e) => {
      sidRef.current = e.data;
      setStatus("connected");

      // Send initial size
      const dims = fit.proposeDimensions();
      if (dims) {
        fetch("/api/terminal/resize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sid: sidRef.current, cols: dims.cols, rows: dims.rows }),
        });
      }
    });

    // PTY output (base64-encoded)
    sse.addEventListener("message", (e) => {
      const decoded = atob(e.data);
      term.write(decoded);
    });

    // PTY exited
    sse.addEventListener("exit", () => {
      setStatus("disconnected");
      term.write("\r\n\x1b[31m[Session ended]\x1b[0m\r\n");
      sse.close();
      sseRef.current = null;
      sidRef.current = null;
    });

    sse.onerror = () => {
      setStatus("disconnected");
      term.write("\r\n\x1b[31m[Connection closed]\x1b[0m\r\n");
      sse.close();
      sseRef.current = null;
      sidRef.current = null;
    };

    // Terminal input → server via POST
    term.onData((data) => {
      if (sidRef.current) {
        fetch("/api/terminal/input", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sid: sidRef.current, data }),
        });
      }
    });

    // Resize handling
    const observer = new ResizeObserver(() => {
      fit.fit();
      const dims = fit.proposeDimensions();
      if (dims && sidRef.current) {
        fetch("/api/terminal/resize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sid: sidRef.current, cols: dims.cols, rows: dims.rows }),
        });
      }
    });
    observer.observe(container);
    observerRef.current = observer;
  }, [status, containerRef, cleanup]);

  const disconnect = useCallback(() => {
    cleanup();
    setStatus("disconnected");
  }, [cleanup]);

  // Cleanup on unmount
  useEffect(() => cleanup, [cleanup]);

  return { status, connect, disconnect };
}
