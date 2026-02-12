# Plan: Add Vite PWA Functionality

## Context

The Vite + React project at `vite-project/` currently has no PWA support. Adding PWA will enable installability and offline caching via `vite-plugin-pwa`, the standard solution for Vite projects.

## Steps

### 1. Install `vite-plugin-pwa`

```bash
cd vite-project && npm install -D vite-plugin-pwa
```

### 2. Update `vite-project/vite.config.ts`

Add `VitePWA` plugin with:

- `registerType: 'autoUpdate'` — auto-update service worker
- `manifest` — app name, theme color, icons
- `workbox.runtimeCaching` — cache API routes with NetworkFirst strategy, static assets with CacheFirst

### 3. Add PWA icons to `vite-project/public/`

- `pwa-192x192.png` and `pwa-512x512.png` — generated as simple placeholder icons (colored squares with text)

### 4. Update `vite-project/index.html`

- Add `<meta name="theme-color">` and `<meta name="description">`
- Add `<link rel="apple-touch-icon">`
- Update `<title>`

### 5. Register the service worker in `vite-project/src/main.tsx`

Import and call `registerSW` from `virtual:pwa-register` for auto-update behavior.

## Files Modified

- `vite-project/package.json` (via npm install)
- `vite-project/vite.config.ts`
- `vite-project/index.html`
- `vite-project/src/main.tsx`
- `vite-project/public/pwa-192x192.png` (new)
- `vite-project/public/pwa-512x512.png` (new)

## Verification

1. `cd vite-project && npm run build` — should succeed and produce `sw.js` in `../dist`
2. `npm run preview` — verify the app loads and the service worker registers in DevTools > Application > Service Workers
3. Check DevTools > Application > Manifest shows correct app info
