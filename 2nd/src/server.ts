// src/server.ts
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import express, { Request, Response, NextFunction } from 'express';
import { setupTerminalRoutes } from './terminal-handler';
import { query } from '@anthropic-ai/claude-agent-sdk';

const app = express();
const port = process.env.PORT || 3000;
const PASSWORD = process.env.LOGIN_PASSWORD || 'a';

// In-memory token store
const validTokens = new Set<string>();

app.use(express.json());

// Login endpoint
app.post('/api/login', (req: Request, res: Response) => {
  const { password } = req.body;
  if (password !== PASSWORD) {
    return res.status(401).json({ error: 'Invalid password' });
  }
  const token = crypto.randomBytes(32).toString('hex');
  validTokens.add(token);
  res.cookie('token', token, {
    httpOnly: true,
    sameSite: 'strict',
    maxAge: 24 * 60 * 60 * 1000,
  });
  res.json({ ok: true });
});

// Auth check endpoint
app.get('/api/auth', (req: Request, res: Response) => {
  const token = req.cookies?.token || parseCookies(req.headers.cookie)['token'];
  res.json({ authenticated: validTokens.has(token) });
});

// Protect API routes (except login/auth)
function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const token = parseCookies(req.headers.cookie)['token'];
  if (!validTokens.has(token)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

app.use('/api', authMiddleware);

// Claude Agent SDK endpoint
app.post('/api/claude', async (req: Request, res: Response) => {
  try {
    const { prompt, options = {}, stream = false } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    const storageDir = path.join(process.cwd(), 'storage');
    await fs.promises.mkdir(storageDir, { recursive: true });

    const nodeBin = process.execPath;
    const claudeCli =
      '/var/www/vhosts/stratostsitouras.gr/claude-code-rhel8/claude-code/cli.js';

    const queryOptions = {
      model: 'sonnet' as const,
      cwd: storageDir,
      allowDangerouslySkipPermissions: true,
      permissionMode: 'bypassPermissions' as const,
      // tools: ['Read', 'Write', 'Edit', 'Glob', 'Grep', 'WebFetch', 'WebSearch'],
      maxTurns: 30,
      ...(options.isNew ? {} : { resume: options.sessionName }),
      pathToClaudeCodeExecutable: claudeCli,
      executable: 'node' as const,
      env: {
        ...process.env,
        PATH: `${path.dirname(nodeBin)}:${process.env.PATH}`,
      },
      // Custom spawn to work around ENOENT in containers (CloudLinux, Docker, etc.)
      spawnClaudeCodeProcess: ({
        args,
        cwd,
        env,
        signal,
      }: {
        command: string;
        args: string[];
        cwd?: string;
        env: Record<string, string | undefined>;
        signal: AbortSignal;
      }) => {
        return spawn(nodeBin, [claudeCli, ...args], {
          cwd,
          env: { ...env, PATH: `${path.dirname(nodeBin)}:${env.PATH || ''}` },
          stdio: ['pipe', 'pipe', 'pipe'],
          signal,
        });
      },
    };

    if (stream) {
      // Set up SSE headers for streaming
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      try {
        for await (const message of query({
          prompt,
          options: queryOptions,
        })) {
          res.write(`data: ${JSON.stringify(message)}\n\n`);
        }
        res.write('data: [DONE]\n\n');
        res.end();
      } catch (error) {
        res.write(
          `data: ${JSON.stringify({ type: 'error', error: error instanceof Error ? error.message : 'Unknown error' })}\n\n`,
        );
        res.end();
      }
    } else {
      // Non-streaming response - collect all messages
      let response = '';
      let sessionId = '';
      let totalCostUSD = '';
      for await (const message of query({ prompt, options: queryOptions })) {
        if (message.session_id) {
          sessionId = message.session_id;
        }
        if (message.type === 'assistant') {
          const content = message.message.content;
          if (Array.isArray(content)) {
            for (const block of content) {
              if (block.type === 'text') {
                response += block.text;
              }
            }
          }
        } else if (message.type === 'result' && message.subtype === 'success') {
          if (message.result) {
            response = message.result;
            totalCostUSD = parseFloat(
              message.total_cost_usd as unknown as string,
            ).toFixed(6);
          }
          break;
        } else if (message.type === 'result' && message.is_error) {
          throw new Error('Claude query failed');
        }
      }
      res.json({ response, sessionId, totalCostUSD });
    }
  } catch (error) {
    console.error('Claude API error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Read entries from storage
app.get('/api/storage', (_req: Request, res: Response) => {
  const filePath = path.join(process.cwd(), 'storage', 'db.txt');
  if (!fs.existsSync(filePath)) {
    return res.json({ entries: [] });
  }
  const raw = fs.readFileSync(filePath, 'utf-8');
  const entries = raw.split('\n\n').filter((e) => e.trim());
  res.json({ entries });
});

// Save text to storage
app.post('/api/storage', (req: Request, res: Response) => {
  const { content } = req.body;
  if (!content) {
    return res.status(400).json({ error: 'Content is required' });
  }
  const storageDir = path.join(process.cwd(), 'storage');
  fs.mkdirSync(storageDir, { recursive: true });
  const filePath = path.join(storageDir, 'db.txt');
  const entry = `[${new Date().toISOString()}] ${content}\n\n`;
  fs.appendFileSync(filePath, entry, 'utf-8');
  res.json({ ok: true, content: entry });
});

// Delete entry from storage by content match
app.delete('/api/storage', (req: Request, res: Response) => {
  const { entry } = req.body;
  if (!entry) {
    return res.status(400).json({ error: 'Entry content is required' });
  }
  const filePath = path.join(process.cwd(), 'storage', 'db.txt');
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'No entries found' });
  }
  const raw = fs.readFileSync(filePath, 'utf-8');
  const entries = raw.split('\n\n').filter((e) => e.trim());
  const index = entries.findIndex((e) => e.trim() === entry.trim());
  if (index === -1) {
    return res.status(404).json({ error: 'Entry not found' });
  }
  entries.splice(index, 1);
  const updated = entries.length > 0 ? entries.join('\n\n') + '\n\n' : '';
  fs.writeFileSync(filePath, updated, 'utf-8');
  res.json({ ok: true, entries });
});

// Terminal SSE + POST routes (must be after auth middleware)
setupTerminalRoutes(app, validTokens);

app.get('/api/aigenerated', (_req: Request, res: Response) => {
  const filePath = path.join(process.cwd(), 'storage', 'aigenerated.html');
  if (!fs.existsSync(filePath)) {
    return res.json({ error: 'no aigenerated.html file found' });
  }
  res.sendFile(filePath);
});

// Serve Vite build output (co-located in dist/)
app.use(express.static(__dirname));

// SPA fallback
app.get('/{*splat}', (_req, res) => {
  res.sendFile(path.resolve(__dirname, 'index.html'));
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});

// Simple cookie parser (avoids extra dependency)
function parseCookies(header?: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!header) return cookies;
  for (const pair of header.split(';')) {
    const [key, ...rest] = pair.trim().split('=');
    if (key) cookies[key] = rest.join('=');
  }
  return cookies;
}
