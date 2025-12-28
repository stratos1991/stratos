# PWA Server

Simple Express server to serve the built PWA application.

## Setup

```bash
cd nodeserver
npm install
```

## Usage

### Development Mode (with auto-restart)
```bash
npm run dev
```

### Production Mode
```bash
npm start
```

The server will start on `http://localhost:3000` by default.

## Environment Variables

- `PORT` - Server port (default: 3000)

## Before Running

Make sure you've built the PWA application first:

```bash
cd ..
npm run build
```

This will create the `dist` directory that the server serves.

## Features

- Serves static files from `/dist` directory
- Gzip compression enabled
- Handles client-side routing (SPA support)
- Lightweight and fast
