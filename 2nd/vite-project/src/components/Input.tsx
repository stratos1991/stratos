import { useState } from "react";

export function Input() {
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!text.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/storage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text }),
      });
      if (res.ok) {
        setText("");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", background: "#1a1a2e" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, width: "90%", maxWidth: 600 }}>
        <textarea
          autoFocus
          placeholder="Type here..."
          value={text}
          onChange={(e) => setText(e.target.value)}
          style={{
            width: "100%",
            height: 200,
            padding: 16,
            fontSize: 16,
            fontFamily: "monospace",
            background: "#16213e",
            color: "#eee",
            border: "1px solid #334155",
            borderRadius: 8,
            resize: "vertical",
            outline: "none",
            boxSizing: "border-box",
          }}
        />
        <button
          onClick={handleSubmit}
          disabled={saving || !text.trim()}
          style={{
            padding: "10px 20px",
            fontSize: 14,
            fontFamily: "monospace",
            background: saving || !text.trim() ? "#334155" : "#3b82f6",
            color: "#eee",
            border: "none",
            borderRadius: 6,
            cursor: saving || !text.trim() ? "not-allowed" : "pointer",
            alignSelf: "flex-end",
          }}
        >
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
    </div>
  );
}
