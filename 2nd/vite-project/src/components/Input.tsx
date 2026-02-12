import { useEffect, useRef, useState, useMemo, useCallback } from 'react';

/** Format `[2026-02-12T23:15:21.833Z] text` → `[12/2 01:15:21] text` (local) */
function formatEntry(entry: string): string {
  const m = entry.match(/^\[(\d{4}-[^\]]+)\]\s?/);
  if (!m) return entry;
  const d = new Date(m[1]);
  if (isNaN(d.getTime())) return entry;
  const local = `${d.getDate()}/${d.getMonth() + 1} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
  return `[${local}]${entry.slice(m[0].length - 1)}`;
}

/** Export entry as .ics calendar event (1-hour duration) */
function exportToCalendar(entry: string) {
  const m = entry.match(/^\[(\d{4}-[^\]]+)\]\s?(.*)/s);
  if (!m) return;
  const start = new Date(m[1]);
  if (isNaN(start.getTime())) return;
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  const fmt = (d: Date) =>
    d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const uid = `${Date.now()}@viteapp`;
  const summary = m[2].trim().split('\n')[0]; // first line as title
  const desc = m[2].trim();
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//ViteApp//EN',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTART:${fmt(start)}`,
    `DTEND:${fmt(end)}`,
    `SUMMARY:${summary}`,
    `DESCRIPTION:${desc.replace(/\n/g, '\\n')}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
  const blob = new Blob([ics], { type: 'text/calendar' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'event.ics';
  a.click();
  URL.revokeObjectURL(url);
}

/** Extract unique #tags from all entries */
function extractTags(entries: string[]): string[] {
  const tagSet = new Set<string>();
  for (const entry of entries) {
    const matches = entry.match(/#[\w-]+/g);
    if (matches) matches.forEach((t) => tagSet.add(t));
  }
  return [...tagSet].sort();
}

/** Find the #partial being typed at the cursor position, if any */
function getTagContext(
  text: string,
  cursorPos: number,
): { tag: string; start: number } | null {
  // Walk backwards from cursor to find '#'
  let i = cursorPos - 1;
  while (i >= 0 && /[\w-]/.test(text[i])) i--;
  if (i >= 0 && text[i] === '#') {
    return { tag: text.slice(i, cursorPos), start: i };
  }
  return null;
}

/**
 * Measure pixel position of a character offset inside a textarea
 * by mirroring content into a hidden div with identical styling.
 */
function getCaretPixelPos(
  textarea: HTMLTextAreaElement,
  offset: number,
): { top: number; left: number } {
  const mirror = document.createElement('div');
  const style = getComputedStyle(textarea);
  const props = [
    'fontFamily',
    'fontSize',
    'fontWeight',
    'letterSpacing',
    'wordSpacing',
    'lineHeight',
    'paddingTop',
    'paddingRight',
    'paddingBottom',
    'paddingLeft',
    'borderTopWidth',
    'borderRightWidth',
    'borderBottomWidth',
    'borderLeftWidth',
    'boxSizing',
    'whiteSpace',
    'wordWrap',
    'overflowWrap',
  ] as const;
  mirror.style.position = 'absolute';
  mirror.style.visibility = 'hidden';
  mirror.style.whiteSpace = 'pre-wrap';
  mirror.style.wordWrap = 'break-word';
  mirror.style.width = style.width;
  for (const p of props) mirror.style[p] = style[p];

  const before = textarea.value.slice(0, offset);
  mirror.textContent = before;
  const marker = document.createElement('span');
  marker.textContent = '\u200b'; // zero-width space
  mirror.appendChild(marker);

  document.body.appendChild(mirror);
  const rect = textarea.getBoundingClientRect();
  const markerRect = marker.getBoundingClientRect();
  const top =
    markerRect.top -
    mirror.getBoundingClientRect().top +
    rect.top -
    textarea.scrollTop;
  const left =
    markerRect.left -
    mirror.getBoundingClientRect().left +
    rect.left -
    textarea.scrollLeft;
  document.body.removeChild(mirror);
  return { top, left };
}

export function Input() {
  const [text, setText] = useState('');
  const [entries, setEntries] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [cursorPos, setCursorPos] = useState(0);
  const [dropdownPos, setDropdownPos] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    fetch('/api/storage')
      .then((r) => r.json())
      .then((d) => setEntries(d.entries))
      .catch(() => {});
  }, []);

  const allTags = useMemo(() => extractTags(entries), [entries]);

  const tagCtx = useMemo(
    () => getTagContext(text, cursorPos),
    [text, cursorPos],
  );

  const suggestions = useMemo(() => {
    if (!tagCtx || allTags.length === 0) return [];
    const partial = tagCtx.tag.toLowerCase();
    return allTags.filter(
      (t) => t.toLowerCase().startsWith(partial) && t.toLowerCase() !== partial,
    );
  }, [tagCtx, allTags]);

  // Recompute dropdown position when tag context changes
  useEffect(() => {
    if (suggestions.length > 0 && tagCtx && textareaRef.current) {
      setDropdownPos(getCaretPixelPos(textareaRef.current, tagCtx.start));
    } else {
      setDropdownPos(null);
    }
  }, [suggestions, tagCtx]);

  const insertTag = useCallback(
    (tag: string) => {
      if (!tagCtx) return;
      const before = text.slice(0, tagCtx.start);
      const after = text.slice(cursorPos);
      const newText = before + tag + ' ' + after;
      setText(newText);
      setDropdownPos(null);
      // Restore focus and cursor position after React re-render
      const newPos = tagCtx.start + tag.length + 1;
      requestAnimationFrame(() => {
        textareaRef.current?.focus();
        textareaRef.current?.setSelectionRange(newPos, newPos);
        setCursorPos(newPos);
      });
    },
    [tagCtx, text, cursorPos],
  );

  const handleCursorChange = useCallback(
    (e: React.SyntheticEvent<HTMLTextAreaElement>) => {
      setCursorPos(e.currentTarget.selectionStart ?? 0);
    },
    [],
  );

  const handleSubmit = async () => {
    if (!text.trim()) return;
    setSaving(true);
    const optimisticEntry = `[${new Date().toISOString()}] ${text}`;
    setEntries((prev) => [...prev, optimisticEntry]);
    setText('');
    try {
      const res = await fetch('/api/storage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: text }),
      });
      if (res.ok) {
        const data = await res.json();
        // Replace optimistic entry with server response
        setEntries((prev) => [...prev.slice(0, -1), data.content.trim()]);
      }
    } catch {
      // Offline: optimistic entry stays, background sync will replay the POST
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (entry: string) => {
    if (!navigator.onLine) {
      alert('Cannot delete on network down');
      return;
    }
    // Optimistic removal
    setEntries((prev) => {
      const idx = prev.indexOf(entry);
      return idx === -1 ? prev : prev.filter((_, i) => i !== idx);
    });
    try {
      const res = await fetch('/api/storage', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entry }),
      });
      if (res.ok) {
        const data = await res.json();
        setEntries(data.entries);
      } else {
        // Revert on server error — refetch
        const refetch = await fetch('/api/storage');
        if (refetch.ok) {
          const data = await refetch.json();
          setEntries(data.entries);
        }
      }
    } catch {
      alert('Cannot delete on network failure');
      // Network failed mid-request — revert
      setEntries((prev) => {
        const idx = prev.indexOf(entry);
        if (idx !== -1) return prev;
        return [...prev, entry].sort();
      });
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: '#1a1a2e',
      }}
    >
      {/* Entries list */}
      <div style={{ flex: 1, overflow: 'auto', padding: '16px 16px 0' }}>
        <div
          style={{
            maxWidth: 600,
            margin: '0 auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          {entries.map((entry, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 8,
                padding: '8px 12px',
                fontSize: 13,
                fontFamily: 'monospace',
                background: '#16213e',
                color: '#cbd5e1',
                borderRadius: 6,
                border: '1px solid #1e293b',
              }}
            >
              <div
                style={{
                  flex: 1,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {formatEntry(entry)}
              </div>
              <button
                onClick={() => exportToCalendar(entry)}
                title="Export to calendar"
                style={{
                  flexShrink: 0,
                  padding: '2px 8px',
                  fontSize: 12,
                  background: 'transparent',
                  color: '#93c5fd',
                  border: '1px solid #93c5fd',
                  borderRadius: 4,
                  cursor: 'pointer',
                }}
              >
                &#128197;
              </button>
              <button
                onClick={() => handleDelete(entry)}
                title="Delete entry"
                style={{
                  flexShrink: 0,
                  padding: '2px 8px',
                  fontSize: 12,
                  background: 'transparent',
                  color: '#ef4444',
                  border: '1px solid #ef4444',
                  borderRadius: 4,
                  cursor: 'pointer',
                }}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Input area pinned to bottom */}
      <div style={{ padding: 16, borderTop: '1px solid #1e293b' }}>
        <div
          style={{
            maxWidth: 600,
            margin: '0 auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            position: 'relative',
          }}
        >
          <textarea
            ref={textareaRef}
            autoFocus
            enterKeyHint="send"
            placeholder="Type here... use #tags"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setCursorPos(e.target.selectionStart ?? 0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
              }
            }}
            onKeyUp={handleCursorChange}
            onClick={handleCursorChange}
            style={{
              width: '100%',
              height: 100,
              padding: 12,
              fontSize: 14,
              fontFamily: 'monospace',
              background: '#16213e',
              color: '#eee',
              border: '1px solid #334155',
              borderRadius: 8,
              resize: 'vertical',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />

          {/* Tag suggestions dropdown */}
          {dropdownPos && suggestions.length > 0 && (
            <div
              style={{
                position: 'fixed',
                bottom: window.innerHeight - dropdownPos.top,
                left: dropdownPos.left + 9,
                background: '#1e293b',
                border: '1px solid #334155',
                borderRadius: 6,
                padding: '4px 0',
                zIndex: 1000,
                maxHeight: 160,
                overflowY: 'auto',
                minWidth: 120,
                boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
              }}
            >
              {suggestions.map((tag) => (
                <div
                  key={tag}
                  onMouseDown={(e) => {
                    e.preventDefault(); // keep textarea focus
                    insertTag(tag);
                  }}
                  style={{
                    padding: '6px 12px',
                    fontSize: 13,
                    fontFamily: 'monospace',
                    color: '#93c5fd',
                    cursor: 'pointer',
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.background = '#334155')
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.background = 'transparent')
                  }
                >
                  {tag}
                </div>
              ))}
            </div>
          )}

          <button
            onClick={handleSubmit}
            disabled={saving || !text.trim()}
            style={{
              padding: '10px 20px',
              fontSize: 14,
              fontFamily: 'monospace',
              background: saving || !text.trim() ? '#334155' : '#3b82f6',
              color: '#eee',
              border: 'none',
              borderRadius: 6,
              cursor: saving || !text.trim() ? 'not-allowed' : 'pointer',
              alignSelf: 'flex-end',
            }}
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
