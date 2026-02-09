# 2nd - Remote Terminal & Claude Chat

Express server with a React frontend providing a web-based terminal and Claude AI chat interface, deployed on CloudLinux (RHEL 8).

## Prerequisites

- Node.js 22+
- Docker (for cross-compiling `node-pty` for RHEL 8)
- Access to the deployment server (`stratostsitouras.gr`)

## Environment Variables

| Variable | Description | Default |
|---|---|---|
| `PORT` | Server port | `3000` |
| `LOGIN_PASSWORD` | Auth password | hardcoded fallback |
| `ANTHROPIC_API_KEY` | Claude API key | — |

## Development

```bash
npm install
npm run dev
```

Runs the server with `tsx watch`. The Vite client dev server proxies `/api` requests to `http://localhost:3000`.

## Build

```bash
npm run deploy
```

This runs `build-deploy.sh` which:

1. **Builds the frontend** — Vite compiles the React app into `dist/`
2. **Bundles the backend** — esbuild bundles `src/server.ts` into `dist/server.js` (all deps except `node-pty` are inlined)
3. **Cross-compiles `node-pty`** — Spins up a `rockylinux:8` Docker container to compile the native `node-pty` module against glibc 2.28 (matching the CloudLinux production server). Output goes to `dist/node_modules/node-pty/`

## Deploy to Production

After building, copy the following to the server:

### 1. Copy `dist/` folder

```bash
rsync -avz dist/ user@stratostsitouras.gr:/var/www/vhosts/stratostsitouras.gr/app/dist/
```

### 2. Copy `claude-code-rhel8`

The Claude Agent SDK needs the Claude Code CLI on the server. This is a standalone copy of `@anthropic-ai/claude-code` that must be present at:

```
/var/www/vhosts/stratostsitouras.gr/claude-code-rhel8/claude-code/cli.js
```

To set this up (first time or when updating Claude Code):

```bash
# On your local machine, prepare the claude-code package for RHEL 8
mkdir -p claude-code-rhel8/claude-code
cp -r node_modules/@anthropic-ai/claude-code/* claude-code-rhel8/claude-code/

# Copy to server
rsync -avz claude-code-rhel8/ user@stratostsitouras.gr:/var/www/vhosts/stratostsitouras.gr/claude-code-rhel8/
```

Make sure `cli.js` is executable:

```bash
ssh user@stratostsitouras.gr "chmod +x /var/www/vhosts/stratostsitouras.gr/claude-code-rhel8/claude-code/cli.js"
```

### 3. Start the server

```bash
ssh user@stratostsitouras.gr "cd /var/www/vhosts/stratostsitouras.gr/app && PORT=3000 LOGIN_PASSWORD=yourpass ANTHROPIC_API_KEY=sk-ant-... node dist/server.js"
```

## Project Structure

```
src/
  server.ts           # Express server (auth, /api/claude, terminal, static files)
  terminal-handler.ts # Terminal SSE + PTY routes
vite-project/
  src/
    App.tsx           # Main app with tab switching (Chat / Terminal)
    components/
      Chat.tsx        # Claude chat UI with streaming
    hooks/
      useTerminal.ts  # xterm.js terminal hook
build.js              # esbuild config for server bundle
build-deploy.sh       # Build + cross-compile script
dist/                 # Production output (after build)
```

## Notes

- The server uses a custom `spawnClaudeCodeProcess` to work around a [known SDK bug](https://github.com/anthropics/claude-code/issues/4383) where `spawn node ENOENT` occurs in containerized environments (CloudLinux, Docker)
- `node-pty` requires cross-compilation because the production server runs RHEL 8 with glibc 2.28
- The `claude-code-rhel8` directory must be updated whenever `@anthropic-ai/claude-code` is upgraded
