import crypto from 'node:crypto';
import type { Application, Request, Response } from 'express';
import * as pty from 'node-pty';
import type { IPty } from 'node-pty';

const sessions = new Map<string, IPty>();

export function setupTerminalRoutes(app: Application, validTokens: Set<string>) {
  // Auth helper (cookie-based, same as server.ts middleware)
  function authenticate(req: Request, res: Response): boolean {
    const token = parseCookies(req.headers.cookie)['token'];
    if (!validTokens.has(token)) {
      res.status(401).json({ error: 'Unauthorized' });
      return false;
    }
    return true;
  }

  // SSE stream — spawns PTY and pipes output
  app.get('/api/terminal/stream', (req: Request, res: Response) => {
    if (!authenticate(req, res)) return;

    const sid = crypto.randomBytes(16).toString('hex');
    const cwd = process.env.HOME || '/';
    // Passenger/shared hosting may set SHELL to /sbin/nologin — always use /bin/bash or /bin/sh
    const shell = '/bin/bash';
    const fallback = '/bin/sh';
    console.log(`[terminal] spawning session ${sid}: shell=${shell} cwd=${cwd} SHELL=${process.env.SHELL}`);

    let term: IPty;
    try {
      term = pty.spawn(shell, ['--norc', '--noprofile'], {
        name: 'xterm-256color',
        cols: 80,
        rows: 24,
        cwd,
        env: { ...process.env as Record<string, string>, SHELL: shell },
      });
    } catch {
      console.log(`[terminal] ${shell} failed, trying ${fallback}`);
      try {
        term = pty.spawn(fallback, [], {
          name: 'xterm-256color',
          cols: 80,
          rows: 24,
          cwd,
          env: { ...process.env as Record<string, string>, SHELL: fallback },
        });
      } catch (err) {
        console.error(`[terminal] spawn failed:`, err);
        res.status(500).json({ error: 'Failed to spawn terminal' });
        return;
      }
    }

    sessions.set(sid, term);

    // SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    // Send session ID as first event
    res.write(`event: session\ndata: ${sid}\n\n`);

    // Pipe PTY output as data events
    term.onData((data: string) => {
      // Encode as base64 to avoid newline issues in SSE
      const encoded = Buffer.from(data).toString('base64');
      res.write(`data: ${encoded}\n\n`);
    });

    term.onExit(({ exitCode, signal }) => {
      console.log(`[terminal] session ${sid} exited: code=${exitCode} signal=${signal}`);
      res.write(`event: exit\ndata: ${JSON.stringify({ exitCode, signal })}\n\n`);
      res.end();
      sessions.delete(sid);
    });

    // Clean up on client disconnect
    req.on('close', () => {
      sessions.delete(sid);
      try { term.kill(); } catch { /* already dead */ }
    });
  });

  // Write input to PTY
  app.post('/api/terminal/input', (req: Request, res: Response) => {
    if (!authenticate(req, res)) return;

    const { sid, data } = req.body;
    const term = sessions.get(sid);
    if (!term) {
      return res.status(404).json({ error: 'Session not found' });
    }
    term.write(data);
    res.json({ ok: true });
  });

  // Resize PTY
  app.post('/api/terminal/resize', (req: Request, res: Response) => {
    if (!authenticate(req, res)) return;

    const { sid, cols, rows } = req.body;
    const term = sessions.get(sid);
    if (!term) {
      return res.status(404).json({ error: 'Session not found' });
    }
    term.resize(cols, rows);
    res.json({ ok: true });
  });
}

function parseCookies(header?: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!header) return cookies;
  for (const pair of header.split(';')) {
    const [key, ...rest] = pair.trim().split('=');
    if (key) cookies[key] = rest.join('=');
  }
  return cookies;
}
