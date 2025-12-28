const express = require('express');
const path = require('path');
const compression = require('compression');
const { ExpressPeerServer } = require('peer');
const fs = require('fs');
// Synchronously write to test.txt
fs.writeFileSync(path.join(__dirname, 'test.txt'), 'This is a test write.\n');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
// Enable gzip compression
app.use(compression());

// Serve static files from the dist directory
const distPath = path.join(__dirname, 'dist');
app.use(express.static(distPath));

// Handle client-side routing - send all requests to index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

const server = app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
  console.log(`Serving static files from: ${distPath}`);
});

const peerServer = ExpressPeerServer(server, {
  debug: true,
  proxied: true,
  generateClientId: () => {
    return new Date()
      .toISOString()
      .slice(-9, -1)
      .replace(':', '')
      .replace('.', '');
  },
});

app.use('/peerjs', peerServer);
