import { useState, useRef, useEffect, type FormEvent } from 'react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export function Chat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: userMessage }]);
    setIsLoading(true);
    console.log({ messages });
    try {
      const response = await fetch('/api/claude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: userMessage,
          options: {
            maxTurns: 5,
            isNew: !sessionId,
            sessionName: sessionId,
          },
          stream: true,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to get response');
      }

      // Handle streaming response
      if (!response.body) {
        throw new Error('Response body is null');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let assistantMessage = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();
            if (data === '[DONE]') break;
            if (!data) continue;

            try {
              const message = JSON.parse(data);

              // Extract session_id when present
              if (message.session_id && !sessionId) {
                setSessionId(message.session_id);
              }

              // Handle different message types from the Agent SDK
              if (message.type === 'result') {
                assistantMessage += message.result + '\n';
              } else if (message.type === 'text') {
                assistantMessage += message.content;
              } else if (message.type === 'error') {
                assistantMessage += `Error: ${message.error}\n`;
              }

              // Update the message in real-time
              setMessages((prev) => {
                const newMessages = [...prev];
                const lastMessage = newMessages[newMessages.length - 1];

                if (lastMessage && lastMessage.role === 'assistant') {
                  lastMessage.content = assistantMessage;
                } else {
                  newMessages.push({
                    role: 'assistant',
                    content: assistantMessage,
                  });
                }

                return newMessages;
              });
            } catch (e) {
              console.error('Failed to parse message:', data, e);
            }
          }
        }
      }
    } catch (error) {
      console.error('Chat error:', error);
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: 'Sorry, there was an error processing your request.',
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Messages area */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '20px',
          background: '#0f172a',
        }}
      >
        {messages.length === 0 && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              color: '#64748b',
              fontSize: '14px',
            }}
          >
            Send a message to start chatting with Claude
          </div>
        )}

        {messages.map((msg, idx) => (
          <div
            key={idx}
            style={{
              marginBottom: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
            }}
          >
            <div
              style={{
                fontSize: '12px',
                fontWeight: 'bold',
                color: msg.role === 'user' ? '#60a5fa' : '#a78bfa',
                textTransform: 'uppercase',
              }}
            >
              {msg.role === 'user' ? 'You' : 'Claude'}
            </div>
            <div
              style={{
                padding: '12px 16px',
                background: msg.role === 'user' ? '#1e293b' : '#18181b',
                borderRadius: '8px',
                color: '#e2e8f0',
                fontSize: '14px',
                lineHeight: '1.6',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {msg.content}
            </div>
          </div>
        ))}

        {isLoading && messages[messages.length - 1]?.role === 'user' && (
          <div
            style={{
              marginBottom: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
            }}
          >
            <div
              style={{
                fontSize: '12px',
                fontWeight: 'bold',
                color: '#a78bfa',
                textTransform: 'uppercase',
              }}
            >
              Claude
            </div>
            <div
              style={{
                padding: '12px 16px',
                background: '#18181b',
                borderRadius: '8px',
                color: '#64748b',
                fontSize: '14px',
              }}
            >
              Thinking...
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <form
        onSubmit={handleSubmit}
        style={{
          padding: '16px',
          background: '#1e293b',
          borderTop: '1px solid #334155',
        }}
      >
        <div style={{ display: 'flex', gap: '12px' }}>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type your message..."
            disabled={isLoading}
            style={{
              flex: 1,
              padding: '12px 16px',
              fontSize: '14px',
              borderRadius: '8px',
              border: '1px solid #334155',
              background: '#0f172a',
              color: '#e2e8f0',
              outline: 'none',
            }}
            autoFocus
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            style={{
              padding: '12px 24px',
              fontSize: '14px',
              borderRadius: '8px',
              border: 'none',
              background: isLoading || !input.trim() ? '#334155' : '#3b82f6',
              color: '#fff',
              cursor: isLoading || !input.trim() ? 'not-allowed' : 'pointer',
              fontWeight: '500',
              transition: 'background 0.2s',
            }}
          >
            {isLoading ? 'Sending...' : 'Send'}
          </button>
        </div>
      </form>
    </div>
  );
}
